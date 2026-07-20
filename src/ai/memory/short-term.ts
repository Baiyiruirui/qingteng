import 'server-only'
import { redis } from '@/lib/redis'
import { isMemoryEnabled } from '@/lib/memory-preferences'

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
  if (!(await isMemoryEnabled(userId))) return null
  const snapshot = await redis.get<SessionSnapshot>(key(userId))
  return (await isMemoryEnabled(userId)) ? snapshot : null
}

export async function updateShortTerm(
  userId: string,
  conversationId: string,
  newMessage: { role: 'user' | 'assistant'; content: string },
) {
  if (!(await isMemoryEnabled(userId))) return

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

  if (!(await isMemoryEnabled(userId))) return
  await redis.set(key(userId), snapshot, { ex: TTL_SECONDS })
}

export async function clearShortTerm(userId: string) {
  await redis.del(key(userId))
}
