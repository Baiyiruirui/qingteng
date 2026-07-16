import { streamText, convertToModelMessages } from 'ai'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { route } from '@/ai/router'
import { CHARACTER_SYSTEM_PROMPT } from '@/ai/prompts/v1/character'
import { getSession } from '@/lib/auth-server'
import { db } from '@/db'
import { conversations, users } from '@/db/schema'
import { appendMessage, loadAuthoritativeUiMessages } from '@/db/repositories/messages'
import { recordEvent } from '@/db/repositories/events'
import { updateShortTerm } from '@/ai/memory/short-term'
import { buildSystemContext, renderMemoryContext } from '@/ai/memory/build-context'
import { recall, extractAndStore } from '@/ai/memory/long-term'
import { telemetry } from '@/ai/observability/telemetry'
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
    return Response.json(
      { error: { code: 'UNAUTHORIZED', message: '请先登录' } },
      { status: 401 },
    )
  }

  const rateLimit = await checkRateLimits({
    req,
    userId: session.userId,
    policies: [
      ...PUBLIC_AI_BUDGET_POLICIES,
      { scope: 'chat-user-minute', identity: 'user', limit: 8, windowSeconds: 60 },
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
    const { lastUserText: userText } = parsedMessages.data

    // Verify conversation ownership and fetch user name in parallel
    const [convRows, userRows] = await Promise.all([
      db
        .select({ id: conversations.id, mode: conversations.mode })
        .from(conversations)
        .where(
          and(
            eq(conversations.id, conversationId),
            eq(conversations.userId, session.userId),
          ),
        )
        .limit(1),
      db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1),
    ])

    if (!convRows[0]) {
      return Response.json(
        { error: { code: 'FORBIDDEN', message: '无权操作' } },
        { status: 403 },
      )
    }
    if (convRows[0].mode !== 'chat') {
      return Response.json(
        { error: { code: 'BAD_REQUEST', message: '非日常对话模式' } },
        { status: 400 },
      )
    }

    const userName = userRows[0]?.name ?? ''

    // Save the new user message (last in array) to PG and Redis
    await appendMessage(conversationId, 'user', userText)
    await updateShortTerm(session.userId, conversationId, { role: 'user', content: userText }).catch(
      e => console.error('[redis] updateShortTerm user failed:', e),
    )

    // Rebuild model history from PostgreSQL after the current user message is durable.
    const [authoritativeMessages, profileContext, recalled] = await Promise.all([
      loadAuthoritativeUiMessages(conversationId),
      buildSystemContext(session.userId, userName),
      recall(session.userId, userText).catch(() => []),
    ])

    const systemPrompt =
      CHARACTER_SYSTEM_PROMPT + profileContext + renderMemoryContext(recalled)

    const result = streamText({
      model: route.characterDialog,
      system: systemPrompt,
      messages: await convertToModelMessages(authoritativeMessages),
      experimental_telemetry: telemetry('qingteng.chat', {
        route: '/api/chat',
        conversationId,
        userId: session.userId,
        recalledMemoryCount: recalled.length,
      }),
      onFinish: async ({ text, usage, finishReason, model }) => {
        try {
          await appendMessage(conversationId, 'assistant', text, {
            model: model.modelId,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
            finishReason,
          })
          await recordEvent({
            userId: session.userId,
            type: 'chat',
            meta: { conversationId, totalTokens: usage.totalTokens },
          })
        } catch (e) {
          console.error('[onFinish] failed to persist:', e)
        }

        const transcript = `${userName}: ${userText}\n青藤: ${text}`
        await scheduleAfterResponse('chat post-response memory', async () => {
          await Promise.all([
            updateShortTerm(session.userId, conversationId, { role: 'assistant', content: text }),
            extractAndStore(session.userId, transcript),
          ])
        })
      },
    })
    return result.toUIMessageStreamResponse()
  } catch (err) {
    console.error('[chat] request failed:', err)
    return Response.json(
      { error: { code: 'SERVER_ERROR', message: '服务暂时不可用，请稍后再试' } },
      { status: 500 },
    )
  }
}
