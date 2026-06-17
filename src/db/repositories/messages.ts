import { db } from '@/db'
import { messages } from '@/db/schema'

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
