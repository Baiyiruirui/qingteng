import { streamText, convertToModelMessages } from 'ai'
import { and, eq } from 'drizzle-orm'
import { route } from '@/ai/router'
import { CHARACTER_SYSTEM_PROMPT } from '@/ai/prompts/v1/character'
import { getSession } from '@/lib/auth-server'
import { db } from '@/db'
import { conversations } from '@/db/schema'
import { appendMessage } from '@/db/repositories/messages'
import { recordEvent } from '@/db/repositories/events'

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

    // Verify the conversation belongs to this user
    const [conv] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, session.userId),
        ),
      )
      .limit(1)

    if (!conv) {
      return Response.json(
        { error: { code: 'FORBIDDEN', message: '无权操作' } },
        { status: 403 },
      )
    }

    // Save the new user message (always the last one in the array)
    const lastMsg = messages[messages.length - 1]
    if (lastMsg?.role === 'user') {
      const userText = (lastMsg.parts as Array<{ type: string; text?: string }>)
        ?.filter((p: { type: string }) => p.type === 'text')
        .map((p: { type: string; text?: string }) => p.text ?? '')
        .join('') ?? ''
      await appendMessage(conversationId, 'user', userText)
    }

    const result = streamText({
      model: route.characterDialog,
      system: CHARACTER_SYSTEM_PROMPT,
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
      },
    })
    return result.toUIMessageStreamResponse()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: { code: 'SERVER_ERROR', message } }, { status: 500 })
  }
}
