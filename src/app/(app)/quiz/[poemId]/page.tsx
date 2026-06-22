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
  isCorrect?: boolean       // objective only
  completionRate?: number   // subjective only (0-1)
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
      scores: number[]  // 1 / completionRate per question, for summary
    }
  | { phase: 'summary'; scores: number[] }

const TYPE_LABEL: Record<string, string> = {
  mcq: '选择题',
  fill: '填空题',
  translate: '翻译题',
  appreciate: '赏析题',
}

function completionLabel(rate: number): { text: string; color: string; bg: string } {
  if (rate >= 1)   return { text: '答得很完整 ✓',        color: '#3d8c78', bg: '#e8f4f0' }
  if (rate >= 0.5) return { text: '答到了核心，还能更全面', color: '#5a7a2e', bg: '#f0f5e8' }
  if (rate > 0)    return { text: '答到了一点，我们一起补全', color: '#7c6b4f', bg: '#f5f0eb' }
  return             { text: '再想想看～',               color: '#8a8a8a', bg: '#f5f3ef' }
}

export default function QuizPage() {
  const { poemId } = useParams<{ poemId: string }>()
  const [state, setState] = useState<SessionState>({ phase: 'loading' })

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
    // Objective: 1 if correct, 0 if wrong; Subjective: completionRate
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#fafaf7' }}>
        <p className="text-sm" style={{ color: '#8a8a8a' }}>青藤正在组卷…</p>
      </div>
    )
  }

  if (state.phase === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#fafaf7' }}>
        <p style={{ color: '#c0392b' }}>{state.message}</p>
        <button onClick={startSession} className="text-sm px-4 py-2 rounded-lg" style={{ background: '#5e8b7e', color: '#fff' }}>
          重试
        </button>
        <Link href="/poems" className="text-sm" style={{ color: '#8a8a8a' }}>← 返回诗库</Link>
      </div>
    )
  }

  if (state.phase === 'summary') {
    const avg = state.scores.length > 0
      ? state.scores.reduce((a, b) => a + b, 0) / state.scores.length
      : 0
    const pct = Math.round(avg * 100)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: '#fafaf7' }}>
        <div className="w-full max-w-md rounded-2xl border p-8 text-center space-y-4" style={{ background: '#fff', borderColor: '#e8e4dc' }}>
          <div className="text-5xl">{pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '💪'}</div>
          <h2 className="text-2xl font-serif">整体掌握度 {pct}%</h2>
          <p className="text-sm" style={{ color: '#6a6a6a' }}>
            {pct >= 80 ? '掌握得很好，继续保持！' : pct >= 50 ? '核心都懂了，再细化一下～' : '多读几遍，你一定能行！'}
          </p>
          <div className="flex gap-3 pt-4 justify-center flex-wrap">
            <button onClick={startSession} className="px-4 py-2 rounded-xl text-sm font-medium" style={{ background: '#7c6b4f', color: '#fff' }}>
              再做一轮
            </button>
            <Link href="/wrong" className="px-4 py-2 rounded-xl text-sm border font-medium" style={{ borderColor: '#d4cfc6', color: '#5a5a5a' }}>
              待加强
            </Link>
            <Link href="/poems" className="px-4 py-2 rounded-xl text-sm border font-medium" style={{ borderColor: '#d4cfc6', color: '#5a5a5a' }}>
              诗库
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Quiz phase
  const q = state.questions[state.current]
  const progress = `${state.current + 1} / ${state.questions.length}`
  const isObjective = q.type === 'mcq' || q.type === 'fill'
  const submitted = state.submitted

  return (
    <div className="min-h-screen" style={{ background: '#fafaf7' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#e8e4dc' }}>
        <Link href="/poems" className="text-sm" style={{ color: '#8a8a8a' }}>← 诗库</Link>
        <span className="text-sm font-medium">{progress}</span>
        <span className="text-xs px-2 py-1 rounded-full" style={{ background: '#f5f3ef', color: '#7c6b4f' }}>
          {TYPE_LABEL[q.type] ?? q.type}
        </span>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        {/* Stem */}
        <div className="rounded-xl border p-6" style={{ background: '#fff', borderColor: '#e8e4dc' }}>
          <p className="text-base leading-relaxed" style={{ color: '#1a1a1a' }}>{q.stem}</p>
        </div>

        {/* Answer input */}
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
                        borderColor: selected ? '#7c6b4f' : '#e8e4dc',
                        background: selected ? '#f5f0eb' : '#fff',
                        color: '#1a1a1a',
                      }}
                    >
                      <span className="font-medium mr-2">{letter}.</span>{opt}
                    </button>
                  )
                })}
              </div>
            ) : q.type === 'fill' ? (
              <input
                type="text"
                placeholder="请填写答案…"
                value={state.userAnswer}
                onChange={e => setState(s => s.phase === 'quiz' ? { ...s, userAnswer: e.target.value } : s)}
                onKeyDown={e => { if (e.key === 'Enter' && !state.submitting) submitAnswer() }}
                className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
                style={{ borderColor: '#e8e4dc', background: '#fff' }}
              />
            ) : (
              <textarea
                placeholder="请写下你的回答（尽量详细）…"
                value={state.userAnswer}
                onChange={e => setState(s => s.phase === 'quiz' ? { ...s, userAnswer: e.target.value } : s)}
                rows={5}
                className="w-full px-4 py-3 rounded-xl border text-sm outline-none resize-none"
                style={{ borderColor: '#e8e4dc', background: '#fff' }}
              />
            )}

            <button
              onClick={submitAnswer}
              disabled={!state.userAnswer.trim() || state.submitting}
              className="w-full py-3 rounded-xl font-medium text-sm transition-opacity disabled:opacity-40"
              style={{ background: '#7c6b4f', color: '#fff' }}
            >
              {state.submitting ? '判题中…' : '提交答案'}
            </button>
          </div>
        )}

        {/* Result panel */}
        {submitted && (
          <div className="space-y-4">
            {/* Objective verdict */}
            {isObjective && submitted.isCorrect !== undefined && (
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{
                  background: submitted.isCorrect ? '#e8f4f0' : '#f5f3ef',
                  color: submitted.isCorrect ? '#3d8c78' : '#7c6b4f',
                }}
              >
                <span className="text-xl">{submitted.isCorrect ? '✓' : '△'}</span>
                <span className="font-medium">{submitted.isCorrect ? '答对了！' : '这次差一点～'}</span>
              </div>
            )}

            {/* Subjective: completion rate (no red) */}
            {!isObjective && submitted.completionRate !== undefined && (() => {
              const { text, color, bg } = completionLabel(submitted.completionRate)
              const pct = Math.round(submitted.completionRate * 100)
              return (
                <div className="px-4 py-3 rounded-xl" style={{ background: bg }}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm" style={{ color }}>{text}</span>
                    <span className="text-xs font-medium" style={{ color }}>{pct}%</span>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-2 h-1.5 rounded-full" style={{ background: 'rgba(0,0,0,0.08)' }}>
                    <div
                      className="h-1.5 rounded-full transition-all"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                </div>
              )
            })()}

            {/* Objective: show correct answer */}
            {isObjective && (
              <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: '#e8e4dc', background: '#fff' }}>
                <p className="text-xs font-medium" style={{ color: '#8a8a8a' }}>正确答案</p>
                <p className="text-sm" style={{ color: '#1a1a1a' }}>{submitted.answer}</p>
                <p className="text-xs mt-2" style={{ color: '#6a6a6a' }}>{submitted.explanation}</p>
              </div>
            )}

            {/* Subjective: hit points + can-add points + feedback + reference */}
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
                  <div className="rounded-xl border p-4 space-y-1.5" style={{ borderColor: '#e8e4dc', background: '#f9f7f4' }}>
                    <p className="text-xs font-medium" style={{ color: '#7c6b4f' }}>还可以补充</p>
                    {submitted.missedPoints.map((pt, i) => (
                      <p key={i} className="text-sm" style={{ color: '#6a5a40' }}>+ {pt}</p>
                    ))}
                  </div>
                )}
                {submitted.feedback && (
                  <div className="rounded-xl border p-4" style={{ borderColor: '#e8e4dc', background: '#fffef9' }}>
                    <p className="text-xs font-medium mb-1.5" style={{ color: '#7c6b4f' }}>青藤说</p>
                    <p className="text-sm leading-relaxed" style={{ color: '#4a4a4a' }}>{submitted.feedback}</p>
                  </div>
                )}
                <div className="rounded-xl border p-4 space-y-1" style={{ borderColor: '#e8e4dc', background: '#fff' }}>
                  <p className="text-xs font-medium" style={{ color: '#8a8a8a' }}>参考答案</p>
                  <p className="text-sm" style={{ color: '#1a1a1a' }}>{submitted.answer}</p>
                </div>
              </div>
            )}

            <button
              onClick={next}
              className="w-full py-3 rounded-xl font-medium text-sm"
              style={{ background: '#7c6b4f', color: '#fff' }}
            >
              {state.current + 1 >= state.questions.length ? '查看结果' : '下一题 →'}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
