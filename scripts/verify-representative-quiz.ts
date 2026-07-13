import { inArray } from 'drizzle-orm'
import { db } from '@/db'
import { poems, quizBlueprints, quizQuestions } from '@/db/schema'
import type { BlueprintPoint } from '@/db/schema'
import { BlueprintSchema } from '@/ai/quiz/blueprint-schema'
import { isDemoReadyQuestion } from '@/ai/quiz/quality'
import {
  REPRESENTATIVE_QUIZ_POEMS,
  REPRESENTATIVE_V2_MAX_QUESTIONS,
  REPRESENTATIVE_V2_MIN_QUESTIONS,
} from '@/ai/quiz/representative-set'

async function main() {
  console.log('\n-- Representative quiz coverage verification --\n')

  const ids = REPRESENTATIVE_QUIZ_POEMS.map(poem => poem.id)
  const [blueprintRows, questionRows, poemRows] = await Promise.all([
    db.select().from(quizBlueprints).where(inArray(quizBlueprints.poemId, ids)),
    db.select().from(quizQuestions).where(inArray(quizQuestions.poemId, ids)),
    db.select({ id: poems.id, title: poems.title }).from(poems).where(inArray(poems.id, ids)),
  ])

  const blueprintByPoem = new Map(blueprintRows.map(row => [row.poemId, row]))
  const titleByPoem = new Map(poemRows.map(row => [row.id, row.title]))
  const failures: string[] = []
  const report: Array<Record<string, string | number>> = []
  let totalReady = 0
  const coveredTypes = new Set<string>()

  for (const target of REPRESENTATIVE_QUIZ_POEMS) {
    const blueprint = blueprintByPoem.get(target.id)
    if (!blueprint) {
      failures.push(`${target.id} is missing a blueprint`)
      report.push({ poemId: target.id, title: target.title, points: 0, ready: 0 })
      continue
    }

    const parsed = BlueprintSchema.safeParse(blueprint.points)
    if (!parsed.success) {
      failures.push(`${target.id} blueprint schema is invalid`)
      continue
    }

    const points = parsed.data as BlueprintPoint[]
    const rows = questionRows.filter(row => row.poemId === target.id && row.version === 'v2')
    const readyRows = rows.filter(isDemoReadyQuestion)
    const expectedPointIds = new Set(points.map(point => point.id))
    const readyByPoint = new Map<string, number>()

    for (const row of readyRows) {
      if (row.pointId) readyByPoint.set(row.pointId, (readyByPoint.get(row.pointId) ?? 0) + 1)
      if (row.pointType) coveredTypes.add(row.pointType)
    }

    for (const pointId of expectedPointIds) {
      const count = readyByPoint.get(pointId) ?? 0
      if (count !== 1) failures.push(`${target.id}/${pointId} expected 1 demo-ready question, found ${count}`)
    }
    for (const row of rows) {
      if (!isDemoReadyQuestion(row)) failures.push(`${target.id}/${row.pointId ?? row.id} failed quality gate`)
      if (row.pointId && !expectedPointIds.has(row.pointId)) {
        failures.push(`${target.id}/${row.pointId} is not present in the blueprint`)
      }
    }

    totalReady += readyRows.length
    report.push({
      poemId: target.id,
      title: titleByPoem.get(target.id) ?? target.title,
      points: points.length,
      ready: readyRows.length,
    })
  }

  if (blueprintRows.length !== REPRESENTATIVE_QUIZ_POEMS.length) {
    failures.push(`expected ${REPRESENTATIVE_QUIZ_POEMS.length} representative blueprints, found ${blueprintRows.length}`)
  }
  if (totalReady < REPRESENTATIVE_V2_MIN_QUESTIONS || totalReady > REPRESENTATIVE_V2_MAX_QUESTIONS) {
    failures.push(
      `demo-ready question count ${totalReady} is outside ${REPRESENTATIVE_V2_MIN_QUESTIONS}-${REPRESENTATIVE_V2_MAX_QUESTIONS}`,
    )
  }
  if (coveredTypes.size < 6) failures.push(`expected at least 6 point types, found ${coveredTypes.size}`)

  console.table(report)
  console.log(`Blueprints: ${blueprintRows.length}/${REPRESENTATIVE_QUIZ_POEMS.length}`)
  console.log(`Demo-ready v2 questions: ${totalReady}`)
  console.log(`Point types: ${[...coveredTypes].sort().join(', ') || '-'}`)

  if (failures.length > 0) {
    console.log('\nFailures:')
    failures.forEach(failure => console.log(`  - ${failure}`))
    process.exit(1)
  }

  console.log('\nRepresentative quiz coverage passed.\n')
  process.exit(0)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
