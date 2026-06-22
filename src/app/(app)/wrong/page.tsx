import { redirect } from 'next/navigation'
import Link from 'next/link'
import { eq, desc } from 'drizzle-orm'
import { getSession } from '@/lib/auth-server'
import { db } from '@/db'
import { wrongQuestions, quizQuestions, poems } from '@/db/schema'

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
    <div className="min-h-screen" style={{ background: '#fafaf7', color: '#1a1a1a' }}>
      <header className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: '#e8e4dc' }}>
        <Link href="/poems" className="text-sm" style={{ color: '#8a8a8a' }}>← 诗库</Link>
        <h1 className="text-xl font-serif tracking-widest">待加强</h1>
        <span className="text-sm" style={{ color: '#8a8a8a' }}>{unresolved.length} 道</span>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 space-y-8">
        {rows.length === 0 && (
          <div className="text-center py-20" style={{ color: '#8a8a8a' }}>
            <p className="text-4xl mb-4">🎉</p>
            <p className="text-sm">还没有待加强的内容，继续保持！</p>
          </div>
        )}

        {unresolved.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium" style={{ color: '#7c6b4f' }}>待加强</h2>
            {unresolved.map(row => (
              <div
                key={row.id}
                className="rounded-xl border p-4"
                style={{ background: '#fff', borderColor: '#e8e4dc' }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: '#f5f0eb', color: '#7c6b4f' }}
                      >
                        {row.poemTitle}
                      </span>
                      <span className="text-xs" style={{ color: '#8a8a8a' }}>
                        {row.pointType ?? TYPE_LABEL[row.type] ?? row.type}
                      </span>
                      <span className="text-xs" style={{ color: '#9a8a7a' }}>
                        {practiceLabel(row.type, row.wrongCount)}
                      </span>
                    </div>
                    <p className="text-sm line-clamp-2" style={{ color: '#1a1a1a' }}>{row.stem}</p>
                  </div>
                  <Link
                    href={`/quiz/${row.poemId}`}
                    className="shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium"
                    style={{ background: '#7c6b4f', color: '#fff' }}
                  >
                    去练习
                  </Link>
                </div>
              </div>
            ))}
          </section>
        )}

        {resolved.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium" style={{ color: '#8a8a8a' }}>已掌握</h2>
            {resolved.map(row => (
              <div
                key={row.id}
                className="rounded-xl border p-4 opacity-60"
                style={{ background: '#fff', borderColor: '#e8e4dc' }}
              >
                <div className="flex items-start gap-2 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#f5f3ef', color: '#8a8a8a' }}>
                    {row.poemTitle}
                  </span>
                  <span className="text-xs" style={{ color: '#8a8a8a' }}>
                    {row.pointType ?? TYPE_LABEL[row.type] ?? row.type}
                  </span>
                </div>
                <p className="text-sm mt-1 line-clamp-1" style={{ color: '#6a6a6a' }}>{row.stem}</p>
              </div>
            ))}
          </section>
        )}
      </main>
    </div>
  )
}
