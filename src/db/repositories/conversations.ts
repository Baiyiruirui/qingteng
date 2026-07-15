import { db } from '@/db'
import { conversations, messages, immersionScripts, poems } from '@/db/schema'
import { eq, desc, asc, and, inArray } from 'drizzle-orm'

export type ConversationHistoryItem = {
  id: string
  mode: string
  poemTitle: string | null
  title: string
  preview: string
  messageCount: number
  createdAt: Date | null
}

function compactMessage(content: string, maxLength: number) {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength)}…`
}

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

export async function listConversationHistory(
  userId: string,
  limit = 20,
): Promise<ConversationHistoryItem[]> {
  const rows = await db
    .select({
      id: conversations.id,
      mode: conversations.mode,
      poemTitle: poems.title,
      createdAt: conversations.createdAt,
    })
    .from(conversations)
    .leftJoin(poems, eq(conversations.poemId, poems.id))
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.createdAt))
    .limit(limit)

  if (rows.length === 0) return []

  const conversationMessages = await db
    .select({
      conversationId: messages.conversationId,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(inArray(messages.conversationId, rows.map(row => row.id)))
    .orderBy(asc(messages.createdAt))

  const messagesByConversation = new Map<string, typeof conversationMessages>()
  for (const message of conversationMessages) {
    const group = messagesByConversation.get(message.conversationId) ?? []
    group.push(message)
    messagesByConversation.set(message.conversationId, group)
  }

  return rows.flatMap(row => {
    const group = messagesByConversation.get(row.id) ?? []
    if (group.length === 0) return []

    const firstUserMessage = group.find(message => message.role === 'user')
    const firstMessage = firstUserMessage ?? group[0]
    const latestMessage = group[group.length - 1]
    const fallbackTitle = row.poemTitle
      ? `《${row.poemTitle}》`
      : row.mode === 'creative'
        ? '共写诗句'
        : row.mode === 'roleplay'
          ? '诗境沉浸'
          : '与青藤的对话'

    return [{
      ...row,
      title: firstMessage?.content
        ? compactMessage(firstMessage.content, 28)
        : fallbackTitle,
      preview: latestMessage?.content
        ? compactMessage(latestMessage.content, 48)
        : fallbackTitle,
      messageCount: group.length,
    }]
  })
}

export async function getImmersionScript(poemId: string) {
  const [script] = await db
    .select()
    .from(immersionScripts)
    .where(eq(immersionScripts.poemId, poemId))
    .limit(1)
  return script ?? null
}
