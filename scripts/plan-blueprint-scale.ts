import { db } from '@/db'
import { poems, quizBlueprints, quizQuestions } from '@/db/schema'

type PoemRow = typeof poems.$inferSelect
type BlueprintRow = typeof quizBlueprints.$inferSelect

type PlanItem = {
  poemId: string
  title: string
  author: string
  dynasty: string | null
  grade: string | null
  textType: string | null
  lineCount: number
  targetPoints: number
  hasBlueprint: boolean
  hasV2Questions: boolean
  priority: number
  reason: string
}

const DEMO_POEM_IDS = new Set(['TANG_001', 'TANG_023', 'TANG_042'])
const SAMPLE_RATE = 0.1

function lineCount(poem: PoemRow) {
  return Array.isArray(poem.lines) ? poem.lines.length : 0
}

function targetPointCount(poem: PoemRow) {
  const count = lineCount(poem)
  const textType = poem.textType ?? ''

  if (textType.includes('律') || count >= 8) return 8
  if (textType.includes('词') || count >= 10) return 8
  return 6
}

function priorityFor(poem: PoemRow) {
  const grade = poem.grade ?? ''
  const textType = poem.textType ?? ''
  let priority = 0
  const reasons: string[] = []

  if (DEMO_POEM_IDS.has(poem.id)) {
    priority += 100
    reasons.push('demo poem')
  }
  if (grade.includes('初中') || grade.includes('中学')) {
    priority += 30
    reasons.push('middle-school scope')
  }
  if (grade.includes('小学')) {
    priority += 10
    reasons.push('high-frequency recitation')
  }
  if (textType.includes('律') || lineCount(poem) >= 8) {
    priority += 8
    reasons.push('longer poem needs more points')
  }
  if ((poem.themes as string[] | null)?.some(theme => ['思乡', '孤独', '送别', '忧国', '友情'].includes(theme))) {
    priority += 5
    reasons.push('common exam theme')
  }

  return { priority, reason: reasons.join(', ') || 'standard coverage' }
}

function summarizeBy<T extends string | null>(
  items: PlanItem[],
  getKey: (item: PlanItem) => T,
) {
  const counts = new Map<string, number>()
  for (const item of items) {
    const key = getKey(item) ?? '未标注'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

function deterministicSample(items: PlanItem[], sampleSize: number) {
  return [...items]
    .sort((a, b) => {
      const aScore = [...a.poemId].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
      const bScore = [...b.poemId].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
      return aScore - bScore || a.poemId.localeCompare(b.poemId)
    })
    .slice(0, sampleSize)
}

async function main() {
  console.log('\n-- Qingteng blueprint scale plan --\n')

  const [poemRows, blueprintRows, v2QuestionRows] = await Promise.all([
    db.select().from(poems),
    db.select().from(quizBlueprints),
    db
      .select({
        poemId: quizQuestions.poemId,
        pointId: quizQuestions.pointId,
      })
      .from(quizQuestions),
  ])

  const blueprintByPoemId = new Map<string, BlueprintRow>(
    blueprintRows.map(blueprint => [blueprint.poemId, blueprint]),
  )
  const v2QuestionPoemIds = new Set(
    v2QuestionRows
      .filter(row => row.pointId)
      .map(row => row.poemId),
  )

  const plan: PlanItem[] = poemRows
    .map(poem => {
      const priority = priorityFor(poem)
      return {
        poemId: poem.id,
        title: poem.title,
        author: poem.author,
        dynasty: poem.dynasty,
        grade: poem.grade,
        textType: poem.textType,
        lineCount: lineCount(poem),
        targetPoints: targetPointCount(poem),
        hasBlueprint: blueprintByPoemId.has(poem.id),
        hasV2Questions: v2QuestionPoemIds.has(poem.id),
        priority: priority.priority,
        reason: priority.reason,
      }
    })
    .sort((a, b) => b.priority - a.priority || a.poemId.localeCompare(b.poemId))

  const missingBlueprints = plan.filter(item => !item.hasBlueprint)
  const missingV2Questions = plan.filter(item => item.hasBlueprint && !item.hasV2Questions)
  const remainingQuestionPoints = plan
    .filter(item => !item.hasV2Questions)
    .reduce((sum, item) => sum + item.targetPoints, 0)
  const sampleSize = Math.ceil(poemRows.length * SAMPLE_RATE)
  const auditSample = deterministicSample(plan, sampleSize)

  console.log(`Poems: ${poemRows.length}`)
  console.log(`Blueprints in DB: ${blueprintRows.length}`)
  console.log(`Poems with v2 questions: ${v2QuestionPoemIds.size}`)
  console.log(`Missing blueprints: ${missingBlueprints.length}`)
  console.log(`Blueprints without v2 questions: ${missingV2Questions.length}`)
  console.log(`Estimated remaining v2 questions if fully scaled: ${remainingQuestionPoints}`)

  console.log('\nBy grade:')
  for (const [grade, count] of summarizeBy(plan, item => item.grade)) {
    console.log(`  ${grade}: ${count}`)
  }

  console.log('\nBy text type:')
  for (const [textType, count] of summarizeBy(plan, item => item.textType).slice(0, 10)) {
    console.log(`  ${textType}: ${count}`)
  }

  console.log('\nRecommended first batch (top 20 missing blueprints):')
  for (const item of missingBlueprints.slice(0, 20)) {
    console.log(
      `  ${item.poemId} 《${item.title}》 ${item.author} | ${item.grade ?? '-'} | ${item.textType ?? '-'} | target=${item.targetPoints} | ${item.reason}`,
    )
  }

  console.log(`\n10% manual audit sample (${auditSample.length} poems):`)
  for (const item of auditSample) {
    console.log(
      `  ${item.poemId} 《${item.title}》 | blueprint=${item.hasBlueprint ? 'yes' : 'no'} | v2=${item.hasV2Questions ? 'yes' : 'no'}`,
    )
  }

  console.log('\nExecution plan:')
  console.log('  1. Generate blueprints in batches of 20 poems.')
  console.log('  2. Human-review at least 10% of poems plus every low-confidence/long poem.')
  console.log('  3. Import reviewed blueprints, then generate v2 questions.')
  console.log('  4. Run pnpm audit:quiz; demo cannot ship with critical issues.')
  console.log('  5. Run pnpm eval after any prompt change.')

  console.log('\nBlueprint scale dry-run complete. No database writes were performed.\n')
  process.exit(0)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
