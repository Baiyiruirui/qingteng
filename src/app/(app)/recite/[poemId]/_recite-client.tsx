'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { BookOpenText, Mic, RotateCcw, Send, Square, Volume2 } from 'lucide-react'
import { SealStamp } from '@/components/SealStamp'
import { safeReturnTo, withReturnTo } from '@/lib/navigation'

type RecitePoem = {
  id: string
  title: string
  author: string
  dynasty: string | null
  lines: string[]
}

type JudgeResult = {
  transcript: string
  audioDuration: number | null
  accuracy: number
  matchedChars: number
  totalChars: number
  missingChars: string[]
  extraChars: string[]
  feedback: string
}

type CaptureState =
  | { phase: 'idle' }
  | { phase: 'recording'; elapsed: number }
  | { phase: 'ready'; audioUrl: string; audioBase64: string; audioBytes: number }
  | { phase: 'submitting'; audioUrl: string }
  | { phase: 'done'; audioUrl: string; result: JudgeResult }
  | { phase: 'error'; message: string }

const TARGET_SAMPLE_RATE = 16_000
const MAX_SECONDS = 20

type WebkitWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext
}

function flattenChunks(chunks: Float32Array[]): Float32Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const result = new Float32Array(length)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

function downsampleBuffer(buffer: Float32Array, inputRate: number, outputRate: number): Float32Array {
  if (outputRate === inputRate) return buffer
  if (outputRate > inputRate) return buffer

  const ratio = inputRate / outputRate
  const newLength = Math.round(buffer.length / ratio)
  const result = new Float32Array(newLength)
  let offsetResult = 0
  let offsetBuffer = 0

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio)
    let accum = 0
    let count = 0
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i]
      count++
    }
    result[offsetResult] = count > 0 ? accum / count : 0
    offsetResult++
    offsetBuffer = nextOffsetBuffer
  }

  return result
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i))
  }
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(view, 36, 'data')
  view.setUint32(40, samples.length * 2, true)

  let offset = 44
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample))
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
    offset += 2
  }

  return new Blob([view], { type: 'audio/wav' })
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      resolve(result.includes(',') ? result.split(',')[1] : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export default function ReciteClient({
  poem,
  imageSrc,
}: {
  poem: RecitePoem
  imageSrc?: string
}) {
  const searchParams = useSearchParams()
  const returnTo = safeReturnTo(searchParams.get('returnTo'))
  const [state, setState] = useState<CaptureState>({ phase: 'idle' })
  const chunksRef = useRef<Float32Array[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const timerRef = useRef<number | null>(null)
  const maxTimerRef = useRef<number | null>(null)
  const startedAtRef = useRef<number>(0)

  function clearTimers() {
    if (timerRef.current) window.clearInterval(timerRef.current)
    if (maxTimerRef.current) window.clearTimeout(maxTimerRef.current)
    timerRef.current = null
    maxTimerRef.current = null
  }

  function resetAudioUrl() {
    if ('audioUrl' in state) URL.revokeObjectURL(state.audioUrl)
  }

  async function startRecording() {
    resetAudioUrl()
    setState({ phase: 'idle' })

    if (!navigator.mediaDevices?.getUserMedia) {
      setState({ phase: 'error', message: '当前浏览器不支持录音。请换 Chrome 或 Edge 再试。' })
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      })
      const AudioContextClass = window.AudioContext || (window as WebkitWindow).webkitAudioContext
      if (!AudioContextClass) throw new Error('AudioContext unavailable')

      const audioContext = new AudioContextClass()
      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      chunksRef.current = []

      processor.onaudioprocess = event => {
        const input = event.inputBuffer.getChannelData(0)
        chunksRef.current.push(new Float32Array(input))
      }
      source.connect(processor)
      processor.connect(audioContext.destination)

      streamRef.current = stream
      audioContextRef.current = audioContext
      sourceRef.current = source
      processorRef.current = processor
      startedAtRef.current = Date.now()
      setState({ phase: 'recording', elapsed: 0 })

      timerRef.current = window.setInterval(() => {
        setState(current => current.phase === 'recording'
          ? { ...current, elapsed: Math.floor((Date.now() - startedAtRef.current) / 1000) }
          : current)
      }, 300)
      maxTimerRef.current = window.setTimeout(() => {
        void stopRecording()
      }, MAX_SECONDS * 1000)
    } catch {
      setState({ phase: 'error', message: '没有拿到麦克风权限，或浏览器阻止了录音。' })
    }
  }

  async function stopRecording() {
    clearTimers()
    processorRef.current?.disconnect()
    sourceRef.current?.disconnect()
    streamRef.current?.getTracks().forEach(track => track.stop())

    const audioContext = audioContextRef.current
    const inputRate = audioContext?.sampleRate ?? 48_000
    await audioContext?.close()

    const flattened = flattenChunks(chunksRef.current)
    if (flattened.length < inputRate * 0.5) {
      setState({ phase: 'error', message: '录音太短了，至少读半句再提交。' })
      return
    }

    const samples = downsampleBuffer(flattened, inputRate, TARGET_SAMPLE_RATE)
    const wav = encodeWav(samples, TARGET_SAMPLE_RATE)
    const audioBase64 = await blobToBase64(wav)
    const audioUrl = URL.createObjectURL(wav)

    setState({
      phase: 'ready',
      audioUrl,
      audioBase64,
      audioBytes: wav.size,
    })
  }

  async function submitRecite() {
    if (state.phase !== 'ready') return
    setState({ phase: 'submitting', audioUrl: state.audioUrl })
    try {
      const res = await fetch('/api/recite/judge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poemId: poem.id,
          audioBase64: state.audioBase64,
          audioBytes: state.audioBytes,
          voiceFormat: 'wav',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '朗读评分失败')
      setState({ phase: 'done', audioUrl: state.audioUrl, result: data as JudgeResult })
    } catch (error) {
      setState({
        phase: 'error',
        message: error instanceof Error ? error.message : '朗读评分失败，请稍后重试。',
      })
    }
  }

  function reset() {
    resetAudioUrl()
    clearTimers()
    setState({ phase: 'idle' })
  }

  const canRecord = state.phase === 'idle' || state.phase === 'error' || state.phase === 'done'
  const pct = state.phase === 'done' ? Math.round(state.result.accuracy * 100) : null

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <section className="relative aspect-video overflow-hidden border-y border-edge bg-paper-block">
        {imageSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc}
            alt={`《${poem.title}》意境图`}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background: imageSrc
              ? 'linear-gradient(90deg, rgba(247,244,236,0.96) 0%, rgba(247,244,236,0.78) 30%, rgba(247,244,236,0.12) 58%, transparent 76%)'
              : 'linear-gradient(110deg, rgba(242,237,224,0.9), rgba(247,244,236,0.7))',
          }}
        />
        <div className="relative flex h-full max-w-[78%] items-center px-5 py-4 sm:max-w-[62%] sm:px-10 sm:py-6">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="hidden sm:block">
              <SealStamp size={42} tilt />
            </div>
            <div>
              <p className="text-xs tracking-[0.24em] text-ink-faint">RECITE</p>
              <h1 className="mt-1 font-serif text-xl leading-snug text-ink sm:text-5xl sm:leading-tight">
                {poem.title}
              </h1>
              <p className="mt-2 text-sm text-ink-mid">
                {poem.dynasty ?? ''} · {poem.author}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.75fr)]">
        <section className="border border-edge bg-white/55 p-6">

          <div className="space-y-3 font-serif text-2xl leading-loose text-ink sm:text-3xl">
            {poem.lines.map((line, index) => (
              <p key={`${line}-${index}`}>{line}</p>
            ))}
          </div>

          <div className="mt-8 border-t border-edge pt-5 text-sm leading-7 text-ink-mid">
            <p>读的时候不必太快。青藤会先听清字句，再给出漏读、误读的提醒。</p>
            <p className="text-ink-faint">当前版本每次最多录 {MAX_SECONDS} 秒，适合读一首短诗或其中四句。</p>
          </div>
        </section>

        <section className="space-y-4">
        <div className="border border-edge bg-paper-block/75 p-5">
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-jade" aria-hidden="true" />
            <h2 className="font-serif text-xl text-ink">朗读练习</h2>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            {canRecord && (
              <button
                onClick={startRecording}
                className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-85"
              >
                <Mic className="h-4 w-4" aria-hidden="true" />
                开始录音
              </button>
            )}
            {state.phase === 'recording' && (
              <button
                onClick={() => void stopRecording()}
                className="inline-flex items-center gap-2 rounded-lg bg-cinnabar px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-85"
              >
                <Square className="h-4 w-4" aria-hidden="true" />
                结束录音
              </button>
            )}
            {(state.phase === 'ready' || state.phase === 'done') && (
              <button
                onClick={reset}
                className="inline-flex items-center gap-2 rounded-lg border border-edge px-4 py-2 text-sm font-medium text-ink-mid transition-colors hover:bg-white/70"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                重录
              </button>
            )}
          </div>

          {state.phase === 'recording' && (
            <div className="mt-5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-cinnabar">正在听你读</span>
                <span className="text-ink-faint">{state.elapsed}s / {MAX_SECONDS}s</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/70">
                <div
                  className="h-full rounded-full bg-cinnabar transition-all"
                  style={{ width: `${Math.min(100, (state.elapsed / MAX_SECONDS) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {(state.phase === 'ready' || state.phase === 'submitting' || state.phase === 'done') && (
            <div className="mt-5 space-y-4">
              <audio src={state.audioUrl} controls className="w-full" />
              {state.phase === 'ready' && (
                <button
                  onClick={() => void submitRecite()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-jade px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-85"
                >
                  <Send className="h-4 w-4" aria-hidden="true" />
                  交给青藤听
                </button>
              )}
              {state.phase === 'submitting' && (
                <p className="text-center text-sm text-ink-faint">青藤正在听写和对齐...</p>
              )}
            </div>
          )}

          {state.phase === 'error' && (
            <p className="mt-5 rounded-lg border border-cinnabar/25 bg-cinnabar/5 px-3 py-2 text-sm text-cinnabar">
              {state.message}
            </p>
          )}
        </div>

        {state.phase === 'done' && (
          <div className="border border-edge bg-white/60 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs tracking-[0.24em] text-cinnabar">RESULT</p>
                <h2 className="font-serif text-2xl text-ink">朗读掌握度 {pct}%</h2>
              </div>
              <span className="rounded-lg border-2 border-cinnabar px-2 py-1 font-kai text-2xl text-cinnabar">
                {pct !== null && pct >= 85 ? '清' : pct !== null && pct >= 60 ? '进' : '习'}
              </span>
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-paper-block">
              <div className="h-full rounded-full bg-jade" style={{ width: `${pct}%` }} />
            </div>

            <div className="mt-5 space-y-4 text-sm leading-7">
              <div>
                <p className="text-xs font-medium text-ink-faint">识别结果</p>
                <p className="mt-1 text-ink">{state.result.transcript || '没有识别到清晰文字'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-ink-faint">青藤说</p>
                <p className="mt-1 text-ink-mid">{state.result.feedback}</p>
              </div>
              {state.result.missingChars.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-cinnabar">留意这些字</p>
                  <p className="mt-1 text-ink">{state.result.missingChars.join('、')}</p>
                </div>
              )}
              {state.result.extraChars.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-ink-faint">识别中多出来的字</p>
                  <p className="mt-1 text-ink-mid">{state.result.extraChars.join('、')}</p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Link
            href={returnTo}
            className="inline-flex items-center gap-2 rounded-lg border border-edge px-4 py-2 text-sm font-medium text-ink-mid transition-colors hover:bg-white/70"
          >
            <BookOpenText className="h-4 w-4" aria-hidden="true" />
            {returnTo.startsWith('/poems') ? '返回诗笺地图' : '返回上一处'}
          </Link>
          <Link
            href={withReturnTo(`/quiz/${poem.id}`, returnTo)}
            className="inline-flex items-center gap-2 rounded-lg border border-edge px-4 py-2 text-sm font-medium text-ink-mid transition-colors hover:bg-white/70"
          >
            青藤考你
          </Link>
        </div>
        </section>
      </div>
    </main>
  )
}
