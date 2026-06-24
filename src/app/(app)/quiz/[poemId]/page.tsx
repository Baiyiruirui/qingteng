'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

type SafeQuestion = {
  id: string
  poemId: string
  type: 'mcq' | 'fill' | 'appreciate' | 'translate'
  stem: string
  options: string[] | null
  difficulty: string
  pointType: string | null
}

type JudgeResult = {
  isCorrect?: boolean
  completionRate?: number
  answer: string
  explanation: string
  hitPoints?: string[]
  missedPoints?: string[]
  feedback?: string
}

type SessionState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | {
      phase: 'quiz'
      sessionId: string
      questions: SafeQuestion[]
      current: number
      userAnswer: string
      submitting: boolean
      submitted: JudgeResult | null
      scores: number[]
    }
  | { phase: 'summary'; scores: number[] }

const TYPE_LABEL: Record<string, string> = {
  mcq: '选择题', fill: '填空题', translate: '翻译题', appreciate: '赏析题',
}

function completionLabel(rate: number): { text: string; color: string; bg: string } {
  if (rate >= 1)   return { text: '答得很完整 ✓',          color: '#3d8c78', bg: '#e8f4f0' }
  if (rate >= 0.5) return { text: '答到了核心，还能更全面', color: '#5a7a2e', bg: '#f0f5e8' }
  if (rate > 0)    return { text: '答到了一点，我们一起补全', color: '#7c6b4f', bg: '#f5f0eb' }
  return             { text: '再想想看～',                 color: '#9A9384', bg: '#f5f3ef' }
}

export default function QuizPage() {
  const { poemId } = useParams<{ poemId: string }>()
  const [state, setState] = useState<SessionState>({ phase: 'loading' })
  const submitted = state.phase === 'quiz' ? state.submitted : null
  const answerRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null)

  const startSession = useCallback(async () => {
    setState({ phase: 'loading' })
    try {
      const res = await fetch('/api/quiz/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poemId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '无法加载题目')
      setState({
        phase: 'quiz',
        sessionId: data.sessionId,
        questions: data.questions,
        current: 0,
        userAnswer: '',
        submitting: false,
        submitted: null,
        scores: [],
      })
    } catch (e) {
      setState({ phase: 'error', message: e instanceof Error ? e.message : '网络错误' })
    }
  }, [poemId])

  useEffect(() => { startSession() }, [startSession])

  async function submitAnswer() {
    if (state.phase !== 'quiz' || state.submitting || state.submitted) return
    const q = state.questions[state.current]
    if (!state.userAnswer.trim()) return
    setState(s => s.phase === 'quiz' ? { ...s, submitting: true } : s)
    try {
      const res = await fetch('/api/quiz/judge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: q.id,
          userAnswer: state.userAnswer,
          sessionId: state.sessionId,
        }),
      })
      const result: JudgeResult = await res.json()
      if (!res.ok) throw new Error((result as { error?: string }).error ?? '判题失败')
      setState(s => s.phase === 'quiz' ? { ...s, submitting: false, submitted: result } : s)
    } catch (e) {
      setState(s => s.phase === 'quiz' ? { ...s, submitting: false } : s)
      alert(e instanceof Error ? e.message : '网络错误，请重试')
    }
  }

  function next() {
    if (state.phase !== 'quiz' || !state.submitted) return
    const r = state.submitted
    const score = r.isCorrect !== undefined ? (r.isCorrect ? 1 : 0) : (r.completionRate ?? 0)
    const scores = [...state.scores, score]
    const nextIdx = state.current + 1
    if (nextIdx >= state.questions.length) {
      setState({ phase: 'summary', scores })
    } else {
      setState({ ...state, current: nextIdx, userAnswer: '', submitting: false, submitted: null, scores })
    }
  }

  if (state.phase === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-qt-paper">
        <p className="font-serif text-qt-ink-light tracking-widest animate-ink-fade-in">
          青藤正在组卷…
        </p>
      </div>
    )
  }

  if (state.phase === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-qt-paper">
        <p className="text-qt-vermilion text-sm">{state.message}</p>
        <button
          onClick={startSession}
          className="text-sm px-4 py-2 rounded-lg"
          style={{ background: 'var(--qt-green)', color: '#fff' }}
        >
          重试
        </button>
        <Link href="/poems" className="text-sm text-qt-ink-light">← 返回诗库</Link>
      </div>
    )
  }

  if (state.phase === 'summary') {
    const avg = state.scores.length > 0
      ? state.scores.reduce((a, b) => a + b, 0) / state.scores.length
      : 0
    const pct = Math.round(avg * 100)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-qt-paper">
        <div
          className="w-full max-w-md rounded-2xl border border-qt-border p-8 text-center space-y-4 animate-ink-fade-in"
          style={{ background: 'rgba(255,255,255,0.72)' }}
        >
          <div className="text-5xl">{pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '💪'}</div>
          <h2 className="font-serif text-2xl tracking-widest text-qt-ink">整体掌握度 {pct}%</h2>
          <p className="text-sm text-qt-ink-mid">
            {pct >= 80 ? '掌握得很好，继续保持！' : pct >= 50 ? '核心都懂了，再细化一下～' : '多读几遍，你一定能行！'}
          </p>
          <div className="flex gap-3 pt-4 justify-center flex-wrap">
            <button
              onClick={startSession}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: 'var(--qt-earth)', color: '#fff' }}
            >
              再做一轮
            </button>
            <Link
              href="/wrong"
              className="px-4 py-2 rounded-xl text-sm border border-qt-border text-qt-ink-mid font-medium"
            >
              待加强
            </Link>
            <Link
              href="/poems"
              className="px-4 py-2 rounded-xl text-sm border border-qt-border text-qt-ink-mid font-medium"
            >
              诗库
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const q = state.questions[state.current]
  const progress = `${state.current + 1} / ${state.questions.length}`
  const isObjective = q.type === 'mcq' || q.type === 'fill'

  return (
    <div className="min-h-screen bg-qt-paper">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-qt-border">
        <Link href="/poems" className="text-sm text-qt-ink-light hover:text-qt-ink transition-colors">
          ← 诗库
        </Link>
        <span className="text-sm font-medium text-qt-ink">{progress}</span>
        <span
          className="text-xs px-2 py-1 rounded-full"
          style={{ background: 'var(--qt-paper-alt)', color: 'var(--qt-earth)' }}
        >
          {TYPE_LABEL[q.type] ?? q.type}
        </span>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        {/* 题干 */}
        <div
          className="rounded-xl border border-qt-border p-6"
          style={{ background: 'rgba(255,255,255,0.72)' }}
        >
          <p className="text-base leading-relaxed text-qt-ink">{q.stem}</p>
        </div>

        {/* 答题区 */}
        {!submitted && (
          <div className="space-y-3">
            {q.type === 'mcq' && q.options ? (
              <div className="space-y-2">
                {q.options.map((opt, i) => {
                  const letter = 'ABCD'[i]
                  const selected = state.userAnswer === opt
                  return (
                    <button
                      key={i}
                      onClick={() => setState(s => s.phase === 'quiz' ? { ...s, userAnswer: opt } : s)}
                      className="w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors"
                      style={{
                        borderColor: selected ? 'var(--qt-earth)' : 'var(--qt-border)',
                        background: selected ? 'var(--qt-paper-alt)' : 'rgba(255,255,255,0.72)',
                        color: 'var(--qt-ink)',
                      }}
                    >
                      <span className="font-medium mr-2">{letter}.</span>{opt}
                    </button>
                  )
                })}
              </div>
            ) : q.type === 'fill' ? (
              <input
                ref={el => { answerRef.current = el }}
                type="text"
                placeholder="请填写答案…"
                value={state.userAnswer}
                onChange={e => setState(s => s.phase === 'quiz' ? { ...s, userAnswer: e.target.value } : s)}
                onKeyDown={e => { if (e.key === 'Enter' && !state.submitting) submitAnswer() }}
                className="w-full px-4 py-3 rounded-xl border border-qt-border text-sm outline-none focus:border-qt-green transition-colors bg-white text-qt-ink"
              />
            ) : (
              <textarea
                ref={el => { answerRef.current = el }}
                placeholder="请写下你的回答（尽量详细）…"
                value={state.userAnswer}
                onChange={e => setState(s => s.phase === 'quiz' ? { ...s, userAnswer: e.target.value } : s)}
                rows={5}
                className="w-full px-4 py-3 rounded-xl border border-qt-border text-sm outline-none focus:border-qt-green transition-colors resize-none bg-white text-qt-ink"
              />
            )}

            <button
              onClick={submitAnswer}
              disabled={!state.userAnswer.trim() || state.submitting}
              className="w-full py-3 rounded-xl font-medium text-sm transition-opacity disabled:opacity-40"
              style={{ background: 'var(--qt-earth)', color: '#fff' }}
            >
              {state.submitting ? '判题中…' : '提交答案'}
            </button>
          </div>
        )}

        {/* 结果面板 */}
        {submitted && (
          <div className="space-y-4">
            {/* 客观题判定 */}
            {isObjective && submitted.isCorrect !== undefined && (
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{
                  background: submitted.isCorrect ? '#e8f4f0' : 'var(--qt-paper-alt)',
                  color: submitted.isCorrect ? '#3d8c78' : 'var(--qt-earth)',
                }}
              >
                <span className="text-xl">{submitted.isCorrect ? '✓' : '△'}</span>
                <span className="font-medium">{submitted.isCorrect ? '答对了！' : '这次差一点～'}</span>
              </div>
            )}

            {/* 主观题完成度 */}
            {!isObjective && submitted.completionRate !== undefined && (() => {
              const { text, color, bg } = completionLabel(submitted.completionRate)
              const pct = Math.round(submitted.completionRate * 100)
              return (
                <div className="px-4 py-3 rounded-xl" style={{ background: bg }}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm" style={{ color }}>{text}</span>
                    <span className="text-xs font-medium" style={{ color }}>{pct}%</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full" style={{ background: 'rgba(0,0,0,0.08)' }}>
                    <div
                      className="h-1.5 rounded-full transition-all"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                </div>
              )
            })()}

            {/* 客观题答案 */}
            {isObjective && (
              <div
                className="rounded-xl border border-qt-border p-4 space-y-2"
                style={{ background: 'rgba(255,255,255,0.72)' }}
              >
                <p className="text-xs font-medium text-qt-ink-light">正确答案</p>
                <p className="text-sm text-qt-ink">{submitted.answer}</p>
                <p className="text-xs text-qt-ink-mid">{submitted.explanation}</p>
              </div>
            )}

            {/* 主观题要点 */}
            {!isObjective && (
              <div className="space-y-3">
                {submitted.hitPoints && submitted.hitPoints.length > 0 && (
                  <div className="rounded-xl border p-4 space-y-1.5" style={{ borderColor: '#d4ece5', background: '#f4fbf8' }}>
                    <p className="text-xs font-medium" style={{ color: '#3d8c78' }}>答到的要点</p>
                    {submitted.hitPoints.map((pt, i) => (
                      <p key={i} className="text-sm" style={{ color: '#2a6657' }}>✓ {pt}</p>
                    ))}
                  </div>
                )}
                {submitted.missedPoints && submitted.missedPoints.length > 0 && (
                  <div
                    className="rounded-xl border border-qt-border p-4 space-y-1.5"
                    style={{ background: 'rgba(255,255,255,0.72)' }}
                  >
                    <p className="text-xs font-medium text-qt-earth">还可以补充</p>
                    {submitted.missedPoints.map((pt, i) => (
                      <p key={i} className="text-sm text-qt-earth">+ {pt}</p>
                    ))}
                  </div>
                )}
                {submitted.feedback && (
                  <div
                    className="rounded-xl border border-qt-border p-4"
                    style={{ background: 'rgba(255,255,255,0.72)' }}
                  >
                    <p className="text-xs font-medium text-qt-earth mb-1.5">青藤说</p>
                    <p className="text-sm leading-relaxed text-qt-ink-mid">{submitted.feedback}</p>
                  </div>
                )}
                <div
                  className="rounded-xl border border-qt-border p-4 space-y-1"
                  style={{ background: 'rgba(255,255,255,0.72)' }}
                >
                  <p className="text-xs font-medium text-qt-ink-light">参考答案</p>
                  <p className="text-sm text-qt-ink">{submitted.answer}</p>
                </div>
              </div>
            )}

            <button
              onClick={next}
              className="w-full py-3 rounded-xl font-medium text-sm"
              style={{ background: 'var(--qt-earth)', color: '#fff' }}
            >
              {state.current + 1 >= state.questions.length ? '查看结果' : '下一题 →'}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
