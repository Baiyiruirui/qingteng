import 'server-only'
import { and, desc, eq, sql } from 'drizzle-orm'
import { embed } from '@/ai/embedding'
import { db } from '@/db'
import { memories } from '@/db/schema'
import { getMemoryPreferences } from '@/lib/memory-preferences'
import { cleanupExpiredMemories } from './long-term'
import { normalizeMemoryContent } from './policy'
import type { MemoryRetentionDays } from './preferences-policy'

export type ManagedMemory = {
  id: string
  content: string
  source: string | null
  weight: number | null
  createdAt: Date | null
}

export async function listManagedMemories(
  userId: string,
  input: { limit: number; offset: number; retentionDays?: MemoryRetentionDays },
): Promise<{ items: ManagedMemory[]; total: number }> {
  const retentionDays = input.retentionDays
    ?? (await getMemoryPreferences(userId)).retentionDays
  await cleanupExpiredMemories(userId, retentionDays)

  const [items, totals] = await Promise.all([
    db
      .select({
        id: memories.id,
        content: memories.content,
        source: memories.source,
        weight: memories.weight,
        createdAt: memories.createdAt,
      })
      .from(memories)
      .where(eq(memories.userId, userId))
      .orderBy(desc(memories.createdAt), desc(memories.id))
      .limit(input.limit)
      .offset(input.offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(memories)
      .where(eq(memories.userId, userId)),
  ])

  return { items, total: totals[0]?.count ?? 0 }
}

export async function correctManagedMemory(
  userId: string,
  memoryId: string,
  rawContent: unknown,
): Promise<ManagedMemory | null> {
  const content = normalizeMemoryContent(rawContent)
  if (!content) throw new Error('INVALID_MEMORY_CONTENT')

  const owned = await db
    .select({ id: memories.id })
    .from(memories)
    .where(and(eq(memories.id, memoryId), eq(memories.userId, userId)))
    .limit(1)
  if (!owned[0]) return null

  const vector = await embed(content)
  const updated = await db
    .update(memories)
    .set({ content, embedding: vector })
    .where(and(eq(memories.id, memoryId), eq(memories.userId, userId)))
    .returning({
      id: memories.id,
      content: memories.content,
      source: memories.source,
      weight: memories.weight,
      createdAt: memories.createdAt,
    })

  return updated[0] ?? null
}

export async function deleteManagedMemory(userId: string, memoryId: string): Promise<boolean> {
  const deleted = await db
    .delete(memories)
    .where(and(eq(memories.id, memoryId), eq(memories.userId, userId)))
    .returning({ id: memories.id })
  return deleted.length > 0
}

export async function clearManagedMemories(userId: string): Promise<number> {
  const deleted = await db
    .delete(memories)
    .where(eq(memories.userId, userId))
    .returning({ id: memories.id })
  return deleted.length
}
