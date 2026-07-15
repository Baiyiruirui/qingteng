'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowRight,
  BookOpenText,
  Check,
  ClipboardCheck,
  Plus,
  RotateCcw,
} from 'lucide-react'
import { AppNav } from '@/components/AppNav'
import { SealStamp } from '@/components/SealStamp'
import { safeReturnTo } from '@/lib/navigation'

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

type QuizSelectionPlan = {
  mode: 'adaptive' | 'review'
  focusPointType: string | null
  weakPointTypes: string[]
  strategy: string
}

type SessionState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | {
      phase: 'quiz'
      sessionId: string
      questions: SafeQuestion[]
      plan: QuizSelectionPlan
      current: number
      userAnswer: string
      submitting: boolean
      submitted: JudgeResult | null
      scores: number[]
    }
  | { phase: 'summary'; scores: number[] }

const TYPE_LABEL: Record<string, string> = {
  mcq: '选择题',
  fill: '填空题',
  translate: '翻译题',
  appreciate: '赏析题',
}

function completionCopy(rate: number) {
  if (rate >= 1) return '要点齐备'
  if (rate >= 0.5) return '抓住核心'
  if (rate > 0) return '已有落笔'
  return '再读一遍'
}

export default function QuizPage() {
  const { poemId } = useParams<{ poemId: string }>()
  const searchParams = useSearchParams()
  const mode = searchParams.get('mode') === 'review' ? 'review' : 'adaptive'
  const focusPointType = searchParams.get('pointType')
  const returnTo = safeReturnTo(searchParams.get('returnTo'))
  const returnLabel = returnTo.startsWith('/poems') ? '返回诗笺地图' : '返回上一处'
  const [state, setState] = useState<SessionState>({ phase: 'loading' })
  const [actionError, setActionError] = useState<string | null>(null)
  const submitted = state.phase === 'quiz' ? state.submitted : null

  const startSession = useCallback(async () => {
    setActionError(null)
    setState({ phase: 'loading' })
    try {
      const res = await fetch('/api/quiz/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poemId,
          mode,
          focusPointType,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '无法加载题目')
      setState({
        phase: 'quiz',
        sessionId: data.sessionId,
        questions: data.questions,
        plan: data.plan,
        current: 0,
        userAnswer: '',
        submitting: false,
        submitted: null,
        scores: [],
      })
    } catch (error) {
      setState({ phase: 'error', message: error instanceof Error ? error.message : '网络错误' })
    }
  }, [focusPointType, mode, poemId])

  useEffect(() => {
    void startSession()
  }, [startSession])

  async function submitAnswer() {
    if (state.phase !== 'quiz' || state.submitting || state.submitted) return
    const question = state.questions[state.current]
    if (!state.userAnswer.trim()) return
    setActionError(null)
    setState(current => current.phase === 'quiz' ? { ...current, submitting: true } : current)
    try {
      const res = await fetch('/api/quiz/judge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: question.id,
          userAnswer: state.userAnswer,
          sessionId: state.sessionId,
        }),
      })
      const result: JudgeResult = await res.json()
      if (!res.ok) throw new Error((result as { error?: string }).error ?? '判题失败')
      setState(current => current.phase === 'quiz'
        ? { ...current, submitting: false, submitted: result }
        : current)
    } catch (error) {
      setState(current => current.phase === 'quiz' ? { ...current, submitting: false } : current)
      setActionError(error instanceof Error ? error.message : '网络错误，请重试')
    }
  }

  function next() {
    if (state.phase !== 'quiz' || !state.submitted) return
    const result = state.submitted
    const score = result.isCorrect !== undefined
      ? (result.isCorrect ? 1 : 0)
      : (result.completionRate ?? 0)
    const scores = [...state.scores, score]
    const nextIndex = state.current + 1
    if (nextIndex >= state.questions.length) {
      setState({ phase: 'summary', scores })
      return
    }
    setState({
      ...state,
      current: nextIndex,
      userAnswer: '',
      submitting: false,
      submitted: null,
      scores,
    })
  }

  if (state.phase === 'loading') {
    return (
      <div className="min-h-screen bg-paper text-ink">
        <AppNav title="青藤考你" />
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="animate-ink-fade-in font-serif text-sm tracking-[0.2em] text-ink-faint">
            青藤正在组卷...
          </p>
        </div>
      </div>
    )
  }

  if (state.phase === 'error') {
    return (
      <div className="min-h-screen bg-paper text-ink">
        <AppNav title="青藤考你" />
        <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 px-4 text-center">
          <SealStamp size={42} tilt />
          <p className="text-sm text-cinnabar">{state.message}</p>
          <button
            onClick={startSession}
            className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-85"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            重试
          </button>
          <Link href={returnTo} className="text-sm text-ink-faint transition-colors hover:text-ink">
            {returnLabel}
          </Link>
        </main>
      </div>
    )
  }

  if (state.phase === 'summary') {
    const average = state.scores.length > 0
      ? state.scores.reduce((sum, score) => sum + score, 0) / state.scores.length
      : 0
    const percentage = Math.round(average * 100)
    return (
      <div className="min-h-screen bg-paper text-ink">
        <AppNav title="青藤考你" />
        <main className="mx-auto flex min-h-[70vh] max-w-3xl items-center px-4 py-10">
          <section className="animate-ink-fade-in w-full rounded-xl border border-edge bg-white/60 px-6 py-10 text-center sm:px-10">
            <SealResult percentage={percentage} />
            <p className="mt-5 text-xs tracking-[0.22em] text-cinnabar">本轮小结</p>
            <h1 className="mt-2 font-serif text-3xl text-ink">整体掌握度 {percentage}%</h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-ink-mid">
              {percentage >= 80
                ? '这一轮答得稳，换一组考点继续温习。'
                : percentage >= 50
                  ? '主干已经抓住，回看批注后再练一轮。'
                  : '先回到诗句里读一遍，再来落笔也不迟。'}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button
                onClick={startSession}
                className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-85"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                再做一轮
              </button>
              <Link
                href="/wrong"
                className="inline-flex items-center gap-2 rounded-lg border border-edge px-4 py-2.5 text-sm font-medium text-ink-mid transition-colors hover:bg-paper-block"
              >
                <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                待加强
              </Link>
              <Link
                href={returnTo}
                className="inline-flex items-center gap-2 rounded-lg border border-edge px-4 py-2.5 text-sm font-medium text-ink-mid transition-colors hover:bg-paper-block"
              >
                <BookOpenText className="h-4 w-4" aria-hidden="true" />
                {returnTo.startsWith('/poems') ? '诗笺地图' : '返回上一处'}
              </Link>
            </div>
          </section>
        </main>
      </div>
    )
  }

  const question = state.questions[state.current]
  const progress = `${state.current + 1} / ${state.questions.length}`
  const isObjective = question.type === 'mcq' || question.type === 'fill'

  return (
    <div className="min-h-screen bg-paper text-ink">
      <AppNav
        title="青藤考你"
        right={
          <span className="rounded-lg bg-paper-block px-2.5 py-1 text-ink-mid">
            {progress} · {TYPE_LABEL[question.type] ?? question.type}
          </span>
        }
      />

      <main className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:py-8">
        {actionError && (
          <p role="alert" className="border-l-2 border-cinnabar bg-cinnabar/5 px-4 py-3 text-sm text-cinnabar">
            {actionError}
          </p>
        )}
        <section className="border-l-2 border-jade bg-paper-block/60 px-4 py-3 text-sm text-ink-mid sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-ink">
              {state.plan.mode === 'review' ? '专项复习' : '自适应组卷'}
            </span>
            {state.plan.weakPointTypes.length > 0 && (
              <span className="text-xs text-ink-faint">
                关注：{state.plan.weakPointTypes.slice(0, 3).join('、')}
              </span>
            )}
          </div>
          <p className="mt-1 leading-6">{state.plan.strategy}</p>
        </section>

        <section className="rounded-xl border border-edge bg-white/62 p-5 sm:p-7">
          <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-ink-faint">
            <span className="font-medium text-cinnabar">第 {state.current + 1} 题</span>
            <span>{question.pointType ?? TYPE_LABEL[question.type]}</span>
            <span>{question.difficulty}</span>
          </div>
          <h1 className="font-serif text-xl leading-9 text-ink sm:text-2xl sm:leading-10">
            {question.stem}
          </h1>
        </section>

        {!submitted && (
          <section className="space-y-3">
            {question.type === 'mcq' && question.options ? (
              <div className="space-y-2.5">
                {question.options.map((option, index) => {
                  const letter = 'ABCD'[index]
                  const selected = state.userAnswer === option
                  return (
                    <button
                      key={option}
                      onClick={() => setState(current => current.phase === 'quiz'
                        ? { ...current, userAnswer: option }
                        : current)}
                      className={
                        selected
                          ? 'flex w-full items-start gap-3 rounded-xl border border-jade bg-jade/8 px-4 py-3.5 text-left text-sm leading-6 text-ink transition-colors'
                          : 'flex w-full items-start gap-3 rounded-xl border border-edge bg-white/60 px-4 py-3.5 text-left text-sm leading-6 text-ink transition-colors hover:bg-white/80'
                      }
                    >
                      <span className={
                        selected
                          ? 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-jade text-xs font-semibold text-white'
                          : 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-edge text-xs font-semibold text-ink-mid'
                      }>
                        {letter}
                      </span>
                      <span>{option.replace(/^[A-D][.．]\s*/, '')}</span>
                    </button>
                  )
                })}
              </div>
            ) : question.type === 'fill' ? (
              <input
                type="text"
                placeholder="请填写答案..."
                value={state.userAnswer}
                maxLength={2000}
                onChange={event => setState(current => current.phase === 'quiz'
                  ? { ...current, userAnswer: event.target.value }
                  : current)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !state.submitting) void submitAnswer()
                }}
                className="w-full rounded-xl border border-edge bg-white/75 px-4 py-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-jade"
              />
            ) : (
              <textarea
                placeholder="请写下你的回答..."
                value={state.userAnswer}
                maxLength={2000}
                onChange={event => setState(current => current.phase === 'quiz'
                  ? { ...current, userAnswer: event.target.value }
                  : current)}
                rows={5}
                className="w-full resize-none rounded-xl border border-edge bg-white/75 px-4 py-3 text-sm leading-7 text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-jade"
              />
            )}

            <button
              onClick={() => void submitAnswer()}
              disabled={!state.userAnswer.trim() || state.submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-3 text-sm font-medium text-paper transition-opacity disabled:opacity-35"
            >
              {state.submitting ? '先生正在批阅...' : '交卷'}
            </button>
          </section>
        )}

        {submitted && (
          <section className="animate-ink-fade-in space-y-5" aria-live="polite">
            <ReviewHeading result={submitted} isObjective={isObjective} />

            <div className="overflow-hidden rounded-xl border border-edge bg-white/58 lg:grid lg:grid-cols-[minmax(0,1fr)_18rem]">
              <article className="p-5 sm:p-6">
                <p className="text-xs tracking-[0.2em] text-ink-faint">你的答卷</p>
                <p className="mt-3 border-l-2 border-cinnabar/55 pl-4 font-serif text-lg leading-8 text-ink">
                  {state.userAnswer}
                </p>
              </article>

              <aside className="border-t border-edge bg-paper-block/45 p-5 sm:p-6 lg:border-l lg:border-t-0">
                {isObjective ? (
                  <div>
                    <p className="text-xs tracking-[0.18em] text-ink-faint">正确答案</p>
                    <p className="mt-3 text-sm font-medium leading-7 text-ink">{submitted.answer}</p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <PointList title="已经答到" items={submitted.hitPoints ?? []} variant="hit" />
                    <PointList title="还可补上" items={submitted.missedPoints ?? []} variant="missed" />
                  </div>
                )}
              </aside>
            </div>

            {isObjective && (
              <section className="border-l-2 border-jade bg-jade/5 px-4 py-3.5 text-sm leading-7 text-ink-mid sm:px-5">
                {submitted.explanation}
              </section>
            )}

            {!isObjective && submitted.feedback && (
              <section className="grid gap-4 border-y border-edge py-5 sm:grid-cols-[auto_1fr] sm:items-start">
                <div className="flex items-center gap-3 sm:block">
                  <SealStamp size={48} tilt />
                  <p className="font-serif text-lg text-cinnabar sm:mt-2">青藤先生</p>
                </div>
                <p className="text-sm leading-7 text-ink-mid">{submitted.feedback}</p>
              </section>
            )}

            {!isObjective && (
              <details className="rounded-xl border border-edge bg-white/45 px-5 py-4">
                <summary className="cursor-pointer text-sm font-medium text-ink-mid">
                  对照参考答案
                </summary>
                <p className="mt-3 text-sm leading-7 text-ink">{submitted.answer}</p>
              </details>
            )}

            <button
              onClick={next}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-3 text-sm font-medium text-paper transition-opacity hover:opacity-85"
            >
              {state.current + 1 >= state.questions.length ? '查看本轮小结' : '下一题'}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </section>
        )}
      </main>
    </div>
  )
}

function ReviewHeading({ result, isObjective }: { result: JudgeResult; isObjective: boolean }) {
  const rate = isObjective ? (result.isCorrect ? 1 : 0) : (result.completionRate ?? 0)
  const percentage = Math.round(rate * 100)
  const positive = percentage >= 80

  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-edge pb-4">
      <div>
        <p className="text-xs tracking-[0.22em] text-cinnabar">先生批注</p>
        <h2 className="mt-1 font-serif text-2xl text-ink">
          {isObjective
            ? (result.isCorrect ? '此题答对' : '这一处需回看')
            : completionCopy(rate)}
        </h2>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-ink-faint">掌握度</span>
        <span className={positive ? 'font-serif text-3xl text-jade' : 'font-serif text-3xl text-cinnabar'}>
          {percentage}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper-block">
        <div
          className={positive ? 'h-full rounded-full bg-jade transition-all' : 'h-full rounded-full bg-cinnabar/70 transition-all'}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </header>
  )
}

function PointList({
  title,
  items,
  variant,
}: {
  title: string
  items: string[]
  variant: 'hit' | 'missed'
}) {
  const isHit = variant === 'hit'
  return (
    <section>
      <p className={isHit ? 'text-xs font-medium text-jade' : 'text-xs font-medium text-cinnabar'}>
        {title}
      </p>
      {items.length > 0 ? (
        <div className="mt-2 space-y-2.5">
          {items.map(item => (
            <div key={item} className="flex items-start gap-2 text-sm leading-6 text-ink-mid">
              <span className={
                isHit
                  ? 'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-jade/12 text-jade'
                  : 'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-cinnabar/35 text-cinnabar'
              }>
                {isHit ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
              </span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm leading-6 text-ink-faint">
          {isHit ? '这次还没有命中明确得分点。' : '没有遗漏的核心要点。'}
        </p>
      )}
    </section>
  )
}

function SealResult({ percentage }: { percentage: number }) {
  const label = percentage >= 80 ? '优' : percentage >= 50 ? '进' : '习'
  return (
    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg border-2 border-cinnabar font-kai text-3xl text-cinnabar">
      {label}
    </div>
  )
}
