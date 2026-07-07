import { NextResponse } from 'next/server'
import { desc, eq, and } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { requireAuth } from '@/lib/auth-server'
import { db } from '@/db'
import { quizAttempts, quizQuestions, wrongQuestions } from '@/db/schema'
import {
  selectAdaptiveQuestions,
  type PointMasterySignal,
  type QuizSessionMode,
} from '@/ai/quiz/adaptive'

export async function POST(req: Request) {
  const session = await requireAuth()

  const { poemId, mode = 'adaptive', focusPointType } = (await req.json()) as {
    poemId: string
    mode?: QuizSessionMode
    focusPointType?: string | null
  }
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

  const { signals, focusQuestionIds } = await getMasterySignals(session.userId, poemId)
  const { selected, plan } = selectAdaptiveQuestions({
    questions: all,
    signals,
    mode: mode === 'review' ? 'review' : 'adaptive',
    focusPointType: focusPointType ?? null,
    focusQuestionIds,
    count: 5,
  })
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

  return NextResponse.json({ sessionId, questions: safeQuestions, plan })
}

async function getMasterySignals(userId: string, poemId: string) {
  const [attemptRows, wrongRows] = await Promise.all([
    db
      .select({
        pointType: quizQuestions.pointType,
        type: quizQuestions.type,
        isCorrect: quizAttempts.isCorrect,
        completionRate: quizAttempts.completionRate,
      })
      .from(quizAttempts)
      .innerJoin(quizQuestions, eq(quizAttempts.questionId, quizQuestions.id))
      .where(eq(quizAttempts.userId, userId))
      .orderBy(desc(quizAttempts.createdAt))
      .limit(80),
    db
      .select({
        questionId: wrongQuestions.questionId,
        poemId: wrongQuestions.poemId,
        wrongCount: wrongQuestions.wrongCount,
        resolved: wrongQuestions.resolved,
        pointType: quizQuestions.pointType,
        type: quizQuestions.type,
      })
      .from(wrongQuestions)
      .innerJoin(quizQuestions, eq(wrongQuestions.questionId, quizQuestions.id))
      .where(eq(wrongQuestions.userId, userId))
      .orderBy(desc(wrongQuestions.lastWrongAt))
      .limit(80),
  ])

  const stats = new Map<string, { weakScore: number; attemptCount: number; scoreSum: number }>()
  const add = (pointType: string, score: number, weakScore: number) => {
    const current = stats.get(pointType) ?? { weakScore: 0, attemptCount: 0, scoreSum: 0 }
    current.weakScore += weakScore
    current.attemptCount += 1
    current.scoreSum += score
    stats.set(pointType, current)
  }

  for (const attempt of attemptRows) {
    const pointType = attempt.pointType ?? attempt.type
    const score = attempt.isCorrect !== null
      ? (attempt.isCorrect ? 1 : 0)
      : (attempt.completionRate ?? 0)
    const weakScore = score < 0.5 ? 2 : score < 0.8 ? 1 : 0
    add(pointType, score, weakScore)
  }

  const focusQuestionIds: string[] = []
  for (const wrong of wrongRows) {
    if (wrong.resolved) continue
    const pointType = wrong.pointType ?? wrong.type
    const isSamePoem = wrong.poemId === poemId
    if (isSamePoem) focusQuestionIds.push(wrong.questionId)
    add(pointType, 0, (isSamePoem ? 3 : 1) * wrong.wrongCount)
  }

  const signals: PointMasterySignal[] = [...stats.entries()].map(([pointType, stat]) => ({
    pointType,
    weakScore: stat.weakScore,
    attemptCount: stat.attemptCount,
    averageScore: stat.attemptCount > 0 ? stat.scoreSum / stat.attemptCount : null,
  }))

  return {
    signals,
    focusQuestionIds,
  }
}
