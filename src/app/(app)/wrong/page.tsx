import { redirect } from 'next/navigation'
import Link from 'next/link'
import { eq, desc } from 'drizzle-orm'
import { getSession } from '@/lib/auth-server'
import { db } from '@/db'
import { wrongQuestions, quizQuestions, poems } from '@/db/schema'
import { SealStamp } from '@/components/SealStamp'
import { AppNav } from '@/components/AppNav'
import { ArrowRight, CheckCircle2 } from 'lucide-react'

export default async function WrongPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const rows = await db
    .select({
      id: wrongQuestions.id,
      poemId: wrongQuestions.poemId,
      questionId: wrongQuestions.questionId,
      wrongCount: wrongQuestions.wrongCount,
      lastWrongAt: wrongQuestions.lastWrongAt,
      resolved: wrongQuestions.resolved,
      stem: quizQuestions.stem,
      type: quizQuestions.type,
      pointType: quizQuestions.pointType,
      poemTitle: poems.title,
    })
    .from(wrongQuestions)
    .innerJoin(quizQuestions, eq(wrongQuestions.questionId, quizQuestions.id))
    .innerJoin(poems, eq(wrongQuestions.poemId, poems.id))
    .where(eq(wrongQuestions.userId, session.userId))
    .orderBy(desc(wrongQuestions.lastWrongAt))

  const unresolved = rows.filter(r => !r.resolved)
  const resolved = rows.filter(r => r.resolved)

  const TYPE_LABEL: Record<string, string> = {
    mcq: '选择', fill: '填空', translate: '翻译', appreciate: '赏析',
  }

  function practiceLabel(type: string, count: number): string {
    const isSubjective = type === 'appreciate' || type === 'translate'
    return isSubjective ? `练习 ${count} 次` : `答错 ${count} 次`
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <AppNav
        title="待加强"
        right={<span className="rounded-lg bg-paper-block px-2.5 py-1 text-ink-mid">{unresolved.length} 道</span>}
      />

      <main className="mx-auto max-w-4xl space-y-8 px-4 py-8">
        {/* 诗意空状态 */}
        {rows.length === 0 && (
          <div className="text-center py-24 animate-ink-fade-in">
            <div className="flex justify-center mb-5">
              <SealStamp size={44} tilt />
            </div>
            <p className="font-serif text-lg tracking-[0.2em] text-ink-faint">
              如清池无尘
            </p>
            <p className="mt-2 text-sm text-ink-faint">
              暂无待加强，继续精进
            </p>
          </div>
        )}

        {unresolved.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-end justify-between gap-4 border-b border-edge pb-3">
              <div>
                <p className="text-xs tracking-[0.2em] text-cinnabar">REVIEW</p>
                <h1 className="mt-1 font-serif text-2xl text-ink">待加强的考点</h1>
              </div>
              <p className="text-xs text-ink-faint">按最近练习排序</p>
            </div>
            {unresolved.map(row => (
              <div
                key={row.id}
                className="rounded-xl border border-edge bg-white/58 p-4 sm:p-5"
              >
                <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="rounded-full bg-paper-block px-2 py-0.5 text-xs text-cinnabar">
                        {row.poemTitle}
                      </span>
                      <span className="text-xs text-ink-faint">
                        {row.pointType ?? TYPE_LABEL[row.type] ?? row.type}
                      </span>
                      <span className="text-xs text-ink-faint">
                        {practiceLabel(row.type, row.wrongCount)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm leading-6 text-ink">{row.stem}</p>
                  </div>
                  <Link
                    href={`/quiz/${row.poemId}?mode=review&pointType=${encodeURIComponent(row.pointType ?? row.type)}`}
                    className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-ink px-3 py-2 text-xs font-medium text-paper transition-opacity hover:opacity-85"
                  >
                    专项练习
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            ))}
          </section>
        )}

        {resolved.length > 0 && (
          <section className="space-y-3 pt-2">
            <h2 className="flex items-center gap-2 text-sm font-medium text-ink-mid">
              <CheckCircle2 className="h-4 w-4 text-jade" aria-hidden="true" />
              已掌握
            </h2>
            {resolved.map(row => (
              <div
                key={row.id}
                className="rounded-xl border border-edge bg-white/35 p-4 opacity-65"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="rounded-full bg-paper-block px-2 py-0.5 text-xs text-ink-faint"
                  >
                    {row.poemTitle}
                  </span>
                  <span className="text-xs text-ink-faint">
                    {row.pointType ?? TYPE_LABEL[row.type] ?? row.type}
                  </span>
                </div>
                <p className="mt-1 line-clamp-1 text-sm text-ink-mid">{row.stem}</p>
              </div>
            ))}
          </section>
        )}
      </main>
    </div>
  )
}
