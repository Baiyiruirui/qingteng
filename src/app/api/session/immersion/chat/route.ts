import { streamText, convertToModelMessages } from 'ai'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { route } from '@/ai/router'
import { buildImmersionSystem } from '@/ai/prompts/v1/immersion'
import { getSession } from '@/lib/auth-server'
import { db } from '@/db'
import { conversations, poems } from '@/db/schema'
import type { PoemLine } from '@/db/schema'
import { getImmersionScript } from '@/db/repositories/conversations'
import { appendMessage } from '@/db/repositories/messages'
import { recordEvent } from '@/db/repositories/events'
import { extractImmersionAndStore } from '@/ai/memory/long-term'
import {
  checkRateLimits,
  PUBLIC_AI_BUDGET_POLICIES,
  rateLimitResponse,
} from '@/lib/rate-limit'
import { parseUiMessages } from '@/lib/request-limits'
import { scheduleAfterResponse } from '@/lib/after-response'

export const runtime = 'nodejs'

const requestSchema = z.object({
  conversationId: z.string().uuid(),
  messages: z.unknown(),
})

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: { code: 'UNAUTHORIZED', message: '请先登录' } }, { status: 401 })
  }

  const rateLimit = await checkRateLimits({
    req,
    userId: session.userId,
    policies: [
      ...PUBLIC_AI_BUDGET_POLICIES,
      { scope: 'immersion-chat-user-minute', identity: 'user', limit: 8, windowSeconds: 60 },
    ],
  })
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit)

  try {
    const parsedBody = requestSchema.safeParse(await req.json().catch(() => null))
    if (!parsedBody.success) {
      return Response.json(
        { error: { code: 'BAD_REQUEST', message: '请求格式不正确' } },
        { status: 400 },
      )
    }

    const parsedMessages = parseUiMessages(parsedBody.data.messages)
    if (!parsedMessages.success) {
      return Response.json(
        { error: { code: 'BAD_REQUEST', message: parsedMessages.message } },
        { status: 400 },
      )
    }

    const { conversationId } = parsedBody.data
    const { messages, lastUserText: userText } = parsedMessages.data

    // Verify conversation ownership and mode
    const [conv] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, session.userId)))
      .limit(1)

    if (!conv) {
      return Response.json({ error: { code: 'FORBIDDEN', message: '无权操作' } }, { status: 403 })
    }
    if (conv.mode !== 'roleplay') {
      return Response.json({ error: { code: 'BAD_REQUEST', message: '非沉浸模式' } }, { status: 400 })
    }
    if (!conv.poemId) {
      return Response.json({ error: { code: 'BAD_REQUEST', message: '缺少 poemId' } }, { status: 400 })
    }

    // Save user message
    await appendMessage(conversationId, 'user', userText)

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
      return Response.json({ error: { code: 'NOT_FOUND', message: '脚本或诗不存在' } }, { status: 404 })
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

    const result = streamText({
      model: route.characterDialog,
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      onFinish: async ({ text, usage, finishReason, model }) => {
        try {
          await appendMessage(conversationId, 'assistant', text, {
            kind: 'immersion',
            model: model.modelId,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
            finishReason,
          })
          await recordEvent({
            userId: session.userId,
            type: 'immersion',
            poemId: conv.poemId ?? undefined,
            meta: { conversationId, totalTokens: usage.totalTokens, memoryEligible: true },
          })
        } catch (e) {
          console.error('[immersion onFinish] failed to persist:', e)
        }

        await scheduleAfterResponse('immersion post-response memory', async () => {
          await extractImmersionAndStore({
            userId: session.userId,
            poemTitle: poemRow.title,
            poemAuthor: poemRow.author,
            role: script.role,
            userText,
            assistantText: text,
          })
        })
      },
    })

    return result.toUIMessageStreamResponse()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: { code: 'SERVER_ERROR', message } }, { status: 500 })
  }
}
