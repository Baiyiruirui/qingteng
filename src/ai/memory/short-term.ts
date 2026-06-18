import 'server-only'
import { redis } from '@/lib/redis'

export type SessionSnapshot = {
  conversationId: string
  lastMessageAt: number
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>
}

const TTL_SECONDS = 60 * 60 * 24 * 30
const MAX_MESSAGES = 6

function key(userId: string) {
  return `user:${userId}:short_term`
}

export async function getShortTerm(userId: string): Promise<SessionSnapshot | null> {
  return await redis.get<SessionSnapshot>(key(userId))
}

export async function updateShortTerm(
  userId: string,
  conversationId: string,
  newMessage: { role: 'user' | 'assistant'; content: string },
) {
  const existing = await getShortTerm(userId)
  const recentMessages = [
    ...(existing?.conversationId === conversationId ? existing.recentMessages : []),
    newMessage,
  ].slice(-MAX_MESSAGES)

  const snapshot: SessionSnapshot = {
    conversationId,
    lastMessageAt: Date.now(),
    recentMessages,
  }

  await redis.set(key(userId), snapshot, { ex: TTL_SECONDS })
}

export async function clearShortTerm(userId: string) {
  await redis.del(key(userId))
}
