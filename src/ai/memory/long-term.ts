import 'server-only'
import { generateText } from 'ai'
import { cosineDistance, desc, and, eq, sql } from 'drizzle-orm'
import { route } from '@/ai/router'
import { db } from '@/db'
import { memories } from '@/db/schema'
import { embed } from '@/ai/embedding'
import { buildExtractPrompt } from '@/ai/prompts/v1/memory-extract'

type ExtractedMemory = { content: string; kind: string }

export type RecalledMemory = { content: string; source: string | null; similarity: number }

const SIMILARITY_THRESHOLD = 0.4
const RECALL_LIMIT = 3

function parseExtracted(raw: string): ExtractedMemory[] {
  // Strip markdown code fences if model wraps output anyway
  const clean = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  try {
    const parsed = JSON.parse(clean)
    return Array.isArray(parsed.memories) ? (parsed.memories as ExtractedMemory[]) : []
  } catch {
    return []
  }
}

export async function extractAndStore(userId: string, transcript: string): Promise<void> {
  const { text } = await generateText({
    model: route.quizGenerate, // DeepSeek — cheap
    prompt: buildExtractPrompt(transcript),
  })

  const extracted = parseExtracted(text)
  if (extracted.length === 0) return

  await Promise.all(
    extracted.map(async (m) => {
      const vector = await embed(m.content)
      await db.insert(memories).values({
        userId,
        content: m.content,
        embedding: vector,
        source: m.kind,
        weight: 1,
      })
    }),
  )
}

export async function recall(
  userId: string,
  queryText: string,
  limit = RECALL_LIMIT,
): Promise<RecalledMemory[]> {
  const queryVector = await embed(queryText)

  const similarity = sql<number>`1 - (${cosineDistance(memories.embedding, queryVector)})`

  const rows = await db
    .select({ content: memories.content, source: memories.source, similarity })
    .from(memories)
    .where(
      and(
        eq(memories.userId, userId),
        sql`1 - (${cosineDistance(memories.embedding, queryVector)}) > ${SIMILARITY_THRESHOLD}`,
      ),
    )
    .orderBy(desc(similarity))
    .limit(limit)

  return rows.map(r => ({
    content: r.content,
    source: r.source,
    similarity: r.similarity,
  }))
}
