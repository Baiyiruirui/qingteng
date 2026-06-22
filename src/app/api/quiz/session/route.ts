import { NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { requireAuth } from '@/lib/auth-server'
import { db } from '@/db'
import { quizQuestions } from '@/db/schema'

export async function POST(req: Request) {
  await requireAuth()

  const { poemId } = (await req.json()) as { poemId: string }
  if (!poemId) {
    return NextResponse.json({ error: 'poemId required' }, { status: 400 })
  }

  // Fetch all v2 questions for this poem
  const all = await db
    .select()
    .from(quizQuestions)
    .where(and(eq(quizQuestions.poemId, poemId), eq(quizQuestions.version, 'v2')))

  if (all.length === 0) {
    return NextResponse.json({ error: 'No questions found for this poem' }, { status: 404 })
  }

  // Sample up to 5 questions with pointType coverage (prefer variety)
  const selected = sampleByPointType(all, 5)
  const sessionId = randomUUID()

  // Strip answer and scoringPoints — never expose to client
  const safeQuestions = selected.map(q => ({
    id: q.id,
    poemId: q.poemId,
    type: q.type,
    stem: q.stem,
    options: q.options as string[] | null,
    explanation: null, // revealed after judge
    difficulty: q.difficulty,
    pointType: q.pointType,
  }))

  return NextResponse.json({ sessionId, questions: safeQuestions })
}

function sampleByPointType(
  questions: typeof quizQuestions.$inferSelect[],
  count: number,
) {
  if (questions.length <= count) return questions

  // Group by pointType, pick one per type first
  const byType = new Map<string, typeof questions>()
  for (const q of questions) {
    const key = q.pointType ?? q.type
    if (!byType.has(key)) byType.set(key, [])
    byType.get(key)!.push(q)
  }

  const picked: typeof questions = []
  const types = [...byType.keys()]

  // Round-robin across pointTypes until we have enough
  let i = 0
  while (picked.length < count && i < types.length * count) {
    const type = types[i % types.length]
    const pool = byType.get(type)!
    const alreadyPicked = picked.filter(q => (q.pointType ?? q.type) === type).length
    if (alreadyPicked < pool.length) {
      picked.push(pool[alreadyPicked])
    }
    i++
  }

  return picked.slice(0, count)
}
