import type { UIMessage } from 'ai'
import { desc, eq } from 'drizzle-orm'
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
