import Link from 'next/link'
import { redirect } from 'next/navigation'
import { desc, eq } from 'drizzle-orm'
import { Activity, BookOpenText, ClipboardCheck, Flame, GraduationCap, TrendingUp } from 'lucide-react'
import { AppNav } from '@/components/AppNav'
import { SealStamp } from '@/components/SealStamp'
import { db } from '@/db'
import { conversations, events, poems, quizAttempts, quizQuestions, wrongQuestions } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth-server'

const DAY_MS = 86_400_000

type AttemptRow = Awaited<ReturnType<typeof loadProgressData>>['attemptRows'][number]
type WrongRow = Awaited<ReturnType<typeof loadProgressData>>['wrongRows'][number]

function scoreOfAttempt(row: Pick<AttemptRow, 'isCorrect' | 'completionRate'>): number {
  if (row.isCorrect !== null) return row.isCorrect ? 1 : 0
  return row.completionRate ?? 0
}

function pointTypeOf(row: Pick<AttemptRow, 'pointType' | 'type'>): string {
  return row.pointType ?? row.type
}

function chinaDateKey(date: Date): string {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function countLearningStreak(dates: Date[]): number {
  const keys = new Set(dates.map(chinaDateKey))
  const latest = [...keys].sort().at(-1)
  if (!latest) return 0

  let cursor = new Date(`${latest}T00:00:00.000Z`).getTime()
  let streak = 0
  while (keys.has(new Date(cursor).toISOString().slice(0, 10))) {
    streak += 1
    cursor -= DAY_MS
  }
  return streak
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value))
}

async function loadProgressData(userId: string) {
  const attemptRowsPromise = db
    .select({
      poemId: quizAttempts.poemId,
      poemTitle: poems.title,
      type: quizQuestions.type,
      pointType: quizQuestions.pointType,
      isCorrect: quizAttempts.isCorrect,
      completionRate: quizAttempts.completionRate,
      createdAt: quizAttempts.createdAt,
    })
    .from(quizAttempts)
    .innerJoin(quizQuestions, eq(quizAttempts.questionId, quizQuestions.id))
    .innerJoin(poems, eq(quizAttempts.poemId, poems.id))
    .where(eq(quizAttempts.userId, userId))
    .orderBy(desc(quizAttempts.createdAt))
    .limit(160)

  const wrongRowsPromise = db
    .select({
      poemId: wrongQuestions.poemId,
      poemTitle: poems.title,
      type: quizQuestions.type,
      pointType: quizQuestions.pointType,
      wrongCount: wrongQuestions.wrongCount,
      resolved: wrongQuestions.resolved,
      lastWrongAt: wrongQuestions.lastWrongAt,
    })
    .from(wrongQuestions)
    .innerJoin(quizQuestions, eq(wrongQuestions.questionId, quizQuestions.id))
    .innerJoin(poems, eq(wrongQuestions.poemId, poems.id))
    .where(eq(wrongQuestions.userId, userId))
    .orderBy(desc(wrongQuestions.lastWrongAt))
    .limit(120)

  const eventRowsPromise = db
    .select({
      poemId: events.poemId,
      type: events.type,
      createdAt: events.createdAt,
    })
    .from(events)
    .where(eq(events.userId, userId))
    .orderBy(desc(events.createdAt))
    .limit(160)

  const conversationRowsPromise = db
    .select({
      poemId: conversations.poemId,
      mode: conversations.mode,
      createdAt: conversations.createdAt,
    })
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.createdAt))
    .limit(120)

  const [attemptRows, wrongRows, eventRows, conversationRows] = await Promise.all([
    attemptRowsPromise,
    wrongRowsPromise,
    eventRowsPromise,
    conversationRowsPromise,
  ])

  return { attemptRows, wrongRows, eventRows, conversationRows }
}

function buildPointMastery(attemptRows: AttemptRow[], wrongRows: WrongRow[]) {
  const stats = new Map<string, {
    attemptCount: number
    scoreSum: number
    weakScore: number
    wrongCount: number
    poemTitles: Set<string>
  }>()

  const ensure = (pointType: string) => {
    const current = stats.get(pointType)
    if (current) return current
    const next = {
      attemptCount: 0,
      scoreSum: 0,
      weakScore: 0,
      wrongCount: 0,
      poemTitles: new Set<string>(),
    }
    stats.set(pointType, next)
    return next
  }

  for (const attempt of attemptRows) {
    const pointType = pointTypeOf(attempt)
    const score = scoreOfAttempt(attempt)
    const stat = ensure(pointType)
    stat.attemptCount += 1
    stat.scoreSum += score
    stat.weakScore += score < 0.5 ? 2 : score < 0.8 ? 1 : 0
    stat.poemTitles.add(attempt.poemTitle)
  }

  for (const wrong of wrongRows) {
    if (wrong.resolved) continue
    const pointType = wrong.pointType ?? wrong.type
    const stat = ensure(pointType)
    stat.wrongCount += wrong.wrongCount
    stat.weakScore += wrong.wrongCount * 2
    stat.poemTitles.add(wrong.poemTitle)
  }

  return [...stats.entries()]
    .map(([pointType, stat]) => {
      const averageScore = stat.attemptCount > 0 ? stat.scoreSum / stat.attemptCount : null
      const mastery = averageScore === null
        ? clamp(70 - stat.wrongCount * 12)
        : clamp(Math.round(averageScore * 100 - stat.wrongCount * 8))

      return {
        pointType,
        mastery,
        averageScore,
        attemptCount: stat.attemptCount,
        wrongCount: stat.wrongCount,
        weakScore: stat.weakScore,
        poemTitles: [...stat.poemTitles].slice(0, 3),
      }
    })
    .sort((a, b) => a.mastery - b.mastery || b.weakScore - a.weakScore)
}

function buildPoemProgress(attemptRows: AttemptRow[], wrongRows: WrongRow[]) {
  const poemsById = new Map<string, {
    id: string
    title: string
    attempts: number
    scoreSum: number
    wrongCount: number
  }>()

  for (const attempt of attemptRows) {
    const current = poemsById.get(attempt.poemId) ?? {
      id: attempt.poemId,
      title: attempt.poemTitle,
      attempts: 0,
      scoreSum: 0,
      wrongCount: 0,
    }
    current.attempts += 1
    current.scoreSum += scoreOfAttempt(attempt)
    poemsById.set(attempt.poemId, current)
  }

  for (const wrong of wrongRows) {
    const current = poemsById.get(wrong.poemId) ?? {
      id: wrong.poemId,
      title: wrong.poemTitle,
      attempts: 0,
      scoreSum: 0,
      wrongCount: 0,
    }
    if (!wrong.resolved) current.wrongCount += wrong.wrongCount
    poemsById.set(wrong.poemId, current)
  }

  return [...poemsById.values()]
    .map(row => ({
      ...row,
      mastery: row.attempts > 0
        ? clamp(Math.round((row.scoreSum / row.attempts) * 100 - row.wrongCount * 8))
        : clamp(65 - row.wrongCount * 10),
    }))
    .sort((a, b) => b.attempts - a.attempts || a.mastery - b.mastery)
}

export default async function ProfilePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { attemptRows, wrongRows, eventRows, conversationRows } = await loadProgressData(user.id)
  const pointMastery = buildPointMastery(attemptRows, wrongRows)
  const poemProgress = buildPoemProgress(attemptRows, wrongRows)

  const learnedPoemIds = new Set<string>()
  for (const attempt of attemptRows) learnedPoemIds.add(attempt.poemId)
  for (const wrong of wrongRows) learnedPoemIds.add(wrong.poemId)
  for (const event of eventRows) if (event.poemId) learnedPoemIds.add(event.poemId)
  for (const conversation of conversationRows) if (conversation.poemId) learnedPoemIds.add(conversation.poemId)

  const activityDates = [
    ...attemptRows.map(row => row.createdAt),
    ...wrongRows.map(row => row.lastWrongAt),
    ...eventRows.map(row => row.createdAt),
    ...conversationRows.map(row => row.createdAt),
  ].filter((date): date is Date => date instanceof Date)

  const streak = countLearningStreak(activityDates)
  const unresolvedWrongCount = wrongRows
    .filter(row => !row.resolved)
    .reduce((sum, row) => sum + row.wrongCount, 0)
  const averageScore = attemptRows.length > 0
    ? Math.round((attemptRows.reduce((sum, row) => sum + scoreOfAttempt(row), 0) / attemptRows.length) * 100)
    : null
  const weakest = pointMastery.slice(0, 3)

  return (
    <div className="min-h-screen bg-paper text-ink">
      <AppNav title="我的青藤" userName={user.name} />

      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8">
        <section className="relative overflow-hidden border border-edge bg-paper-block/70 px-5 py-6 sm:px-7">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(192,98,63,0.45), transparent)' }}
          />
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <SealStamp size={42} tilt />
                <div>
                  <p className="text-xs tracking-[0.24em] text-ink-faint">学习画像</p>
                  <h1 className="font-serif text-3xl text-ink">青藤记下的近况</h1>
                </div>
              </div>
              <p className="max-w-2xl text-sm leading-7 text-ink-mid">
                这里把最近的答题、错题和学习行为收成一页。自适应组卷会优先参考这些薄弱考点，再混入已经掌握的内容做巩固。
              </p>
            </div>
            <Link
              href="/poems"
              className="inline-flex w-fit items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-85"
            >
              <BookOpenText className="h-4 w-4" aria-hidden="true" />
              继续选诗
            </Link>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard icon={BookOpenText} label="学过的诗" value={`${learnedPoemIds.size}`} suffix="首" />
          <MetricCard icon={GraduationCap} label="练习记录" value={`${attemptRows.length}`} suffix="次" />
          <MetricCard icon={Flame} label="连续学习" value={`${streak}`} suffix="天" />
          <MetricCard
            icon={TrendingUp}
            label="平均掌握"
            value={averageScore === null ? '待观察' : `${averageScore}`}
            suffix={averageScore === null ? '' : '%'}
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <div className="space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs tracking-[0.24em] text-cinnabar">MASTERY</p>
                <h2 className="font-serif text-2xl text-ink">考点掌握度</h2>
              </div>
              <span className="text-xs text-ink-faint">按薄弱程度排序</span>
            </div>

            {pointMastery.length === 0 ? (
              <EmptyState
                title="还没有答题画像"
                body="先从诗笺地图选一首带题库的诗，青藤就能开始记录你的考点掌握情况。"
              />
            ) : (
              <div className="space-y-3">
                {pointMastery.map(point => (
                  <div
                    key={point.pointType}
                    className="border border-edge bg-white/55 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-serif text-xl text-ink">{point.pointType}</h3>
                          {point.wrongCount > 0 && (
                            <span className="rounded-full bg-cinnabar/10 px-2 py-0.5 text-xs text-cinnabar">
                              待加强 {point.wrongCount}
                            </span>
                          )}
                        </div>
                        <p className="text-xs leading-5 text-ink-faint">
                          {point.attemptCount} 次练习
                          {point.poemTitles.length > 0 ? ` · ${point.poemTitles.join('、')}` : ''}
                        </p>
                      </div>
                      <span className="text-2xl font-semibold text-ink">{point.mastery}%</span>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-paper-block">
                      <div
                        className="h-full rounded-full bg-jade"
                        style={{ width: `${point.mastery}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <aside className="space-y-6">
            <section className="border border-edge bg-white/50 p-5">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-cinnabar" aria-hidden="true" />
                <h2 className="font-serif text-xl text-ink">下一次怎么练</h2>
              </div>
              {weakest.length === 0 ? (
                <p className="mt-4 text-sm leading-7 text-ink-mid">
                  先完成一组「青藤考你」，这里会出现你的薄弱考点和专项入口。
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {weakest.map(point => (
                    <Link
                      key={point.pointType}
                      href={`/wrong`}
                      className="block border border-edge bg-paper/70 px-3 py-3 transition-colors hover:bg-paper-block"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-ink">{point.pointType}</span>
                        <span className="text-xs text-cinnabar">{point.mastery}%</span>
                      </div>
                      <p className="mt-1 text-xs text-ink-faint">
                        自适应组卷会优先照顾这个考点
                      </p>
                    </Link>
                  ))}
                </div>
              )}
              <Link
                href="/wrong"
                className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-cinnabar transition-opacity hover:opacity-75"
              >
                去待加强
              </Link>
            </section>

            <section className="border border-edge bg-white/50 p-5">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-jade" aria-hidden="true" />
                <h2 className="font-serif text-xl text-ink">最近学过</h2>
              </div>
              {poemProgress.length === 0 ? (
                <p className="mt-4 text-sm leading-7 text-ink-mid">
                  暂无诗篇记录。进入诗笺地图后，沉浸、对话和做题都会慢慢留下痕迹。
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {poemProgress.slice(0, 5).map(poem => (
                    <Link
                      key={poem.id}
                      href={`/quiz/${poem.id}`}
                      className="block border-b border-edge/70 pb-3 last:border-b-0 last:pb-0"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-serif text-lg text-ink">{poem.title}</span>
                        <span className="text-xs text-ink-faint">{poem.mastery}%</span>
                      </div>
                      <p className="text-xs text-ink-faint">
                        {poem.attempts} 次练习
                        {poem.wrongCount > 0 ? ` · 待加强 ${poem.wrongCount}` : ' · 暂无待加强'}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </section>

        {unresolvedWrongCount > 0 && (
          <section className="border border-cinnabar/30 bg-cinnabar/5 px-5 py-4 text-sm text-ink-mid">
            青藤看到还有 <span className="font-semibold text-cinnabar">{unresolvedWrongCount}</span> 个待加强信号。
            下一次从错题本进入「专项练习」，题单会更偏向这些考点。
          </section>
        )}
      </main>
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  suffix,
}: {
  icon: typeof BookOpenText
  label: string
  value: string
  suffix: string
}) {
  return (
    <div className="border border-edge bg-white/55 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs tracking-[0.2em] text-ink-faint">{label}</span>
        <Icon className="h-4 w-4 text-jade" aria-hidden="true" />
      </div>
      <p className="mt-4 flex items-end gap-1 font-serif text-3xl text-ink">
        {value}
        {suffix && <span className="pb-1 text-sm text-ink-faint">{suffix}</span>}
      </p>
    </div>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-dashed border-edge bg-white/40 px-5 py-10 text-center">
      <p className="font-serif text-xl text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-ink-mid">{body}</p>
    </div>
  )
}
