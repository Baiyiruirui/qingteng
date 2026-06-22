import { db } from '@/db'
import { poems } from '@/db/schema'
import type { PoemLine } from '@/db/schema'
import { eq } from 'drizzle-orm'

export type PoemForQuiz = {
  id: string
  title: string
  author: string
  dynasty: string | null
  themes: string[]
  imagery: string[]
  rhetoric: string[]
  lines: PoemLine[]
}

export async function getPoemForQuiz(poemId: string): Promise<PoemForQuiz | null> {
  const [row] = await db
    .select({
      id: poems.id,
      title: poems.title,
      author: poems.author,
      dynasty: poems.dynasty,
      themes: poems.themes,
      imagery: poems.imagery,
      rhetoric: poems.rhetoric,
      lines: poems.lines,
    })
    .from(poems)
    .where(eq(poems.id, poemId))
    .limit(1)

  if (!row) return null

  return {
    id: row.id,
    title: row.title,
    author: row.author,
    dynasty: row.dynasty,
    themes: (row.themes ?? []) as string[],
    imagery: (row.imagery ?? []) as string[],
    rhetoric: (row.rhetoric ?? []) as string[],
    lines: (row.lines ?? []) as PoemLine[],
  }
}
