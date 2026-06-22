import { db } from '@/db'
import { conversations, messages, immersionScripts } from '@/db/schema'
import { eq, desc, asc, and } from 'drizzle-orm'

export async function getActiveConversation(userId: string) {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.userId, userId), eq(conversations.mode, 'chat')))
    .orderBy(desc(conversations.createdAt))
    .limit(1)
  return conv ?? null
}

export async function createConversation(
  userId: string,
  mode: 'chat' | 'roleplay' | 'creative' = 'chat',
  poemId?: string,
) {
  const [conv] = await db
    .insert(conversations)
    .values({ userId, mode, poemId })
    .returning()
  return conv
}

export async function getOrCreateActiveConversation(userId: string) {
  const existing = await getActiveConversation(userId)
  if (existing) return existing
  return createConversation(userId)
}

export async function getConversationById(conversationId: string, userId: string) {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .limit(1)
  return conv ?? null
}

export async function loadMessages(conversationId: string) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))
}

export async function getImmersionScript(poemId: string) {
  const [script] = await db
    .select()
    .from(immersionScripts)
    .where(eq(immersionScripts.poemId, poemId))
    .limit(1)
  return script ?? null
}
