import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getSession } from '@/lib/auth-server'
import { db } from '@/db'
import { poems } from '@/db/schema'
import { createConversation, getImmersionScript } from '@/db/repositories/conversations'
import { invalidateProfile } from '@/ai/memory/mid-term'

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: '请先登录' } },
      { status: 401 },
    )
  }

  const body = await req.json().catch(() => ({}))
  const mode = body.mode as string | undefined
  const poemId = body.poemId as string | undefined

  if (!mode || !['chat', 'roleplay', 'creative'].includes(mode)) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'mode 必须是 chat / roleplay / creative' } },
      { status: 400 },
    )
  }

  if ((mode === 'roleplay' || mode === 'creative') && !poemId) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'roleplay / creative 模式需要 poemId' } },
      { status: 400 },
    )
  }

  if (poemId) {
    // Verify the poem exists
    const [poem] = await db
      .select({ id: poems.id })
      .from(poems)
      .where(eq(poems.id, poemId))
      .limit(1)

    if (!poem) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: '这首诗不存在' } },
        { status: 404 },
      )
    }

    // roleplay requires an immersion script
    if (mode === 'roleplay') {
      const script = await getImmersionScript(poemId)
      if (!script) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: '这首诗还没有沉浸脚本,敬请期待' } },
          { status: 404 },
        )
      }
    }
  }

  const conversation = await createConversation(
    session.userId,
    mode as 'chat' | 'roleplay' | 'creative',
    poemId,
  )

  // New conversation invalidates mid-term profile cache
  invalidateProfile(session.userId)

  return NextResponse.json({
    conversationId: conversation.id,
    mode: conversation.mode,
    poemId: conversation.poemId,
  })
}
