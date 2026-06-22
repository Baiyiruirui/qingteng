import { streamText, convertToModelMessages } from 'ai'
import { and, eq } from 'drizzle-orm'
import { route } from '@/ai/router'
import { buildImmersionSystem } from '@/ai/prompts/v1/immersion'
import { getSession } from '@/lib/auth-server'
import { db } from '@/db'
import { conversations, poems } from '@/db/schema'
import type { PoemLine } from '@/db/schema'
import { getImmersionScript } from '@/db/repositories/conversations'
import { appendMessage } from '@/db/repositories/messages'
import { recordEvent } from '@/db/repositories/events'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: { code: 'UNAUTHORIZED', message: '请先登录' } }, { status: 401 })
  }

  try {
    const { messages, conversationId } = await req.json()

    if (!conversationId) {
      return Response.json({ error: { code: 'BAD_REQUEST', message: '缺少 conversationId' } }, { status: 400 })
    }

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
    const lastMsg = messages[messages.length - 1]
    let userText = ''
    if (lastMsg?.role === 'user') {
      userText = (lastMsg.parts as Array<{ type: string; text?: string }>)
        ?.filter((p: { type: string }) => p.type === 'text')
        .map((p: { type: string; text?: string }) => p.text ?? '')
        .join('') ?? ''
      await appendMessage(conversationId, 'user', userText)
    }

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
            meta: { conversationId, totalTokens: usage.totalTokens },
          })
        } catch (e) {
          console.error('[immersion onFinish] failed to persist:', e)
        }
      },
    })

    return result.toUIMessageStreamResponse()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: { code: 'SERVER_ERROR', message } }, { status: 500 })
  }
}
