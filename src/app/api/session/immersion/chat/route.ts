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
import {
  appendUserMessageOnce,
  findAssistantMessageByReplyId,
  findUserMessageByClientId,
  loadAuthoritativeUiMessages,
} from '@/db/repositories/messages'
import { extractImmersionAndStore } from '@/ai/memory/long-term'
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
    return Response.json({ error: { code: 'UNAUTHORIZED', message: '请先登录' } }, { status: 401 })
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
      console.error('[immersion reliability] turn lock release failed:', error)
    })
  }

  try {
    await flushChatRecoveries(session.userId).catch(error => {
      console.error('[immersion reliability] recovery flush failed:', error)
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
      && queuedBeforeLock.mode === 'roleplay'
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
        && queuedAfterContention.mode === 'roleplay'
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
      && queuedAfterLock.mode === 'roleplay'
    ) {
      await releaseTurnLock()
      return replayQueuedAssistant(queuedAfterLock)
    }

    const rateLimit = await checkRateLimits({
      req,
      userId: session.userId,
      policies: [
        ...PUBLIC_AI_BUDGET_POLICIES,
        { scope: 'immersion-chat-user-minute', identity: 'user', limit: 8, windowSeconds: 60 },
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

    // Load authoritative model history, immersion script, and poem lines in parallel.
    const [authoritativeMessages, script, poemRow] = await Promise.all([
      loadAuthoritativeUiMessages(conversationId),
      getImmersionScript(conv.poemId),
      db
        .select({ title: poems.title, author: poems.author, lines: poems.lines })
        .from(poems)
        .where(eq(poems.id, conv.poemId))
        .limit(1)
        .then(rows => rows[0] ?? null),
    ])

    if (!script || !poemRow) {
      await releaseTurnLock()
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
      ...AI_GENERATION_BUDGETS.immersion,
      abortSignal: requestAbortSignal(req),
      system: systemPrompt,
      messages: await convertToModelMessages(authoritativeMessages),
      onFinish: async ({ text, usage, finishReason, model }) => {
        try {
          const reliabilityKey = createReliabilityKey(
            'roleplay',
            conversationId,
            clientMessageId,
          )
          const recovery: ChatRecoveryRecord = {
            version: 1,
            reliabilityKey,
            mode: 'roleplay',
            userId: session.userId,
            conversationId,
            clientMessageId,
            assistant: {
              content: text,
              meta: {
                kind: 'immersion',
                model: model.modelId,
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                totalTokens: usage.totalTokens,
                finishReason,
              },
            },
            event: {
              type: 'immersion',
              poemId: conv.poemId ?? undefined,
              meta: {
                conversationId,
                totalTokens: usage.totalTokens,
                memoryEligible: true,
              },
            },
            createdAt: new Date().toISOString(),
          }

          let durable = false
          try {
            await persistAssistantAndEvent(recovery)
            durable = true
          } catch (persistError) {
            console.error(
              '[immersion reliability] persistence failed, queueing recovery:',
              persistError,
            )
            try {
              await queueChatRecovery(recovery)
              durable = true
            } catch (queueError) {
              console.error('[immersion reliability] recovery queue failed:', queueError)
            }
          }

          if (!durable) return

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
        } finally {
          await releaseTurnLock()
        }
      },
      onError: async ({ error }) => {
        console.error('[immersion chat] model stream failed:', error)
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
    console.error('[immersion chat] request failed:', err)
    return Response.json(
      { error: { code: 'SERVER_ERROR', message: '服务暂时不可用，请稍后再试' } },
      { status: 500 },
    )
  }
}
