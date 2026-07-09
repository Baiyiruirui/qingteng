import { db } from '@/db'
import { poems, quizBlueprints, quizQuestions } from '@/db/schema'

type QuestionRow = typeof quizQuestions.$inferSelect
type PoemRow = Pick<typeof poems.$inferSelect, 'id' | 'title' | 'lines'>

type Issue = {
  severity: 'critical' | 'warning'
  code: string
  poemId: string
  poemTitle: string
  questionId?: string
  pointId?: string | null
  pointType?: string | null
  detail: string
  action: string
}

type BlueprintPoint = {
  id: string
  type: string
}

const MIN_QUALITY_SCORE = 0.7
const DEMO_BLUEPRINT_POEM_IDS = new Set(['TANG_001', 'TANG_023', 'TANG_042'])

function stripPunct(input: string) {
  return input.replace(/[，。！？、；：""''《》【】（）()\s]/g, '')
}

function evidenceAppearsInPoem(question: QuestionRow, poem: PoemRow) {
  const poemLines = (poem.lines as Array<{ content: string }>).map(line => line.content)
  const corpus = poemLines.map(stripPunct).join('')
  const evidenceLines = question.evidenceLines as string[]
  if (!Array.isArray(evidenceLines) || evidenceLines.length === 0) return false

  return evidenceLines.every(line => {
    const normalized = stripPunct(line)
    return normalized.length > 0 && corpus.includes(normalized)
  })
}

function answerInOptions(question: QuestionRow) {
  if (question.type !== 'mcq') return true
  const options = question.options as string[] | null
  if (!Array.isArray(options) || options.length !== 4) return false
  return options.some(option => option.trim() === question.answer.trim())
}

function hasScoringPoints(question: QuestionRow) {
  if (!['appreciate', 'translate'].includes(question.type)) return true
  const points = question.scoringPoints as string[] | null
  return Array.isArray(points) && points.length >= 2
}

function pushIssue(issues: Issue[], issue: Issue) {
  issues.push(issue)
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = getKey(item)
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return groups
}

async function main() {
  console.log('\n-- Qingteng quiz bank audit --\n')

  const [questionRows, poemRows, blueprintRows] = await Promise.all([
    db.select().from(quizQuestions),
    db.select({ id: poems.id, title: poems.title, lines: poems.lines }).from(poems),
    db.select().from(quizBlueprints),
  ])

  const poemById = new Map(poemRows.map(poem => [poem.id, poem]))
  const issues: Issue[] = []

  for (const question of questionRows) {
    const poem = poemById.get(question.poemId)
    const poemTitle = poem?.title ?? '(unknown poem)'

    if (!poem) {
      pushIssue(issues, {
        severity: 'critical',
        code: 'POEM_MISSING',
        poemId: question.poemId,
        poemTitle,
        questionId: question.id,
        detail: 'Question references a poem that does not exist.',
        action: 'Delete the orphan question or restore the missing poem.',
      })
      continue
    }

    if (!question.evidenceValid || !evidenceAppearsInPoem(question, poem)) {
      pushIssue(issues, {
        severity: question.version === 'v2' ? 'critical' : 'warning',
        code: 'EVIDENCE_INVALID',
        poemId: question.poemId,
        poemTitle,
        questionId: question.id,
        pointId: question.pointId,
        pointType: question.pointType,
        detail: `evidenceValid=${question.evidenceValid}; evidenceLines do not fully match poem text.`,
        action: question.version === 'v2'
          ? 'Regenerate this blueprint point or rewrite evidenceLines manually before demo.'
          : 'Legacy v1 question should stay out of demo flows or be regenerated.',
      })
    }

    if ((question.qualityScore ?? 0) < MIN_QUALITY_SCORE) {
      pushIssue(issues, {
        severity: question.version === 'v2' ? 'critical' : 'warning',
        code: 'LOW_QUALITY_SCORE',
        poemId: question.poemId,
        poemTitle,
        questionId: question.id,
        pointId: question.pointId,
        pointType: question.pointType,
        detail: `qualityScore=${question.qualityScore ?? 'null'} < ${MIN_QUALITY_SCORE}.`,
        action: 'Review explanation, answer, and evidence; regenerate if quality is genuinely low.',
      })
    }

    if (!answerInOptions(question)) {
      pushIssue(issues, {
        severity: 'critical',
        code: 'MCQ_ANSWER_MISMATCH',
        poemId: question.poemId,
        poemTitle,
        questionId: question.id,
        pointId: question.pointId,
        pointType: question.pointType,
        detail: 'MCQ answer does not exactly match one of the four options.',
        action: 'Fix the answer/options pair or regenerate the MCQ.',
      })
    }

    if (!hasScoringPoints(question)) {
      pushIssue(issues, {
        severity: question.version === 'v2' ? 'critical' : 'warning',
        code: 'MISSING_SCORING_POINTS',
        poemId: question.poemId,
        poemTitle,
        questionId: question.id,
        pointId: question.pointId,
        pointType: question.pointType,
        detail: 'Subjective question is missing scoringPoints.',
        action: 'Run pnpm tsx --env-file=.env.local scripts/backfill-scoring-points.ts.',
      })
    }
  }

  const v2Questions = questionRows.filter(question => question.version === 'v2')
  const v2ByPoem = groupBy(v2Questions, question => question.poemId)

  for (const blueprint of blueprintRows) {
    if (!DEMO_BLUEPRINT_POEM_IDS.has(blueprint.poemId) && !v2ByPoem.has(blueprint.poemId)) {
      continue
    }

    const poem = poemById.get(blueprint.poemId)
    const poemTitle = poem?.title ?? blueprint.poemId
    const points = blueprint.points as BlueprintPoint[]
    const expectedPointIds = new Set(points.map(point => point.id))
    const actualQuestions = v2ByPoem.get(blueprint.poemId) ?? []
    const actualPointIds = actualQuestions.map(question => question.pointId).filter(Boolean) as string[]
    const actualPointIdSet = new Set(actualPointIds)

    for (const pointId of expectedPointIds) {
      if (!actualPointIdSet.has(pointId)) {
        pushIssue(issues, {
          severity: 'critical',
          code: 'BLUEPRINT_POINT_MISSING',
          poemId: blueprint.poemId,
          poemTitle,
          pointId,
          detail: `Blueprint point ${pointId} has no v2 question.`,
          action: 'Regenerate this poem with pnpm pregenerate:quiz or generate the missing point.',
        })
      }
    }

    for (const [pointId, rows] of groupBy(actualQuestions, question => question.pointId ?? '').entries()) {
      if (!pointId) continue
      if (rows.length > 1) {
        pushIssue(issues, {
          severity: 'warning',
          code: 'BLUEPRINT_POINT_DUPLICATE',
          poemId: blueprint.poemId,
          poemTitle,
          pointId,
          detail: `Blueprint point ${pointId} has ${rows.length} v2 questions.`,
          action: 'Keep the best question and remove or ignore duplicates before expanding the bank.',
        })
      }
    }
  }

  const issueCounts = issues.reduce<Record<string, number>>((acc, issue) => {
    acc[issue.code] = (acc[issue.code] ?? 0) + 1
    return acc
  }, {})
  const critical = issues.filter(issue => issue.severity === 'critical')
  const warnings = issues.filter(issue => issue.severity === 'warning')

  console.log(`Questions: ${questionRows.length}`)
  console.log(`v2 questions: ${v2Questions.length}`)
  console.log(`Blueprint poems: ${blueprintRows.length}`)
  console.log(`Critical issues: ${critical.length}`)
  console.log(`Warnings: ${warnings.length}`)

  if (issues.length > 0) {
    console.log('\nIssue summary:')
    for (const [code, count] of Object.entries(issueCounts).sort()) {
      console.log(`  ${code}: ${count}`)
    }

    console.log('\nTop issues:')
    for (const issue of issues.slice(0, 30)) {
      console.log(
        `  [${issue.severity}] ${issue.code} ${issue.poemTitle}/${issue.pointId ?? issue.questionId ?? '-'} - ${issue.detail}`,
      )
      console.log(`    action: ${issue.action}`)
    }
  }

  if (critical.length > 0) {
    console.log(`\nQuiz bank audit failed with ${critical.length} critical issue(s).\n`)
    process.exit(1)
  }

  console.log('\nQuiz bank audit passed: no critical issues.\n')
  process.exit(0)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
