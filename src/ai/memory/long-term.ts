import 'server-only'
import { generateText } from 'ai'
import { cosineDistance, desc, and, eq, ne, sql } from 'drizzle-orm'
import { route } from '@/ai/router'
import { db } from '@/db'
import { memories } from '@/db/schema'
import { embed } from '@/ai/embedding'
import { buildExtractPrompt } from '@/ai/prompts/v1/memory-extract'
import { telemetry } from '@/ai/observability/telemetry'

type ExtractedMemory = { content: string; kind: string }

export type RecalledMemory = { content: string; source: string | null; similarity: number }

// Preference memories always surface if remotely related — they're hard constraints
const PREF_THRESHOLD = 0.15
// Standard threshold for other memory types
const STD_THRESHOLD = 0.4
const RECALL_LIMIT = 3

function parseExtracted(raw: string): ExtractedMemory[] {
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
    experimental_telemetry: telemetry('qingteng.memory.extract', {
      mode: 'memory-extract',
      userId,
      transcriptChars: transcript.length,
    }),
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

  // Two-phase recall: preference memories at lower threshold, others at standard
  const [prefRows, otherRows] = await Promise.all([
    db
      .select({
        content: memories.content,
        source: memories.source,
        similarity: sql<number>`1 - (${cosineDistance(memories.embedding, queryVector)})`,
      })
      .from(memories)
      .where(
        and(
          eq(memories.userId, userId),
          eq(memories.source, 'preference'),
          sql`1 - (${cosineDistance(memories.embedding, queryVector)}) > ${PREF_THRESHOLD}`,
        ),
      )
      .orderBy(desc(sql<number>`1 - (${cosineDistance(memories.embedding, queryVector)})`))
      .limit(2),

    db
      .select({
        content: memories.content,
        source: memories.source,
        similarity: sql<number>`1 - (${cosineDistance(memories.embedding, queryVector)})`,
      })
      .from(memories)
      .where(
        and(
          eq(memories.userId, userId),
          ne(memories.source, 'preference'),
          sql`1 - (${cosineDistance(memories.embedding, queryVector)}) > ${STD_THRESHOLD}`,
        ),
      )
      .orderBy(desc(sql<number>`1 - (${cosineDistance(memories.embedding, queryVector)})`))
      .limit(limit),
  ])

  // Preferences first, then others — dedup by content
  const seen = new Set<string>()
  const result: RecalledMemory[] = []
  for (const row of [...prefRows, ...otherRows]) {
    if (!seen.has(row.content)) {
      seen.add(row.content)
      result.push({ content: row.content, source: row.source, similarity: row.similarity })
    }
  }

  console.log(
    `[long-term] recall | user:${userId.slice(0, 8)} | query:"${queryText.slice(0, 40)}" |`,
    result.length === 0
      ? 'no results'
      : result.map(m => `[${m.source}] ${m.content.slice(0, 35)}`).join(' // '),
  )

  return result
}
