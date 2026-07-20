import type { UIMessage } from 'ai'
import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { messages } from '@/db/schema'
import {
  MAX_ASSISTANT_MESSAGE_CHARS,
  MAX_CHAT_CONTEXT_CHARS,
  MAX_CHAT_MESSAGES,
  MAX_USER_MESSAGE_CHARS,
} from '@/lib/request-limits'

export async function appendMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  meta?: Record<string, unknown>,
) {
  const [msg] = await db
    .insert(messages)
    .values({ conversationId, role, content, meta })
    .returning()
  return msg
}

export type PersistedMessage = typeof messages.$inferSelect

export async function findUserMessageByClientId(
  conversationId: string,
  clientMessageId: string,
): Promise<PersistedMessage | null> {
  const [message] = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.role, 'user'),
        sql`${messages.meta} ->> 'clientMessageId' = ${clientMessageId}`,
      ),
    )
    .limit(1)

  return message ?? null
}

export async function findAssistantMessageByReplyId(
  conversationId: string,
  clientMessageId: string,
): Promise<PersistedMessage | null> {
  const [message] = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.role, 'assistant'),
        sql`${messages.meta} ->> 'inReplyTo' = ${clientMessageId}`,
      ),
    )
    .limit(1)

  return message ?? null
}

export async function appendUserMessageOnce({
  conversationId,
  clientMessageId,
  content,
}: {
  conversationId: string
  clientMessageId: string
  content: string
}) {
  const existing = await findUserMessageByClientId(conversationId, clientMessageId)
  if (existing) {
    return {
      message: existing,
      inserted: false,
      contentMatches: existing.content === content,
    }
  }

  const message = await appendMessage(conversationId, 'user', content, {
    clientMessageId,
  })
  return { message, inserted: true, contentMatches: true }
}

export async function appendAssistantMessageOnce({
  conversationId,
  clientMessageId,
  content,
  meta,
}: {
  conversationId: string
  clientMessageId: string
  content: string
  meta?: Record<string, unknown>
}) {
  const existing = await findAssistantMessageByReplyId(conversationId, clientMessageId)
  if (existing) return { message: existing, inserted: false }

  const message = await appendMessage(conversationId, 'assistant', content, {
    ...meta,
    inReplyTo: clientMessageId,
  })
  return { message, inserted: true }
}

export async function loadAuthoritativeUiMessages(
  conversationId: string,
): Promise<UIMessage[]> {
  const rows = await db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(MAX_CHAT_MESSAGES)

  const newestFirst: UIMessage[] = []
  let totalChars = 0

  for (const row of rows) {
    if (row.role !== 'user' && row.role !== 'assistant') continue
    if (!row.content.trim()) continue

    const maxChars = row.role === 'user'
      ? MAX_USER_MESSAGE_CHARS
      : MAX_ASSISTANT_MESSAGE_CHARS
    if (row.content.length > maxChars) continue
    if (totalChars + row.content.length > MAX_CHAT_CONTEXT_CHARS) break

    newestFirst.push({
      id: row.id,
      role: row.role,
      parts: [{ type: 'text', text: row.content }],
    })
    totalChars += row.content.length
  }

  return newestFirst.reverse()
}
