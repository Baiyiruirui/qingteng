import { db } from '@/db'
import { poems } from '@/db/schema'
import type { PoemLine } from '@/db/schema'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

async function main() {
  const dir = 'data/poems'
  const files = (await readdir(dir)).filter(f => f.endsWith('.json'))

  let imported = 0
  const warnings: string[] = []

  for (const file of files) {
    try {
      const raw = await readFile(join(dir, file), 'utf-8')
      const p = JSON.parse(raw)

      if (!p.poem_id) { warnings.push(`${file}: missing poem_id`); continue }
      if (!p.title)   { warnings.push(`${file}: missing title`);   continue }
      if (!p.author)  { warnings.push(`${file}: missing author`);  continue }
      if (!Array.isArray(p.lines) || p.lines.length === 0) {
        warnings.push(`${file}: missing or empty lines`)
        continue
      }

      const lines: PoemLine[] = p.lines.map((l: Record<string, unknown>) => ({
        lineId:              String(l.line_id ?? ''),
        content:             String(l.content ?? ''),
        imagery:             Array.isArray(l.imagery)              ? l.imagery              : [],
        emotion:             Array.isArray(l.emotion)              ? l.emotion              : [],
        translation:         typeof l.translation === 'string'     ? l.translation          : undefined,
        translationKeywords: Array.isArray(l.translation_keywords) ? l.translation_keywords : [],
        explanation:         typeof l.explanation === 'string'     ? l.explanation          : undefined,
      }))

      await db.insert(poems).values({
        id:       p.poem_id,
        title:    p.title,
        author:   p.author,
        dynasty:  p.dynasty  ?? null,
        grade:    p.grade    ?? null,
        textType: p.text_type ?? null,
        themes:   Array.isArray(p.themes)   ? p.themes   : [],
        imagery:  Array.isArray(p.imagery)  ? p.imagery  : [],
        rhetoric: Array.isArray(p.rhetoric) ? p.rhetoric : [],
        lines,
      }).onConflictDoNothing()

      imported++
    } catch (err) {
      warnings.push(`${file}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (warnings.length > 0) {
    console.warn('\n⚠️  Warnings:')
    warnings.forEach(w => console.warn('  ', w))
  }

  console.log(`\nImported ${imported} poems. (${files.length - imported} skipped/failed)`)
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
