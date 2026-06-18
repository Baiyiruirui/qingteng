import { streamText, convertToModelMessages } from 'ai'
import { and, eq } from 'drizzle-orm'
import { route } from '@/ai/router'
import { CHARACTER_SYSTEM_PROMPT } from '@/ai/prompts/v1/character'
import { getSession } from '@/lib/auth-server'
import { db } from '@/db'
import { conversations, users } from '@/db/schema'
import { appendMessage } from '@/db/repositories/messages'
import { recordEvent } from '@/db/repositories/events'
import { updateShortTerm } from '@/ai/memory/short-term'
import { buildSystemContext } from '@/ai/memory/build-context'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) {
    return Response.json(
      { error: { code: 'UNAUTHORIZED', message: '请先登录' } },
      { status: 401 },
    )
  }

  try {
    const { messages, conversationId } = await req.json()

    if (!conversationId) {
      return Response.json(
        { error: { code: 'BAD_REQUEST', message: '缺少 conversationId' } },
        { status: 400 },
      )
    }

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
    const lastMsg = messages[messages.length - 1]
    let userText = ''
    if (lastMsg?.role === 'user') {
      userText = (lastMsg.parts as Array<{ type: string; text?: string }>)
        ?.filter((p: { type: string }) => p.type === 'text')
        .map((p: { type: string; text?: string }) => p.text ?? '')
        .join('') ?? ''
      await appendMessage(conversationId, 'user', userText)
      updateShortTerm(session.userId, conversationId, { role: 'user', content: userText }).catch(
        e => console.error('[redis] updateShortTerm user failed:', e),
      )
    }

    // Build mid-term memory context (Redis-cached, degrades gracefully on failure)
    const profileContext = await buildSystemContext(session.userId, userName)

    const result = streamText({
      model: route.characterDialog,
      system: CHARACTER_SYSTEM_PROMPT + profileContext,
      messages: await convertToModelMessages(messages),
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
        // Update Redis snapshot after assistant message is saved
        updateShortTerm(session.userId, conversationId, { role: 'assistant', content: text }).catch(
          e => console.error('[redis] updateShortTerm assistant failed:', e),
        )
      },
    })
    return result.toUIMessageStreamResponse()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: { code: 'SERVER_ERROR', message } }, { status: 500 })
  }
}
