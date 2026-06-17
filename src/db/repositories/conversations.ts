import { db } from '@/db'
import { conversations, messages } from '@/db/schema'
import { eq, desc, asc } from 'drizzle-orm'

export async function getActiveConversation(userId: string) {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.createdAt))
    .limit(1)
  return conv ?? null
}

export async function createConversation(
  userId: string,
  mode: 'chat' | 'roleplay' | 'creative' = 'chat',
) {
  const [conv] = await db
    .insert(conversations)
    .values({ userId, mode })
    .returning()
  return conv
}

export async function getOrCreateActiveConversation(userId: string) {
  const existing = await getActiveConversation(userId)
  if (existing) return existing
  return createConversation(userId)
}

export async function loadMessages(conversationId: string) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))
}
