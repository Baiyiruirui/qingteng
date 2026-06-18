import 'server-only'
import { redis } from '@/lib/redis'
import { db } from '@/db'
import { events, messages, conversations, poems } from '@/db/schema'
import { eq, desc, inArray } from 'drizzle-orm'

export type LearningProfile = {
  userId: string
  totalConversations: number
  totalMessages: number
  recentPoems: string[]
  recentThemes: string[]
  activeDays7: number
  lastActiveAt: number
  emotionalNotes: string[]
}

const TTL_SECONDS = 60 * 60 // 1 hour
const RECENT_CONV_LIMIT = 5
const RECENT_MSG_LIMIT = 40
const RECENT_EVENT_LIMIT = 100

function key(userId: string) {
  return `user:${userId}:profile`
}

async function computeProfile(userId: string): Promise<LearningProfile> {
  // Run parallel queries: all poem metadata, user conversations, recent events
  const [allPoems, userConvs, recentEvents] = await Promise.all([
    db.select({ id: poems.id, title: poems.title, themes: poems.themes }).from(poems),
    db
      .select({ id: conversations.id, createdAt: conversations.createdAt })
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.createdAt)),
    db
      .select()
      .from(events)
      .where(eq(events.userId, userId))
      .orderBy(desc(events.createdAt))
      .limit(RECENT_EVENT_LIMIT),
  ])

  const poemByTitle = new Map(allPoems.map(p => [p.title, p]))
  const poemById = new Map(allPoems.map(p => [p.id, p]))
  const totalConversations = userConvs.length
  const recentConvIds = userConvs.slice(0, RECENT_CONV_LIMIT).map(c => c.id)

  // String-match poem titles in recent messages — no LLM, no extra cost
  let allText = ''
  if (recentConvIds.length > 0) {
    const recentMsgs = await db
      .select({ content: messages.content })
      .from(messages)
      .where(inArray(messages.conversationId, recentConvIds))
      .orderBy(desc(messages.createdAt))
      .limit(RECENT_MSG_LIMIT)
    allText = recentMsgs.map(m => m.content).join(' ')
  }

  const matchedPoemTitles = new Set<string>()
  const matchedPoemIds = new Set<string>()

  for (const [title, poem] of poemByTitle) {
    if (allText.includes(title)) {
      matchedPoemTitles.add(title)
      matchedPoemIds.add(poem.id)
    }
  }
  // Also include poems referenced via events.poemId
  for (const event of recentEvents) {
    if (event.poemId) {
      matchedPoemIds.add(event.poemId)
      const poem = poemById.get(event.poemId)
      if (poem) matchedPoemTitles.add(poem.title)
    }
  }

  // Collect themes from matched poems
  const matchedThemes = new Set<string>()
  for (const id of matchedPoemIds) {
    for (const theme of poemById.get(id)?.themes ?? []) matchedThemes.add(theme)
  }

  // Active days in last 7 days
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const activeDays = new Set(
    recentEvents
      .filter(e => (e.createdAt?.getTime() ?? 0) >= sevenDaysAgo)
      .map(e => e.createdAt!.toISOString().slice(0, 10)),
  )

  return {
    userId,
    totalConversations,
    totalMessages: recentEvents.filter(e => e.type === 'chat').length,
    recentPoems: [...matchedPoemTitles].slice(0, 10),
    recentThemes: [...matchedThemes].slice(0, 8),
    activeDays7: activeDays.size,
    lastActiveAt: recentEvents[0]?.createdAt?.getTime() ?? Date.now(),
    emotionalNotes: [],
  }
}

export async function getProfile(userId: string): Promise<LearningProfile | null> {
  try {
    const cached = await redis.get<LearningProfile>(key(userId))
    if (cached) return cached
    const profile = await computeProfile(userId)
    await redis.set(key(userId), profile, { ex: TTL_SECONDS })
    return profile
  } catch (e) {
    console.error('[mid-term] getProfile failed:', e)
    return null
  }
}

// Call when a new conversation starts — natural "session boundary" for cache invalidation
export function invalidateProfile(userId: string) {
  redis.del(key(userId)).catch(e => console.error('[mid-term] invalidate failed:', e))
}
