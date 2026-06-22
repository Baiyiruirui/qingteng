import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth-server'
import { db } from '@/db'
import { quizQuestions } from '@/db/schema'
import { eq } from 'drizzle-orm'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: '请先登录' } }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const poemId = searchParams.get('poemId')

  if (!poemId) {
    return NextResponse.json({ error: { code: 'BAD_REQUEST', message: '缺少 poemId' } }, { status: 400 })
  }

  const questions = await db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.poemId, poemId))
    .orderBy(quizQuestions.type, quizQuestions.difficulty)

  return NextResponse.json({
    questions: questions.map(q => ({
      id: q.id,
      poemId: q.poemId,
      type: q.type,
      stem: q.stem,
      options: q.options as string[] | null,
      answer: q.answer,
      explanation: q.explanation,
      evidenceLines: q.evidenceLines as string[],
      difficulty: q.difficulty,
      qualityScore: q.qualityScore,
      evidenceValid: q.evidenceValid,
      version: q.version,
      pointType: q.pointType,
      pointId: q.pointId,
      promptVersion: q.promptVersion,
      createdAt: q.createdAt,
    })),
  })
}
