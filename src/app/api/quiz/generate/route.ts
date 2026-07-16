import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth-server'
import { canUseInternalTools } from '@/lib/demo-guard'
import { generateQuestion } from '@/ai/quiz/generate'
import type { QuizType, QuizDifficulty } from '@/ai/prompts/v1/quiz-generate'
import { requestAbortSignal } from '@/lib/ai-budget'

export const runtime = 'nodejs'

const VALID_TYPES: QuizType[] = ['mcq', 'fill', 'translate', 'appreciate']
const VALID_DIFFICULTIES: QuizDifficulty[] = ['易', '中', '难']

export async function POST(req: Request) {
  if (!(await canUseInternalTools())) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: '出题生成接口仅限内部调试使用' } },
      { status: 403 },
    )
  }

  const session = await getSession()
  if (!session) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: '请先登录' } },
      { status: 401 },
    )
  }

  const body = await req.json().catch(() => ({}))
  const { poemId, type, difficulty } = body as {
    poemId?: string
    type?: string
    difficulty?: string
  }

  if (!poemId) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: '缺少 poemId' } },
      { status: 400 },
    )
  }
  if (!type || !VALID_TYPES.includes(type as QuizType)) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'type 必须是 mcq|fill|translate|appreciate' } },
      { status: 400 },
    )
  }
  if (!difficulty || !VALID_DIFFICULTIES.includes(difficulty as QuizDifficulty)) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'difficulty 必须是 易|中|难' } },
      { status: 400 },
    )
  }

  try {
    const question = await generateQuestion(
      poemId,
      type as QuizType,
      difficulty as QuizDifficulty,
      { abortSignal: requestAbortSignal(req) },
    )
    return NextResponse.json({ question })
  } catch (err) {
    console.error('[quiz/generate] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: '生成题目失败，请稍后再试' } },
      { status: 500 },
    )
  }
}
