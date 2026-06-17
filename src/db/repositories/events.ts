import { db } from '@/db'
import { events } from '@/db/schema'

export async function recordEvent({
  userId,
  type,
  meta,
  score,
  poemId,
}: {
  userId: string
  type: string
  meta?: Record<string, unknown>
  score?: number
  poemId?: string
}) {
  await db.insert(events).values({
    userId,
    type,
    meta: (meta ?? null) as unknown,
    score,
    poemId,
  })
}
