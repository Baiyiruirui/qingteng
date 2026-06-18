import { generateText } from 'ai'
import { NextResponse } from 'next/server'
import { route } from '@/ai/router'
import { CHARACTER_SYSTEM_PROMPT } from '@/ai/prompts/v1/character'
import { buildOpeningUserPrompt } from '@/ai/prompts/v1/opening'
import { getCurrentUser } from '@/lib/auth-server'
import { getShortTerm } from '@/ai/memory/short-term'
import { getOrCreateActiveConversation, loadMessages } from '@/db/repositories/conversations'
import { appendMessage } from '@/db/repositories/messages'
import { recordEvent } from '@/db/repositories/events'

export const runtime = 'nodejs'

export async function POST() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const conversation = await getOrCreateActiveConversation(user.id)

  // If this conversation already has messages, skip generating an opening
  const existing = await loadMessages(conversation.id)
  if (existing.length > 0) {
    return NextResponse.json({ opening: null, conversationId: conversation.id })
  }

  const snapshot = await getShortTerm(user.id).catch(() => null)
  const userPrompt = buildOpeningUserPrompt({ userName: user.name, snapshot })

  const result = await generateText({
    model: route.characterDialog,
    system: CHARACTER_SYSTEM_PROMPT,
    prompt: userPrompt,
  })

  const openingText = result.text.trim()

  const msg = await appendMessage(conversation.id, 'assistant', openingText, {
    kind: 'opening',
    model: result.steps[0]?.model.modelId ?? 'characterDialog',
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  })

  await recordEvent({
    userId: user.id,
    type: 'opening',
    meta: {
      conversationId: conversation.id,
      isReturning: !!snapshot && snapshot.recentMessages.length > 0,
    },
  }).catch(() => {})

  return NextResponse.json({
    opening: { id: msg.id, role: 'assistant', content: openingText },
    conversationId: conversation.id,
  })
}
