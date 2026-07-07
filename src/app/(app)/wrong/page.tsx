import { redirect } from 'next/navigation'
import Link from 'next/link'
import { eq, desc } from 'drizzle-orm'
import { getSession } from '@/lib/auth-server'
import { db } from '@/db'
import { wrongQuestions, quizQuestions, poems } from '@/db/schema'
import { SealStamp } from '@/components/SealStamp'
import { AppNav } from '@/components/AppNav'

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
    <div className="min-h-screen bg-qt-paper text-qt-ink">
      <AppNav title="待加强" right={<span>{unresolved.length} 道</span>} />

      <main className="mx-auto max-w-2xl px-4 py-8 space-y-8">
        {/* 诗意空状态 */}
        {rows.length === 0 && (
          <div className="text-center py-24 animate-ink-fade-in">
            <div className="flex justify-center mb-5">
              <SealStamp size={44} tilt />
            </div>
            <p className="font-serif text-qt-ink-light tracking-[0.2em] text-lg">
              如清池无尘
            </p>
            <p className="text-sm text-qt-ink-light opacity-50 mt-2">
              暂无待加强，继续精进
            </p>
          </div>
        )}

        {unresolved.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-qt-earth">待加强</h2>
            {unresolved.map(row => (
              <div
                key={row.id}
                className="rounded-xl border border-qt-border p-4"
                style={{ background: 'rgba(255,255,255,0.6)' }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--qt-paper-alt)', color: 'var(--qt-earth)' }}
                      >
                        {row.poemTitle}
                      </span>
                      <span className="text-xs text-qt-ink-light">
                        {row.pointType ?? TYPE_LABEL[row.type] ?? row.type}
                      </span>
                      <span className="text-xs text-qt-ink-light opacity-70">
                        {practiceLabel(row.type, row.wrongCount)}
                      </span>
                    </div>
                    <p className="text-sm line-clamp-2 text-qt-ink">{row.stem}</p>
                  </div>
                  <Link
                    href={`/quiz/${row.poemId}?mode=review&pointType=${encodeURIComponent(row.pointType ?? row.type)}`}
                    className="shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium transition-opacity hover:opacity-80"
                    style={{ background: 'var(--qt-earth)', color: '#fff' }}
                  >
                    专项练习
                  </Link>
                </div>
              </div>
            ))}
          </section>
        )}

        {resolved.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-qt-ink-light">已掌握</h2>
            {resolved.map(row => (
              <div
                key={row.id}
                className="rounded-xl border border-qt-border p-4 opacity-50"
                style={{ background: 'rgba(255,255,255,0.4)' }}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--qt-paper-alt)', color: 'var(--qt-ink-light)' }}
                  >
                    {row.poemTitle}
                  </span>
                  <span className="text-xs text-qt-ink-light">
                    {row.pointType ?? TYPE_LABEL[row.type] ?? row.type}
                  </span>
                </div>
                <p className="text-sm mt-1 line-clamp-1 text-qt-ink-mid">{row.stem}</p>
              </div>
            ))}
          </section>
        )}
      </main>
    </div>
  )
}
