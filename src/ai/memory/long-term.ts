import 'server-only'
import { generateText } from 'ai'
import { cosineDistance, desc, and, eq, lt, ne, sql } from 'drizzle-orm'
import { route } from '@/ai/router'
import { db } from '@/db'
import { memories } from '@/db/schema'
import { embed } from '@/ai/embedding'
import { buildExtractPrompt } from '@/ai/prompts/v1/memory-extract'
import { buildImmersionMemoryPrompt } from '@/ai/prompts/v1/immersion-memory'
import { telemetry } from '@/ai/observability/telemetry'
import { AI_GENERATION_BUDGETS } from '@/lib/ai-budget'
import { getMemoryPreferences, isMemoryEnabled } from '@/lib/memory-preferences'
import { shouldSkipMemoryExtraction, userTextFromChatTranscript } from './extraction-policy'
import { memoryRetentionCutoff, type MemoryRetentionDays } from './preferences-policy'
import {
  MEMORY_CAP_PER_USER,
  MEMORY_DECAY_BASE,
  MEMORY_DUPLICATE_WEIGHT_BONUS,
  MEMORY_MAX_WEIGHT,
  normalizeMemoryContent,
  normalizeMemoryKind,
} from './policy'

type ExtractedMemory = { content: string; kind: string }

export type RecalledMemory = {
  content: string
  source: string | null
  similarity: number
  effectiveScore?: number
}

// Preference memories always surface if remotely related — they're hard constraints
const PREF_THRESHOLD = 0.15
// Standard threshold for other memory types
const STD_THRESHOLD = 0.4
const RECALL_LIMIT = 3

const ageDaysExpr = sql<number>`
  greatest(extract(epoch from (now() - ${memories.createdAt})) / 86400.0, 0)
`

function decayedScoreExpr(similarity: ReturnType<typeof sql<number>>) {
  return sql<number>`
    ${similarity}
    * coalesce(${memories.weight}, 1)
    * power(${MEMORY_DECAY_BASE}, ${ageDaysExpr})
  `
}

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
  if (shouldSkipMemoryExtraction(userTextFromChatTranscript(transcript))) return
  if (!(await isMemoryEnabled(userId))) return

  const { text } = await generateText({
    model: route.quizGenerate, // DeepSeek — cheap
    ...AI_GENERATION_BUDGETS.memoryExtraction,
    prompt: buildExtractPrompt(transcript),
    experimental_telemetry: telemetry('qingteng.memory.extract', {
      mode: 'memory-extract',
      userId,
      transcriptChars: transcript.length,
    }),
  })

  const extracted = parseExtracted(text)
  if (extracted.length === 0) return
  if (!(await isMemoryEnabled(userId))) return

  await storeMemoryCandidates(userId, extracted)
}

async function storeMemoryCandidates(userId: string, candidates: ExtractedMemory[]): Promise<void> {
  if (!(await isMemoryEnabled(userId))) return

  const preferences = await getMemoryPreferences(userId)
  await cleanupExpiredMemories(userId, preferences.retentionDays)

  const seenContents = new Set<string>()
  const normalizedCandidates = candidates.flatMap(m => {
    const content = normalizeMemoryContent(m.content)
    if (!content || seenContents.has(content)) return []
    seenContents.add(content)
    return [{ content, kind: normalizeMemoryKind(m.kind) }]
  })

  const stored = await Promise.all(
    normalizedCandidates.map(async (m) => {
      const existing = await db
        .select({ id: memories.id, source: memories.source, weight: memories.weight })
        .from(memories)
        .where(and(eq(memories.userId, userId), eq(memories.content, m.content)))
        .limit(1)

      if (existing[0]) {
        const nextSource = existing[0].source === 'preference' ? 'preference' : m.kind
        const nextWeight = Math.min(
          (existing[0].weight ?? 1) + MEMORY_DUPLICATE_WEIGHT_BONUS,
          MEMORY_MAX_WEIGHT,
        )

        await db
          .update(memories)
          .set({
            source: nextSource,
            weight: nextWeight,
            createdAt: new Date(),
          })
          .where(eq(memories.id, existing[0].id))
        return true
      }

      const vector = await embed(m.content)
      await db.insert(memories).values({
        userId,
        content: m.content,
        embedding: vector,
        source: m.kind,
        weight: 1,
      })
      return true
    }),
  )

  if (stored.some(Boolean)) {
    await enforceMemoryCap(userId)
  }
}

export async function extractImmersionAndStore(input: {
  userId: string
  poemTitle: string
  poemAuthor: string
  role: string
  userText: string
  assistantText: string
}): Promise<void> {
  if (shouldSkipMemoryExtraction(input.userText)) return
  if (!(await isMemoryEnabled(input.userId))) return

  const { text } = await generateText({
    model: route.quizGenerate,
    ...AI_GENERATION_BUDGETS.memoryExtraction,
    prompt: buildImmersionMemoryPrompt(input),
    experimental_telemetry: telemetry('qingteng.memory.extract', {
      mode: 'immersion-memory-extract',
      userId: input.userId,
      poemTitle: input.poemTitle,
      transcriptChars: input.userText.length + input.assistantText.length,
    }),
  })

  const extracted = parseExtracted(text)
  if (extracted.length === 0) return
  if (!(await isMemoryEnabled(input.userId))) return

  await storeMemoryCandidates(input.userId, extracted)
}

export async function recall(
  userId: string,
  queryText: string,
  limit = RECALL_LIMIT,
): Promise<RecalledMemory[]> {
  if (!(await isMemoryEnabled(userId))) return []

  const preferences = await getMemoryPreferences(userId)
  await cleanupExpiredMemories(userId, preferences.retentionDays)

  const queryVector = await embed(queryText)
  const similarity = sql<number>`1 - (${cosineDistance(memories.embedding, queryVector)})`
  const effectiveScore = decayedScoreExpr(similarity)

  // Two-phase recall: preference memories at lower threshold, others at standard
  const [prefRows, otherRows] = await Promise.all([
    db
      .select({
        content: memories.content,
        source: memories.source,
        similarity,
        effectiveScore,
      })
      .from(memories)
      .where(
        and(
          eq(memories.userId, userId),
          eq(memories.source, 'preference'),
          sql`${similarity} > ${PREF_THRESHOLD}`,
        ),
      )
      .orderBy(desc(effectiveScore), desc(similarity))
      .limit(2),

    db
      .select({
        content: memories.content,
        source: memories.source,
        similarity,
        effectiveScore,
      })
      .from(memories)
      .where(
        and(
          eq(memories.userId, userId),
          ne(memories.source, 'preference'),
          sql`${similarity} > ${STD_THRESHOLD}`,
        ),
      )
      .orderBy(desc(effectiveScore), desc(similarity))
      .limit(limit),
  ])

  // Preferences first, then others — dedup by content
  const seen = new Set<string>()
  const result: RecalledMemory[] = []
  for (const row of [...prefRows, ...otherRows]) {
    if (!seen.has(row.content)) {
      seen.add(row.content)
      result.push({
        content: row.content,
        source: row.source,
        similarity: row.similarity,
        effectiveScore: row.effectiveScore,
      })
    }
  }

  return (await isMemoryEnabled(userId)) ? result : []
}

export async function cleanupExpiredMemories(
  userId: string,
  retentionDays: MemoryRetentionDays,
): Promise<number> {
  const cutoff = memoryRetentionCutoff(retentionDays)
  const deleted = await db
    .delete(memories)
    .where(and(eq(memories.userId, userId), lt(memories.createdAt, cutoff)))
    .returning({ id: memories.id })

  if (deleted.length > 0) {
    console.info(
      `[long-term] expired ${deleted.length} memories for user:${userId.slice(0, 8)}`,
    )
  }

  return deleted.length
}

export async function enforceMemoryCap(userId: string): Promise<number> {
  const deleted = await db.execute<{ id: string }>(sql`
    WITH ranked AS (
      SELECT
        id,
        row_number() OVER (
          ORDER BY
            CASE WHEN source = 'preference' THEN 1 ELSE 0 END DESC,
            coalesce(weight, 1)
              * power(
                  ${MEMORY_DECAY_BASE},
                  greatest(extract(epoch from (now() - created_at)) / 86400.0, 0)
                ) DESC,
            created_at DESC
        ) AS rank
      FROM memories
      WHERE user_id = ${userId}
    ),
    deleted AS (
      DELETE FROM memories
      WHERE id IN (SELECT id FROM ranked WHERE rank > ${MEMORY_CAP_PER_USER})
      RETURNING id
    )
    SELECT id FROM deleted
  `)

  if (deleted.length > 0) {
    console.log(
      `[long-term] pruned ${deleted.length} stale memories for user:${userId.slice(0, 8)}`,
    )
  }

  return deleted.length
}
