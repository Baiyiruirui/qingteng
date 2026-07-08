import { cosineDistance, desc, eq, sql } from 'drizzle-orm'
import { embedText } from '@/ai/embedding-core'
import { db } from '@/db'
import { poemEmbeddings, poems } from '@/db/schema'

export type PoemSearchResult = {
  id: string
  title: string
  author: string
  dynasty: string | null
  grade: string | null
  themes: string[]
  imagery: string[]
  rhetoric: string[]
  similarity: number | null
  matchReason: string
}

export async function semanticPoemSearch(query: string, limit = 24): Promise<PoemSearchResult[]> {
  const q = query.trim()
  if (!q) return []

  const queryVector = await embedText(q)
  const rows = await db
    .select({
      id: poems.id,
      title: poems.title,
      author: poems.author,
      dynasty: poems.dynasty,
      grade: poems.grade,
      themes: poems.themes,
      imagery: poems.imagery,
      rhetoric: poems.rhetoric,
      content: poemEmbeddings.content,
      similarity: sql<number>`1 - (${cosineDistance(poemEmbeddings.embedding, queryVector)})`,
    })
    .from(poemEmbeddings)
    .innerJoin(poems, eq(poemEmbeddings.poemId, poems.id))
    .orderBy(desc(sql<number>`1 - (${cosineDistance(poemEmbeddings.embedding, queryVector)})`))
    .limit(limit)

  return rows.map(row => ({
    id: row.id,
    title: row.title,
    author: row.author,
    dynasty: row.dynasty,
    grade: row.grade,
    themes: row.themes ?? [],
    imagery: row.imagery ?? [],
    rhetoric: row.rhetoric ?? [],
    similarity: row.similarity,
    matchReason: buildMatchReason(q, row),
  }))
}

function buildMatchReason(
  query: string,
  row: {
    title: string
    author: string
    dynasty: string | null
    themes: string[] | null
    imagery: string[] | null
    rhetoric: string[] | null
    content: string
  },
): string {
  if (row.title.includes(query)) return '标题命中'
  if (row.author.includes(query)) return '作者命中'
  if ((row.dynasty ?? '').includes(query)) return '朝代命中'

  const tags = [...(row.themes ?? []), ...(row.imagery ?? []), ...(row.rhetoric ?? [])]
  const tag = tags.find(item => item.includes(query) || query.includes(item))
  if (tag) return `标签相关：${tag}`

  const contentIndex = row.content.indexOf(query)
  if (contentIndex >= 0) return '诗文资料命中'

  return '语义相近'
}
