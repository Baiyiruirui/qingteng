import { NextResponse } from 'next/server'
import { eq, and, sql } from 'drizzle-orm'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth-server'
import { db } from '@/db'
import { quizQuestions, quizAttempts, wrongQuestions } from '@/db/schema'
import { getPoemForQuiz } from '@/db/repositories/poems'
import { judgeObjective, judgeSubjective } from '@/ai/quiz/judge'
import { getWrongQuestionOutcome } from '@/ai/quiz/wrong-question'
import {
  checkRateLimits,
  PUBLIC_AI_BUDGET_POLICIES,
  rateLimitResponse,
} from '@/lib/rate-limit'

const requestSchema = z.object({
  questionId: z.string().uuid(),
  userAnswer: z.string().trim().min(1).max(2_000),
  sessionId: z.string().uuid(),
})

export async function POST(req: Request) {
  const session = await requireAuth()
  const { userId } = session

  const parsedBody = requestSchema.safeParse(await req.json().catch(() => null))
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  const { questionId, userAnswer, sessionId } = parsedBody.data

  // Idempotency: if this session+question was already judged, return cached result
  const [existing] = await db
    .select()
    .from(quizAttempts)
    .where(and(eq(quizAttempts.sessionId, sessionId), eq(quizAttempts.questionId, questionId)))
    .limit(1)

  const [question] = await db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.id, questionId))
    .limit(1)

  if (!question) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404 })
  }

  if (existing) {
    // Already judged — return cached result without re-running LLM or re-incrementing counts
    return NextResponse.json({
      ...(existing.isCorrect !== null && { isCorrect: existing.isCorrect }),
      ...(existing.completionRate !== null && { completionRate: existing.completionRate }),
      answer: question.answer,
      explanation: question.explanation,
      ...(existing.hitPoints !== null && { hitPoints: existing.hitPoints }),
      ...(existing.missedPoints !== null && { missedPoints: existing.missedPoints }),
      ...(existing.feedback !== null && { feedback: existing.feedback }),
    })
  }

  const type = question.type as 'mcq' | 'fill' | 'appreciate' | 'translate'
  const isObjective = type === 'mcq' || type === 'fill'

  let isCorrect: boolean | null = null
  let completionRate: number | null = null
  let hitPoints: string[] | null = null
  let missedPoints: string[] | null = null
  let feedback: string | null = null

  if (isObjective) {
    const result = judgeObjective(
      { type, answer: question.answer, options: question.options as string[] | null },
      userAnswer,
    )
    isCorrect = result.isCorrect
    completionRate = null
  } else {
    const rateLimit = await checkRateLimits({
      req,
      userId,
      policies: [
        ...PUBLIC_AI_BUDGET_POLICIES,
        { scope: 'quiz-judge-user-minute', identity: 'user', limit: 10, windowSeconds: 60 },
      ],
    })
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit, { errorShape: 'string' })
    }

    const scoringPoints = (question.scoringPoints ?? []) as string[]
    if (scoringPoints.length === 0) {
      return NextResponse.json({ error: 'Question missing scoringPoints — run backfill first' }, { status: 422 })
    }

    const poem = await getPoemForQuiz(question.poemId)
    if (!poem) {
      return NextResponse.json({ error: 'Poem not found' }, { status: 404 })
    }

    const result = await judgeSubjective(
      { type, stem: question.stem, answer: question.answer, scoringPoints },
      userAnswer,
      poem,
    )
    isCorrect = null
    completionRate = result.completionRate
    hitPoints = result.hitPoints
    missedPoints = result.missedPoints
    feedback = result.feedback
  }

  const wrongQuestionOutcome = getWrongQuestionOutcome({
    isObjective,
    isCorrect,
    completionRate,
  })

  await db.transaction(async tx => {
    // The attempt and wrong-book state must either both persist or both roll back.
    await tx.insert(quizAttempts).values({
      userId,
      questionId,
      poemId: question.poemId,
      sessionId,
      userAnswer,
      isCorrect,
      completionRate,
      hitPoints,
      missedPoints,
      feedback,
    })

    if (wrongQuestionOutcome === 'increment') {
      await tx
        .insert(wrongQuestions)
        .values({ userId, questionId, poemId: question.poemId, wrongCount: 1, resolved: false })
        .onConflictDoUpdate({
          target: [wrongQuestions.userId, wrongQuestions.questionId],
          set: {
            wrongCount: sql`${wrongQuestions.wrongCount} + 1`,
            lastWrongAt: sql`now()`,
            resolved: false,
          },
        })
    }

    if (wrongQuestionOutcome === 'resolve') {
      await tx
        .update(wrongQuestions)
        .set({ resolved: true })
        .where(and(eq(wrongQuestions.userId, userId), eq(wrongQuestions.questionId, questionId)))
    }
  })

  return NextResponse.json({
    ...(isCorrect !== null && { isCorrect }),
    ...(completionRate !== null && { completionRate }),
    answer: question.answer,
    explanation: question.explanation,
    ...(hitPoints !== null && { hitPoints }),
    ...(missedPoints !== null && { missedPoints }),
    ...(feedback !== null && { feedback }),
  })
}
