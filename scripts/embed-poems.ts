import { db } from '@/db'
import { embedText } from '@/ai/embedding-core'
import { buildPoemSearchText } from '@/ai/poems/search-text'
import { poemEmbeddings, poems } from '@/db/schema'

const EMBED_MODEL = 'BAAI/bge-m3'

async function main() {
  const allPoems = await db
    .select({
      id: poems.id,
      title: poems.title,
      author: poems.author,
      dynasty: poems.dynasty,
      grade: poems.grade,
      textType: poems.textType,
      themes: poems.themes,
      imagery: poems.imagery,
      rhetoric: poems.rhetoric,
      lines: poems.lines,
    })
    .from(poems)

  let embedded = 0
  for (const poem of allPoems) {
    const content = buildPoemSearchText({
      title: poem.title,
      author: poem.author,
      dynasty: poem.dynasty,
      grade: poem.grade,
      textType: poem.textType,
      themes: poem.themes,
      imagery: poem.imagery,
      rhetoric: poem.rhetoric,
      lines: poem.lines,
    })
    const vector = await embedText(content)
    await db
      .insert(poemEmbeddings)
      .values({
        poemId: poem.id,
        content,
        embedding: vector,
        model: EMBED_MODEL,
      })
      .onConflictDoUpdate({
        target: poemEmbeddings.poemId,
        set: {
          content,
          embedding: vector,
          model: EMBED_MODEL,
          createdAt: new Date(),
        },
      })
    embedded++
    if (embedded % 20 === 0 || embedded === allPoems.length) {
      console.log(`Embedded ${embedded}/${allPoems.length}`)
    }
  }

  console.log(`Done. Embedded ${embedded} poems.`)
  process.exit(0)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
