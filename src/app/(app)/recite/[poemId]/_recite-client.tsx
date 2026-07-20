'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  Headphones,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Send,
  Square,
  Volume2,
} from 'lucide-react'
import { SealStamp } from '@/components/SealStamp'
import {
  LINE_RECORDING_SECONDS,
  POEM_RECORDING_SECONDS,
  WHOLE_CHALLENGE_MAX_CHARS,
} from '@/ai/recite/target'
import { safeReturnTo, withReturnTo } from '@/lib/navigation'

type RecitePoem = {
  id: string
  title: string
  author: string
  dynasty: string | null
  lines: string[]
}

type PracticeMode = 'line' | 'poem'

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
  | { phase: 'preparing'; countdown: number }
  | { phase: 'recording'; elapsed: number }
  | { phase: 'ready'; audioUrl: string; audioBase64: string; audioBytes: number }
  | { phase: 'submitting'; audioUrl: string }
  | { phase: 'done'; audioUrl: string; result: JudgeResult }
  | { phase: 'error'; message: string }

type StandardAudioResponse = {
  audioBase64: string
  codec: 'mp3'
  pinyin: string | null
  text: string
  partIndex: number
  partCount: number
  source: 'tencent'
}

type StandardStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ready' | 'error'
type StandardSource = 'tencent' | 'device' | null

const TARGET_SAMPLE_RATE = 16_000
const PREPARE_SECONDS = 3

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
  if (outputRate === inputRate || outputRate > inputRate) return buffer

  const ratio = inputRate / outputRate
  const result = new Float32Array(Math.round(buffer.length / ratio))
  let offsetResult = 0
  let offsetBuffer = 0

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio)
    let accum = 0
    let count = 0
    for (let index = offsetBuffer; index < nextOffsetBuffer && index < buffer.length; index++) {
      accum += buffer[index]
      count++
    }
    result[offsetResult] = count > 0 ? accum / count : 0
    offsetResult++
    offsetBuffer = nextOffsetBuffer
  }

  return result
}

function writeString(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index++) {
    view.setUint8(offset + index, value.charCodeAt(index))
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

function chineseCharCount(text: string) {
  return (text.match(/[\u3400-\u9fff]/g) ?? []).length
}

function microphoneMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return '麦克风权限被关闭了。请在浏览器地址栏旁允许麦克风后再试。'
  }
  if (name === 'NotFoundError') return '没有找到可用的麦克风，请先连接麦克风。'
  if (name === 'NotReadableError') return '麦克风正被其他应用占用，请关闭占用后再试。'
  return '暂时无法开始录音，请检查麦克风和浏览器权限。'
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
  const [mode, setMode] = useState<PracticeMode>('line')
  const [currentLine, setCurrentLine] = useState(0)
  const [state, setState] = useState<CaptureState>({ phase: 'idle' })
  const [standardStatus, setStandardStatus] = useState<StandardStatus>('idle')
  const [standardSource, setStandardSource] = useState<StandardSource>(null)
  const [standardMessage, setStandardMessage] = useState('')
  const [showPinyin, setShowPinyin] = useState(false)
  const [pinyin, setPinyin] = useState<string | null>(null)
  const [pinyinMessage, setPinyinMessage] = useState('')
  const [standardPart, setStandardPart] = useState({ index: 0, count: 1 })

  const mountedRef = useRef(true)
  const captureRunRef = useRef(0)
  const chunksRef = useRef<Float32Array[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const prepareTimerRef = useRef<number | null>(null)
  const timerRef = useRef<number | null>(null)
  const maxTimerRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const recordedAudioUrlRef = useRef<string | null>(null)
  const recordedAudioRef = useRef<HTMLAudioElement | null>(null)
  const standardAudioRef = useRef<HTMLAudioElement | null>(null)
  const standardRunRef = useRef(0)
  const standardKeyRef = useRef('')
  const standardPartRef = useRef({ index: 0, count: 1 })

  const wholeChars = chineseCharCount(poem.lines.join(''))
  const isLongPoem = wholeChars > WHOLE_CHALLENGE_MAX_CHARS
  const maxSeconds = mode === 'line' ? LINE_RECORDING_SECONDS : POEM_RECORDING_SECONDS
  const practiceKey = `${mode}:${mode === 'line' ? currentLine : 'all'}`

  function clearCaptureTimers() {
    if (prepareTimerRef.current !== null) window.clearInterval(prepareTimerRef.current)
    if (timerRef.current !== null) window.clearInterval(timerRef.current)
    if (maxTimerRef.current !== null) window.clearTimeout(maxTimerRef.current)
    prepareTimerRef.current = null
    timerRef.current = null
    maxTimerRef.current = null
  }

  function stopCaptureHardware() {
    processorRef.current?.disconnect()
    sourceRef.current?.disconnect()
    streamRef.current?.getTracks().forEach(track => track.stop())
    processorRef.current = null
    sourceRef.current = null
    streamRef.current = null
    const audioContext = audioContextRef.current
    audioContextRef.current = null
    if (audioContext && audioContext.state !== 'closed') void audioContext.close()
  }

  function revokeRecordedAudio() {
    recordedAudioRef.current?.pause()
    if (recordedAudioUrlRef.current) URL.revokeObjectURL(recordedAudioUrlRef.current)
    recordedAudioUrlRef.current = null
  }

  function cancelDeviceSpeech() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  }

  function stopStandardAudio(reset = true) {
    standardRunRef.current++
    const audio = standardAudioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    cancelDeviceSpeech()
    standardKeyRef.current = ''
    standardPartRef.current = { index: 0, count: 1 }
    if (reset && mountedRef.current) {
      setStandardStatus('idle')
      setStandardSource(null)
      setStandardMessage('')
      setStandardPart({ index: 0, count: 1 })
    }
  }

  function resetCapture(nextState: CaptureState = { phase: 'idle' }) {
    captureRunRef.current++
    clearCaptureTimers()
    stopCaptureHardware()
    revokeRecordedAudio()
    if (mountedRef.current) setState(nextState)
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      captureRunRef.current++
      clearCaptureTimers()
      stopCaptureHardware()
      revokeRecordedAudio()
      standardAudioRef.current?.pause()
      cancelDeviceSpeech()
      standardRunRef.current++
    }
  }, [])

  useEffect(() => {
    if (!showPinyin || mode !== 'line') return
    setPinyinMessage('正在获取云端拼音...')
    void loadCloudPart({ partIndex: 0, autoplay: false, fallbackOnError: false })
  }, [showPinyin, mode, currentLine])

  async function beginCapture(stream: MediaStream, runId: number) {
    if (runId !== captureRunRef.current || !mountedRef.current) {
      stream.getTracks().forEach(track => track.stop())
      return
    }

    try {
      const AudioContextClass = window.AudioContext || (window as WebkitWindow).webkitAudioContext
      if (!AudioContextClass) throw new Error('AudioContext unavailable')
      const audioContext = new AudioContextClass()
      await audioContext.resume()
      if (runId !== captureRunRef.current || !mountedRef.current) {
        await audioContext.close()
        stream.getTracks().forEach(track => track.stop())
        return
      }
      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      chunksRef.current = []
      processor.onaudioprocess = event => {
        chunksRef.current.push(new Float32Array(event.inputBuffer.getChannelData(0)))
      }
      source.connect(processor)
      processor.connect(audioContext.destination)

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
      }, maxSeconds * 1000)
    } catch {
      stopCaptureHardware()
      if (runId === captureRunRef.current && mountedRef.current) {
        setState({ phase: 'error', message: '录音设备启动失败，请刷新页面后再试。' })
      }
    }
  }

  async function startRecording() {
    if (mode === 'poem' && isLongPoem) {
      setState({
        phase: 'error',
        message: `这首诗有 ${wholeChars} 个字，建议先逐句跟读；整首评分适合 ${WHOLE_CHALLENGE_MAX_CHARS} 字以内的诗。`,
      })
      return
    }

    resetCapture()
    stopStandardAudio()
    recordedAudioRef.current?.pause()
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({ phase: 'error', message: '当前浏览器不支持录音，请换 Chrome 或 Edge 再试。' })
      return
    }

    const runId = captureRunRef.current
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      })
      if (runId !== captureRunRef.current || !mountedRef.current) {
        stream.getTracks().forEach(track => track.stop())
        return
      }

      streamRef.current = stream
      let countdown = PREPARE_SECONDS
      setState({ phase: 'preparing', countdown })
      prepareTimerRef.current = window.setInterval(() => {
        countdown--
        if (countdown <= 0) {
          if (prepareTimerRef.current !== null) window.clearInterval(prepareTimerRef.current)
          prepareTimerRef.current = null
          void beginCapture(stream, runId)
          return
        }
        setState({ phase: 'preparing', countdown })
      }, 1000)
    } catch (error) {
      if (runId === captureRunRef.current && mountedRef.current) {
        setState({ phase: 'error', message: microphoneMessage(error) })
      }
    }
  }

  async function stopRecording() {
    clearCaptureTimers()
    const audioContext = audioContextRef.current
    const inputRate = audioContext?.sampleRate ?? 48_000
    processorRef.current?.disconnect()
    sourceRef.current?.disconnect()
    streamRef.current?.getTracks().forEach(track => track.stop())
    processorRef.current = null
    sourceRef.current = null
    streamRef.current = null
    audioContextRef.current = null
    if (audioContext && audioContext.state !== 'closed') await audioContext.close()

    const flattened = flattenChunks(chunksRef.current)
    if (flattened.length < inputRate * 0.5) {
      setState({ phase: 'error', message: '录音太短了，至少读半句再提交。' })
      return
    }

    const samples = downsampleBuffer(flattened, inputRate, TARGET_SAMPLE_RATE)
    const wav = encodeWav(samples, TARGET_SAMPLE_RATE)
    const audioBase64 = await blobToBase64(wav)
    const audioUrl = URL.createObjectURL(wav)
    recordedAudioUrlRef.current = audioUrl
    if (!mountedRef.current) {
      URL.revokeObjectURL(audioUrl)
      return
    }
    setState({ phase: 'ready', audioUrl, audioBase64, audioBytes: wav.size })
  }

  async function submitRecite() {
    if (state.phase !== 'ready') return
    const runId = captureRunRef.current
    setState({ phase: 'submitting', audioUrl: state.audioUrl })
    try {
      const response = await fetch('/api/recite/judge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poemId: poem.id,
          mode,
          lineIndex: currentLine,
          audioBase64: state.audioBase64,
          audioBytes: state.audioBytes,
          voiceFormat: 'wav',
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? '朗读评分失败')
      if (runId !== captureRunRef.current || !mountedRef.current) return
      setState({ phase: 'done', audioUrl: state.audioUrl, result: data as JudgeResult })
    } catch (error) {
      if (runId !== captureRunRef.current || !mountedRef.current) return
      setState({
        phase: 'error',
        message: error instanceof Error ? error.message : '朗读评分失败，请稍后重试。',
      })
    }
  }

  function deviceSpeechText() {
    if (mode === 'line') return `${poem.lines[currentLine] ?? ''}。`
    return poem.lines.map((line, index) =>
      `${line}${index === poem.lines.length - 1 || index % 2 === 1 ? '。' : '，'}`
    ).join('')
  }

  function playDeviceSpeech(message: string) {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      setStandardStatus('error')
      setStandardSource(null)
      setStandardMessage('当前浏览器也不支持设备朗读，请稍后再试。')
      return
    }
    cancelDeviceSpeech()
    const runId = ++standardRunRef.current
    const utterance = new SpeechSynthesisUtterance(deviceSpeechText())
    utterance.lang = 'zh-CN'
    utterance.rate = 0.82
    const voice = window.speechSynthesis.getVoices().find(item => item.lang.toLowerCase().startsWith('zh'))
    if (voice) utterance.voice = voice
    utterance.onend = () => {
      if (mountedRef.current && runId === standardRunRef.current) setStandardStatus('ready')
    }
    utterance.onerror = () => {
      if (mountedRef.current && runId === standardRunRef.current) {
        setStandardStatus('error')
        setStandardMessage('设备朗读没有成功，请稍后再试。')
      }
    }
    standardKeyRef.current = practiceKey
    setStandardSource('device')
    setStandardMessage(message)
    setStandardStatus('playing')
    setPinyin(null)
    if (showPinyin) setPinyinMessage('设备朗读不提供可靠拼音，本次不展示拼音。')
    window.speechSynthesis.speak(utterance)
  }

  async function loadCloudPart({
    partIndex,
    autoplay,
    fallbackOnError,
  }: {
    partIndex: number
    autoplay: boolean
    fallbackOnError: boolean
  }): Promise<boolean> {
    const runId = ++standardRunRef.current
    const requestedKey = practiceKey
    setStandardStatus('loading')
    setStandardMessage('正在准备 AI 示范音...')
    try {
      const query = new URLSearchParams({
        poemId: poem.id,
        mode,
        lineIndex: String(currentLine),
        partIndex: String(partIndex),
      })
      const response = await fetch(`/api/recite/standard?${query.toString()}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? '云端示范音暂时不可用')
      if (runId !== standardRunRef.current || requestedKey !== practiceKey) return false
      const result = data as StandardAudioResponse
      const audio = standardAudioRef.current
      if (!audio) throw new Error('音频播放器尚未准备好')

      standardKeyRef.current = practiceKey
      standardPartRef.current = { index: result.partIndex, count: result.partCount }
      setStandardPart({ index: result.partIndex, count: result.partCount })
      setStandardSource('tencent')
      setStandardMessage('腾讯云 AI 示范音')
      setPinyin(result.pinyin)
      setPinyinMessage(result.pinyin
        ? ''
        : '云端没有返回完整拼音，本次不展示，避免出现不准确内容。')
      audio.src = `data:audio/${result.codec};base64,${result.audioBase64}`
      audio.load()

      if (autoplay) {
        recordedAudioRef.current?.pause()
        await audio.play()
        setStandardStatus('playing')
      } else {
        setStandardStatus('ready')
      }
      return true
    } catch (error) {
      if (runId !== standardRunRef.current) return false
      const message = error instanceof Error ? error.message : '云端示范音暂时不可用'
      setPinyin(null)
      setPinyinMessage('云端暂未提供可靠拼音，本次不展示拼音。')
      if (fallbackOnError) {
        playDeviceSpeech(`${message}，已改用设备朗读，音色可能因设备而不同。`)
      } else {
        setStandardStatus('error')
        setStandardSource(null)
        setStandardMessage(message)
      }
      return false
    }
  }

  async function toggleStandardAudio() {
    if (state.phase === 'preparing' || state.phase === 'recording') return
    recordedAudioRef.current?.pause()

    if (standardStatus === 'playing') {
      if (standardSource === 'tencent') standardAudioRef.current?.pause()
      if (standardSource === 'device') window.speechSynthesis.pause()
      setStandardStatus('paused')
      return
    }
    if (standardStatus === 'paused' && standardKeyRef.current === practiceKey) {
      if (standardSource === 'tencent') await standardAudioRef.current?.play()
      if (standardSource === 'device') window.speechSynthesis.resume()
      setStandardStatus('playing')
      return
    }
    const loadedAudio = standardAudioRef.current
    if (
      standardStatus === 'ready' &&
      standardSource === 'tencent' &&
      standardKeyRef.current === practiceKey &&
      loadedAudio?.src &&
      !loadedAudio.ended
    ) {
      recordedAudioRef.current?.pause()
      await loadedAudio.play()
      setStandardStatus('playing')
      return
    }

    stopStandardAudio(false)
    await loadCloudPart({ partIndex: 0, autoplay: true, fallbackOnError: true })
  }

  async function replayStandardAudio() {
    if (state.phase === 'preparing' || state.phase === 'recording') return
    stopStandardAudio(false)
    await loadCloudPart({ partIndex: 0, autoplay: true, fallbackOnError: true })
  }

  async function onStandardEnded() {
    if (standardSource !== 'tencent') return
    const next = standardPartRef.current.index + 1
    if (next < standardPartRef.current.count) {
      await loadCloudPart({ partIndex: next, autoplay: true, fallbackOnError: true })
      return
    }
    setStandardStatus('ready')
  }

  async function togglePinyin() {
    if (state.phase === 'preparing' || state.phase === 'recording' || state.phase === 'submitting') return
    const next = !showPinyin
    setShowPinyin(next)
    if (!next) return
    if (mode === 'poem') {
      setPinyin(null)
      setPinyinMessage('整首挑战可能分段，请切到“逐句跟读”查看与当前句对应的拼音。')
      return
    }
    if (!pinyin || standardKeyRef.current !== practiceKey) {
      setPinyinMessage('正在获取云端拼音...')
    }
  }

  function changeMode(nextMode: PracticeMode) {
    if (nextMode === mode) return
    resetCapture()
    stopStandardAudio()
    setMode(nextMode)
    setPinyin(null)
    setPinyinMessage('')
  }

  function selectLine(index: number) {
    if (index === currentLine) return
    resetCapture()
    stopStandardAudio()
    setCurrentLine(index)
    setPinyin(null)
    setPinyinMessage('')
  }

  const canRecord = state.phase === 'idle' || state.phase === 'error' || state.phase === 'done'
  const interactionLocked = state.phase === 'preparing'
    || state.phase === 'recording'
    || state.phase === 'submitting'
  const recordingLocked = standardStatus === 'playing' || standardStatus === 'loading'
  const pct = state.phase === 'done' ? Math.round(state.result.accuracy * 100) : null

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <audio ref={standardAudioRef} className="hidden" onEnded={() => void onStandardEnded()} />

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
              ? 'linear-gradient(90deg, rgba(247,244,236,0.97) 0%, rgba(247,244,236,0.82) 32%, rgba(247,244,236,0.14) 60%, transparent 78%)'
              : 'linear-gradient(110deg, rgba(242,237,224,0.9), rgba(247,244,236,0.7))',
          }}
        />
        <div className="relative flex h-full max-w-[80%] items-center px-5 py-4 sm:max-w-[62%] sm:px-10 sm:py-6">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="hidden sm:block"><SealStamp size={42} tilt /></div>
            <div>
              <p className="text-xs tracking-[0.24em] text-ink-faint">RECITE</p>
              <h1 className="mt-1 font-serif text-xl leading-snug text-ink sm:text-5xl sm:leading-tight">
                {poem.title}
              </h1>
              <p className="mt-2 text-sm text-ink-mid">{poem.dynasty ?? ''} · {poem.author}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.75fr)]">
        <section className="border border-edge bg-white/55 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge pb-5">
            <div className="inline-flex rounded-lg border border-edge bg-paper-block p-1" aria-label="朗读模式">
              <button
                type="button"
                onClick={() => changeMode('line')}
                disabled={interactionLocked}
                aria-pressed={mode === 'line'}
                className={`rounded-md px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${mode === 'line' ? 'bg-jade text-white' : 'text-ink-mid hover:bg-white/70'}`}
              >
                逐句跟读
              </button>
              <button
                type="button"
                onClick={() => changeMode('poem')}
                disabled={interactionLocked}
                aria-pressed={mode === 'poem'}
                className={`rounded-md px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${mode === 'poem' ? 'bg-jade text-white' : 'text-ink-mid hover:bg-white/70'}`}
              >
                整首挑战
              </button>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={showPinyin}
              onClick={() => void togglePinyin()}
              disabled={interactionLocked}
              className="inline-flex items-center gap-2 text-sm text-ink-mid disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className={`relative h-5 w-9 rounded-full transition-colors ${showPinyin ? 'bg-jade' : 'bg-edge'}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${showPinyin ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
              </span>
              拼音
            </button>
          </div>

          {mode === 'line' && (
            <div className="mt-5 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => selectLine(Math.max(0, currentLine - 1))}
                disabled={interactionLocked || currentLine === 0}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-edge text-ink-mid disabled:opacity-30"
                aria-label="上一句"
                title="上一句"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <p className="text-sm text-ink-faint">第 {currentLine + 1} 句，共 {poem.lines.length} 句</p>
              <button
                type="button"
                onClick={() => selectLine(Math.min(poem.lines.length - 1, currentLine + 1))}
                disabled={interactionLocked || currentLine === poem.lines.length - 1}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-edge text-ink-mid disabled:opacity-30"
                aria-label="下一句"
                title="下一句"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="mt-5 space-y-2 font-serif text-2xl leading-loose text-ink sm:text-3xl">
            {poem.lines.map((line, index) => {
              const active = mode === 'line' && index === currentLine
              return (
                <button
                  key={`${line}-${index}`}
                  type="button"
                  onClick={() => mode === 'line' && selectLine(index)}
                  disabled={interactionLocked}
                  className={`block w-full border-l-2 px-4 py-2 text-left transition-colors disabled:cursor-not-allowed ${active ? 'border-jade bg-jade/8 text-ink' : mode === 'line' ? 'border-transparent text-ink-faint hover:bg-paper-block/60' : 'border-transparent text-ink'}`}
                >
                  {active && showPinyin && (
                    <span className="mb-1 block min-h-6 font-sans text-sm leading-6 text-jade">
                      {pinyin ?? pinyinMessage}
                    </span>
                  )}
                  <span>{line}</span>
                </button>
              )
            })}
          </div>

          {mode === 'poem' && showPinyin && (
            <p className="mt-4 border-l-2 border-jade/45 bg-paper-block/70 px-3 py-2 text-sm leading-6 text-ink-mid">
              {pinyinMessage || '整首拼音会随示范分段显示，逐句模式更适合初学。'}
            </p>
          )}
          {mode === 'poem' && isLongPoem && (
            <p className="mt-5 border-l-2 border-cinnabar/55 bg-cinnabar/5 px-3 py-2 text-sm leading-6 text-ink-mid">
              这首诗较长，AI 示范音会自动分段播放。整首录音评分暂不开放，建议先逐句跟读。
            </p>
          )}
        </section>

        <section className="space-y-4">
          <div className="border border-edge bg-paper-block/75 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Headphones className="h-4 w-4 text-jade" aria-hidden="true" />
                <h2 className="font-serif text-xl text-ink">先听示范</h2>
              </div>
              <span className="text-xs text-ink-faint">AI 合成朗读</span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void toggleStandardAudio()}
                disabled={state.phase === 'preparing' || state.phase === 'recording'}
                className="inline-flex items-center gap-2 rounded-lg bg-jade px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {standardStatus === 'playing' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {standardStatus === 'loading' ? '正在准备' : standardStatus === 'playing' ? '暂停' : standardStatus === 'paused' ? '继续播放' : '听标准朗读'}
              </button>
              {standardSource && (
                <button
                  type="button"
                  onClick={() => void replayStandardAudio()}
                  disabled={state.phase === 'preparing' || state.phase === 'recording'}
                  className="inline-flex items-center gap-2 rounded-lg border border-edge px-3 py-2 text-sm text-ink-mid hover:bg-white/70 disabled:opacity-40"
                >
                  <RotateCcw className="h-4 w-4" />
                  重播
                </button>
              )}
            </div>

            {standardMessage && (
              <p className={`mt-3 text-sm leading-6 ${standardStatus === 'error' ? 'text-cinnabar' : 'text-ink-faint'}`}>
                {standardMessage}
                {standardSource === 'tencent' && standardPart.count > 1
                  ? `（${standardPart.index + 1}/${standardPart.count}）`
                  : ''}
              </p>
            )}
          </div>

          <div className="border border-edge bg-paper-block/75 p-5">
            <div className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-jade" aria-hidden="true" />
              <h2 className="font-serif text-xl text-ink">跟着读一遍</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-ink-faint">
              {mode === 'line' ? `本次只听第 ${currentLine + 1} 句，按字句对齐给提示。` : '本次听整首，按字句对齐给出朗读掌握度。'}
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              {canRecord && (
                <button
                  type="button"
                  onClick={() => void startRecording()}
                  disabled={recordingLocked || (mode === 'poem' && isLongPoem)}
                  className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Mic className="h-4 w-4" aria-hidden="true" />
                  准备跟读
                </button>
              )}
              {state.phase === 'recording' && (
                <button
                  type="button"
                  onClick={() => void stopRecording()}
                  className="inline-flex items-center gap-2 rounded-lg bg-cinnabar px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-85"
                >
                  <Square className="h-4 w-4" aria-hidden="true" />
                  结束录音
                </button>
              )}
              {(state.phase === 'ready' || state.phase === 'done') && (
                <button
                  type="button"
                  onClick={() => resetCapture()}
                  className="inline-flex items-center gap-2 rounded-lg border border-edge px-4 py-2 text-sm font-medium text-ink-mid transition-colors hover:bg-white/70"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  重录
                </button>
              )}
            </div>

            {state.phase === 'preparing' && (
              <div role="status" aria-live="polite" className="mt-5 flex items-center gap-4 border-l-2 border-jade bg-white/55 px-4 py-3">
                <span className="font-serif text-4xl text-jade">{state.countdown}</span>
                <div>
                  <p className="font-medium text-ink">看准当前句</p>
                  <p className="text-sm text-ink-faint">倒计时结束后开始录音</p>
                </div>
              </div>
            )}

            {state.phase === 'recording' && (
              <div className="mt-5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-cinnabar">正在听你读</span>
                  <span className="text-ink-faint">{state.elapsed}s / {maxSeconds}s</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/70">
                  <div
                    className="h-full rounded-full bg-cinnabar transition-all"
                    style={{ width: `${Math.min(100, (state.elapsed / maxSeconds) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {(state.phase === 'ready' || state.phase === 'submitting' || state.phase === 'done') && (
              <div className="mt-5 space-y-4">
                <audio ref={recordedAudioRef} src={state.audioUrl} controls className="w-full" />
                {state.phase === 'ready' && (
                  <button
                    type="button"
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
                  <p className="mt-1 text-xs text-ink-faint">依据 ASR 转写与原文的字句对齐</p>
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
