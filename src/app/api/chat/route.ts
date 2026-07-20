import { streamText, convertToModelMessages } from 'ai'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { route } from '@/ai/router'
import { CHARACTER_SYSTEM_PROMPT } from '@/ai/prompts/v1/character'
import { getSession } from '@/lib/auth-server'
import { db } from '@/db'
import { conversations, users } from '@/db/schema'
import {
  appendUserMessageOnce,
  findAssistantMessageByReplyId,
  findUserMessageByClientId,
  loadAuthoritativeUiMessages,
} from '@/db/repositories/messages'
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
import { AI_GENERATION_BUDGETS, requestAbortSignal } from '@/lib/ai-budget'
import {
  acquireTurnLock,
  createReliabilityKey,
  flushChatRecoveries,
  getQueuedRecovery,
  persistAssistantAndEvent,
  queueChatRecovery,
  releaseReliabilityLock,
  replayAssistantMessage,
  replayQueuedAssistant,
  startTurnLockHeartbeat,
  type ChatRecoveryRecord,
} from '@/lib/chat-reliability'

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

  let turnLock: Awaited<ReturnType<typeof acquireTurnLock>> = null
  let stopLockHeartbeat: (() => void) | null = null
  let lockManagedByStream = false
  const releaseTurnLock = async () => {
    stopLockHeartbeat?.()
    stopLockHeartbeat = null
    const lock = turnLock
    turnLock = null
    await releaseReliabilityLock(lock).catch(error => {
      console.error('[chat reliability] turn lock release failed:', error)
    })
  }

  try {
    await flushChatRecoveries(session.userId).catch(error => {
      console.error('[chat reliability] recovery flush failed:', error)
    })

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
    const { messageId: clientMessageId, lastUserText: userText } = parsedMessages.data

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

    const persistedUser = await findUserMessageByClientId(conversationId, clientMessageId)
    if (persistedUser && persistedUser.content !== userText) {
      return Response.json(
        { error: { code: 'MESSAGE_ID_CONFLICT', message: '消息标识已被其他内容使用' } },
        { status: 409 },
      )
    }

    const persistedAssistant = await findAssistantMessageByReplyId(
      conversationId,
      clientMessageId,
    )
    if (persistedAssistant) return replayAssistantMessage(persistedAssistant)

    const queuedBeforeLock = await getQueuedRecovery(conversationId, clientMessageId)
    if (
      queuedBeforeLock
      && queuedBeforeLock.userId === session.userId
      && queuedBeforeLock.mode === 'chat'
    ) {
      return replayQueuedAssistant(queuedBeforeLock)
    }

    turnLock = await acquireTurnLock(conversationId, clientMessageId)
    if (!turnLock) {
      const [assistantAfterContention, queuedAfterContention] = await Promise.all([
        findAssistantMessageByReplyId(conversationId, clientMessageId),
        getQueuedRecovery(conversationId, clientMessageId),
      ])
      if (assistantAfterContention) return replayAssistantMessage(assistantAfterContention)
      if (
        queuedAfterContention
        && queuedAfterContention.userId === session.userId
        && queuedAfterContention.mode === 'chat'
      ) {
        return replayQueuedAssistant(queuedAfterContention)
      }

      return Response.json(
        { error: { code: 'REQUEST_IN_PROGRESS', message: '这条消息正在处理中，请稍后重试' } },
        { status: 409 },
      )
    }
    stopLockHeartbeat = startTurnLockHeartbeat(turnLock)

    const [assistantAfterLock, queuedAfterLock] = await Promise.all([
      findAssistantMessageByReplyId(conversationId, clientMessageId),
      getQueuedRecovery(conversationId, clientMessageId),
    ])
    if (assistantAfterLock) {
      await releaseTurnLock()
      return replayAssistantMessage(assistantAfterLock)
    }
    if (
      queuedAfterLock
      && queuedAfterLock.userId === session.userId
      && queuedAfterLock.mode === 'chat'
    ) {
      await releaseTurnLock()
      return replayQueuedAssistant(queuedAfterLock)
    }

    const rateLimit = await checkRateLimits({
      req,
      userId: session.userId,
      policies: [
        ...PUBLIC_AI_BUDGET_POLICIES,
        { scope: 'chat-user-minute', identity: 'user', limit: 8, windowSeconds: 60 },
      ],
    })
    if (!rateLimit.allowed) {
      await releaseTurnLock()
      return rateLimitResponse(rateLimit)
    }

    const userMessage = await appendUserMessageOnce({
      conversationId,
      clientMessageId,
      content: userText,
    })
    if (!userMessage.contentMatches) {
      await releaseTurnLock()
      return Response.json(
        { error: { code: 'MESSAGE_ID_CONFLICT', message: '消息标识已被其他内容使用' } },
        { status: 409 },
      )
    }
    if (userMessage.inserted) {
      await updateShortTerm(
        session.userId,
        conversationId,
        { role: 'user', content: userText },
      ).catch(error => console.error('[redis] updateShortTerm user failed:', error))
    }

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
      ...AI_GENERATION_BUDGETS.chat,
      abortSignal: requestAbortSignal(req),
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
          const reliabilityKey = createReliabilityKey('chat', conversationId, clientMessageId)
          const recovery: ChatRecoveryRecord = {
            version: 1,
            reliabilityKey,
            mode: 'chat',
            userId: session.userId,
            conversationId,
            clientMessageId,
            assistant: {
              content: text,
              meta: {
                model: model.modelId,
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                totalTokens: usage.totalTokens,
                finishReason,
              },
            },
            event: {
              type: 'chat',
              meta: { conversationId, totalTokens: usage.totalTokens },
            },
            createdAt: new Date().toISOString(),
          }

          let durable = false
          try {
            await persistAssistantAndEvent(recovery)
            durable = true
          } catch (persistError) {
            console.error('[chat reliability] persistence failed, queueing recovery:', persistError)
            try {
              await queueChatRecovery(recovery)
              durable = true
            } catch (queueError) {
              console.error('[chat reliability] recovery queue failed:', queueError)
            }
          }

          if (!durable) return

          const transcript = `${userName}: ${userText}\n青藤: ${text}`
          await scheduleAfterResponse('chat post-response memory', async () => {
            await Promise.all([
              updateShortTerm(session.userId, conversationId, { role: 'assistant', content: text }),
              extractAndStore(session.userId, transcript),
            ])
          })
        } finally {
          await releaseTurnLock()
        }
      },
      onError: async ({ error }) => {
        console.error('[chat] model stream failed:', error)
        await releaseTurnLock()
      },
      onAbort: async () => {
        await releaseTurnLock()
      },
    })
    lockManagedByStream = true
    return result.toUIMessageStreamResponse()
  } catch (err) {
    if (!lockManagedByStream) await releaseTurnLock()
    console.error('[chat] request failed:', err)
    return Response.json(
      { error: { code: 'SERVER_ERROR', message: '服务暂时不可用，请稍后再试' } },
      { status: 500 },
    )
  }
}
