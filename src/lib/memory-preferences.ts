import 'server-only'
import { redis } from '@/lib/redis'
import {
  DEFAULT_MEMORY_PREFERENCES,
  normalizeMemoryPreferences,
  type MemoryPreferences,
} from '@/ai/memory/preferences-policy'

function preferenceKey(userId: string): string {
  return `user:${userId}:memory_preferences`
}

export async function getMemoryPreferences(userId: string): Promise<MemoryPreferences> {
  const stored = await redis.get<unknown>(preferenceKey(userId))
  return normalizeMemoryPreferences(stored)
}

export async function setMemoryPreferences(
  userId: string,
  preferences: MemoryPreferences,
): Promise<MemoryPreferences> {
  const normalized = normalizeMemoryPreferences(preferences)
  await redis.set(preferenceKey(userId), normalized)
  return normalized
}

export async function isMemoryEnabled(userId: string): Promise<boolean> {
  try {
    return (await getMemoryPreferences(userId)).memoryEnabled
  } catch {
    // Privacy first: an unavailable preference store must not silently resume Memory.
    console.warn(`[memory-preferences] unavailable for user:${userId.slice(0, 8)}`)
    return false
  }
}

export function defaultMemoryPreferences(): MemoryPreferences {
  return { ...DEFAULT_MEMORY_PREFERENCES }
}
