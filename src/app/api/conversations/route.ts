import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth-server'
import {
  createConversation,
  listConversationHistory,
} from '@/db/repositories/conversations'
import { invalidateProfile } from '@/ai/memory/mid-term'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: '请先登录' } },
      { status: 401 },
    )
  }

  const requestedLimit = Number(new URL(request.url).searchParams.get('limit') ?? 20)
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(30, Math.max(1, Math.trunc(requestedLimit)))
    : 20
  const items = await listConversationHistory(session.userId, limit)

  return NextResponse.json({ items })
}

export async function POST() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: '请先登录' } },
      { status: 401 },
    )
  }

  const conversation = await createConversation(session.userId)
  // Invalidate profile cache so next message sees latest conversation data
  invalidateProfile(session.userId)
  return NextResponse.json({ conversationId: conversation.id })
}
