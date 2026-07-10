import { generateText } from 'ai'
import { NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { route } from '@/ai/router'
import { buildImmersionSystem } from '@/ai/prompts/v1/immersion'
import { getSession } from '@/lib/auth-server'
import { db } from '@/db'
import { conversations, poems } from '@/db/schema'
import type { PoemLine } from '@/db/schema'
import { getImmersionScript, loadMessages } from '@/db/repositories/conversations'
import { appendMessage } from '@/db/repositories/messages'
import { recordEvent } from '@/db/repositories/events'
import {
  checkRateLimits,
  PUBLIC_AI_BUDGET_POLICIES,
  rateLimitResponse,
} from '@/lib/rate-limit'

export const runtime = 'nodejs'

const requestSchema = z.object({ conversationId: z.string().uuid() })

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: '请先登录' } }, { status: 401 })
  }

  const parsedBody = requestSchema.safeParse(await req.json().catch(() => null))
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'conversationId 不正确' } },
      { status: 400 },
    )
  }
  const { conversationId } = parsedBody.data

  // Verify conversation belongs to user and is roleplay mode
  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, session.userId)))
    .limit(1)

  if (!conv) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: '无权操作' } }, { status: 403 })
  }
  if (conv.mode !== 'roleplay') {
    return NextResponse.json({ error: { code: 'BAD_REQUEST', message: '非沉浸模式' } }, { status: 400 })
  }
  if (!conv.poemId) {
    return NextResponse.json({ error: { code: 'BAD_REQUEST', message: '缺少 poemId' } }, { status: 400 })
  }

  // Idempotent: if conversation already has messages, return null
  const existing = await loadMessages(conversationId)
  if (existing.length > 0) {
    return NextResponse.json({ opening: null })
  }

  const rateLimit = await checkRateLimits({
    req,
    userId: session.userId,
    policies: [
      ...PUBLIC_AI_BUDGET_POLICIES,
      { scope: 'immersion-opening-user-hour', identity: 'user', limit: 12, windowSeconds: 60 * 60 },
    ],
  })
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit)

  // Load immersion script + poem lines in parallel
  const [script, poemRow] = await Promise.all([
    getImmersionScript(conv.poemId),
    db
      .select({ title: poems.title, author: poems.author, lines: poems.lines })
      .from(poems)
      .where(eq(poems.id, conv.poemId))
      .limit(1)
      .then(rows => rows[0] ?? null),
  ])

  if (!script || !poemRow) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: '脚本或诗不存在' } }, { status: 404 })
  }

  const poemLines = (poemRow.lines as PoemLine[]).map(l => l.content)

  const systemPrompt = buildImmersionSystem({
    title: poemRow.title,
    author: poemRow.author,
    role: script.role,
    scene: script.scene,
    teachingGoals: script.teachingGoals as string[],
    openingMove: script.openingMove,
    keyBeats: script.keyBeats as string[],
    exitCondition: script.exitCondition,
    poemLines,
  })

  const result = await generateText({
    model: route.characterDialog,
    system: systemPrompt,
    prompt: '请用开场白把学生带入诗的情境。',
  })

  const openingText = result.text.trim()

  const msg = await appendMessage(conversationId, 'assistant', openingText, {
    kind: 'immersion_opening',
    model: result.steps[0]?.model.modelId ?? 'characterDialog',
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  })

  await recordEvent({
    userId: session.userId,
    type: 'immersion',
    poemId: conv.poemId,
    meta: { conversationId, subType: 'opening' },
  }).catch(() => {})

  return NextResponse.json({
    opening: { id: msg.id, role: 'assistant', content: openingText },
  })
}
