import { streamText, convertToModelMessages } from 'ai'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { route } from '@/ai/router'
import { CHARACTER_SYSTEM_PROMPT } from '@/ai/prompts/v1/character'
import { getSession } from '@/lib/auth-server'
import { db } from '@/db'
import { conversations, users } from '@/db/schema'
import { appendMessage } from '@/db/repositories/messages'
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
    const { messages, lastUserText: userText } = parsedMessages.data

    // Verify conversation ownership and fetch user name in parallel
    const [convRows, userRows] = await Promise.all([
      db
        .select({ id: conversations.id })
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

    const userName = userRows[0]?.name ?? ''

    // Save the new user message (last in array) to PG and Redis
    await appendMessage(conversationId, 'user', userText)
    updateShortTerm(session.userId, conversationId, { role: 'user', content: userText }).catch(
      e => console.error('[redis] updateShortTerm user failed:', e),
    )

    // Build mid-term profile context + recall long-term memories in parallel
    const [profileContext, recalled] = await Promise.all([
      buildSystemContext(session.userId, userName),
      recall(session.userId, userText).catch(() => []),
    ])

    const systemPrompt =
      CHARACTER_SYSTEM_PROMPT + profileContext + renderMemoryContext(recalled)

    const result = streamText({
      model: route.characterDialog,
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
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

        // Update Redis short-term snapshot
        updateShortTerm(session.userId, conversationId, { role: 'assistant', content: text }).catch(
          e => console.error('[redis] updateShortTerm assistant failed:', e),
        )

        // Extract long-term memories from this turn — fire-and-forget, never blocks
        const transcript = `${userName}: ${userText}\n青藤: ${text}`
        extractAndStore(session.userId, transcript).catch(
          e => console.error('[long-term] extract failed:', e),
        )
      },
    })
    return result.toUIMessageStreamResponse()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: { code: 'SERVER_ERROR', message } }, { status: 500 })
  }
}
