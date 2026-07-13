import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { BlueprintPoint } from '@/db/schema'
import type { PoemForQuiz } from '@/db/repositories/poems'
import { draftBlueprintForPoem } from '@/ai/quiz/generate-blueprint'
import { BlueprintSchema, validateBlueprintAgainstPoem } from '@/ai/quiz/blueprint-schema'
import { BLUEPRINT_GEN_VERSION } from '@/ai/prompts/v1/blueprint-generate'
import { REPRESENTATIVE_QUIZ_POEMS } from '@/ai/quiz/representative-set'

const OUTPUT_PATH = join(process.cwd(), 'data', 'quiz-blueprints-representative.json')
const CHECKPOINT_PATH = join(process.cwd(), '.tmp', 'quiz-blueprints-representative.checkpoint.json')
const BASE_PATH = join(process.cwd(), 'data', 'quiz-blueprints.json')

type BlueprintEntry = {
  poemId: string
  title?: string
  author?: string
  dynasty?: string | null
  reason?: string
  points: BlueprintPoint[]
}

async function exists(path: string) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function readEntries(path: string): Promise<BlueprintEntry[]> {
  if (!(await exists(path))) return []
  const parsed = JSON.parse(await readFile(path, 'utf8')) as { blueprints?: BlueprintEntry[] }
  return Array.isArray(parsed.blueprints) ? parsed.blueprints : []
}

async function readLocalPoem(poemId: string): Promise<PoemForQuiz> {
  const path = join(process.cwd(), 'data', 'poems', `${poemId}.json`)
  const raw = JSON.parse(await readFile(path, 'utf8')) as {
    poem_id: string
    title: string
    author: string
    dynasty?: string | null
    themes?: string[]
    imagery?: string[]
    rhetoric?: string[]
    lines: Array<{
      line_id: string
      content: string
      imagery?: string[]
      emotion?: string[]
      translation?: string
      translation_keywords?: string[]
      explanation?: string
    }>
  }

  return {
    id: raw.poem_id,
    title: raw.title,
    author: raw.author,
    dynasty: raw.dynasty ?? null,
    themes: raw.themes ?? [],
    imagery: raw.imagery ?? [],
    rhetoric: raw.rhetoric ?? [],
    lines: raw.lines.map(line => ({
      lineId: line.line_id,
      content: line.content,
      imagery: line.imagery,
      emotion: line.emotion,
      translation: line.translation,
      translationKeywords: line.translation_keywords,
      explanation: line.explanation,
    })),
  }
}

async function writeEntries(path: string, entries: BlueprintEntry[]) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(
    path,
    `${JSON.stringify({
      _comment: 'Representative deep quiz coverage selected for the portfolio demo.',
      version: 1,
      promptVersion: BLUEPRINT_GEN_VERSION,
      targetPoems: REPRESENTATIVE_QUIZ_POEMS.length,
      blueprints: entries,
    }, null, 2)}\n`,
    'utf8',
  )
}

async function main() {
  console.log('\n-- Generate representative quiz blueprints --\n')

  const entries = new Map<string, BlueprintEntry>()
  // Checked-in/output draft wins over the resume checkpoint after manual review.
  for (const path of [BASE_PATH, CHECKPOINT_PATH, OUTPUT_PATH]) {
    for (const entry of await readEntries(path)) entries.set(entry.poemId, entry)
  }

  for (const [index, target] of REPRESENTATIVE_QUIZ_POEMS.entries()) {
    const poem = await readLocalPoem(target.id)

    let points: BlueprintPoint[] | null = null
    const existing = entries.get(target.id)
    if (existing) {
      const parsed = BlueprintSchema.safeParse(existing.points)
      if (parsed.success) {
        const candidate = parsed.data as BlueprintPoint[]
        const issues = validateBlueprintAgainstPoem(candidate, poem)
        if (issues.length === 0) points = candidate
        else console.warn(`[blueprint] ${target.id} existing draft rejected: ${issues.join('; ')}`)
      }
    }

    if (!points) {
      console.log(`[${index + 1}/${REPRESENTATIVE_QUIZ_POEMS.length}] Drafting ${target.id} 《${target.title}》`)
      points = await draftBlueprintForPoem(target.id)
    } else {
      console.log(`[${index + 1}/${REPRESENTATIVE_QUIZ_POEMS.length}] Reusing ${target.id} 《${target.title}》`)
    }

    entries.set(target.id, {
      poemId: target.id,
      title: poem.title,
      author: poem.author,
      dynasty: poem.dynasty,
      reason: target.reason,
      points,
    })

    const ordered = REPRESENTATIVE_QUIZ_POEMS
      .map(item => entries.get(item.id))
      .filter((entry): entry is BlueprintEntry => Boolean(entry))
    await writeEntries(CHECKPOINT_PATH, ordered)
  }

  const finalEntries = REPRESENTATIVE_QUIZ_POEMS.map(target => {
    const entry = entries.get(target.id)
    if (!entry) throw new Error(`Blueprint missing after generation: ${target.id}`)
    return entry
  })
  await writeEntries(OUTPUT_PATH, finalEntries)

  console.log(`\nWrote ${finalEntries.length} reviewed-draft candidates to ${OUTPUT_PATH}`)
  console.log('No blueprint database writes were performed.\n')
  process.exit(0)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
