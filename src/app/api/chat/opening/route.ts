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
import { telemetry } from '@/ai/observability/telemetry'
import {
  checkRateLimits,
  PUBLIC_AI_BUDGET_POLICIES,
  rateLimitResponse,
} from '@/lib/rate-limit'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const conversation = await getOrCreateActiveConversation(user.id)

  // If this conversation already has messages, skip generating an opening
  const existing = await loadMessages(conversation.id)
  if (existing.length > 0) {
    return NextResponse.json({ opening: null, conversationId: conversation.id })
  }

  const rateLimit = await checkRateLimits({
    req,
    userId: user.id,
    policies: [
      ...PUBLIC_AI_BUDGET_POLICIES,
      { scope: 'opening-user-hour', identity: 'user', limit: 12, windowSeconds: 60 * 60 },
    ],
  })
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit)

  const snapshot = await getShortTerm(user.id).catch(() => null)
  const userPrompt = buildOpeningUserPrompt({ userName: user.name, snapshot })

  const result = await generateText({
    model: route.characterDialog,
    system: CHARACTER_SYSTEM_PROMPT,
    prompt: userPrompt,
    experimental_telemetry: telemetry('qingteng.opening', {
      route: '/api/chat/opening',
      conversationId: conversation.id,
      userId: user.id,
      isReturning: !!snapshot && snapshot.recentMessages.length > 0,
    }),
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
