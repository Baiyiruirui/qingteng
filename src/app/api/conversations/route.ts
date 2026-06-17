import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth-server'
import { createConversation } from '@/db/repositories/conversations'

export async function POST() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: '请先登录' } },
      { status: 401 },
    )
  }

  const conversation = await createConversation(session.userId)
  return NextResponse.json({ conversationId: conversation.id })
}
