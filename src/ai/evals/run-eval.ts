import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { and, eq } from 'drizzle-orm'
import golden from './golden-v0.json'
import { judgeObjective, judgeSubjective } from '@/ai/quiz/judge'
import { getPoemForQuiz } from '@/db/repositories/poems'
import { db } from '@/db'
import { quizQuestions } from '@/db/schema'

type Question = typeof quizQuestions.$inferSelect

type CaseResult = {
  id: string
  kind: 'objective' | 'subjective'
  poemId: string
  pointId: string
  passed: boolean
  expected: unknown
  actual: unknown
  notes?: string
  error?: string
}

async function findQuestion(poemId: string, pointId: string): Promise<Question> {
  const [question] = await db
    .select()
    .from(quizQuestions)
    .where(
      and(
        eq(quizQuestions.version, 'v2'),
        eq(quizQuestions.poemId, poemId),
        eq(quizQuestions.pointId, pointId),
      ),
    )
    .limit(1)

  if (!question) {
    throw new Error(`Missing v2 question for ${poemId}/${pointId}`)
  }
  return question
}

function resolveObjectiveAnswer(question: Question, userAnswer: string): string {
  if (userAnswer === '$ANSWER') return question.answer
  if (userAnswer === '$WRONG_OPTION') {
    const options = (question.options ?? []) as string[]
    return options.find(option => option.trim() !== question.answer.trim()) ?? '__wrong_option__'
  }
  return userAnswer
}

async function runObjectiveCases(): Promise<CaseResult[]> {
  const results: CaseResult[] = []

  for (const testCase of golden.objectiveCases) {
    console.log(`[eval] objective ${testCase.id}`)
    const question = await findQuestion(testCase.poemId, testCase.pointId)
    const userAnswer = resolveObjectiveAnswer(question, testCase.userAnswer)
    const type = question.type as 'mcq' | 'fill'

    if (type !== 'mcq' && type !== 'fill') {
      throw new Error(`Objective case ${testCase.id} points to non-objective question ${question.type}`)
    }

    const judged = judgeObjective(
      {
        type,
        answer: question.answer,
        options: question.options as string[] | null,
      },
      userAnswer,
    )

    results.push({
      id: testCase.id,
      kind: 'objective',
      poemId: testCase.poemId,
      pointId: testCase.pointId,
      passed: judged.isCorrect === testCase.expectedCorrect,
      expected: { isCorrect: testCase.expectedCorrect },
      actual: { isCorrect: judged.isCorrect },
    })
  }

  return results
}

async function runSubjectiveCases(): Promise<CaseResult[]> {
  const results: CaseResult[] = []
  const limit = Number(process.env.EVAL_SUBJECTIVE_LIMIT ?? golden.subjectiveCases.length)
  const cases = golden.subjectiveCases.slice(0, Number.isFinite(limit) ? limit : golden.subjectiveCases.length)

  for (const testCase of cases) {
    console.log(`[eval] subjective ${testCase.id}`)
    const question = await findQuestion(testCase.poemId, testCase.pointId)
    const poem = await getPoemForQuiz(testCase.poemId)
    if (!poem) throw new Error(`Missing poem for ${testCase.poemId}`)

    const scoringPoints = (question.scoringPoints ?? []) as string[]
    if (scoringPoints.length === 0) {
      throw new Error(`Subjective case ${testCase.id} has no scoringPoints`)
    }

    try {
      const judged = await judgeSubjective(
        {
          type: question.type as 'appreciate' | 'translate',
          stem: question.stem,
          answer: question.answer,
          scoringPoints,
        },
        testCase.userAnswer,
        poem,
      )

      const passed =
        judged.completionRate >= testCase.expectedCompletionMin &&
        judged.completionRate <= testCase.expectedCompletionMax

      results.push({
        id: testCase.id,
        kind: 'subjective',
        poemId: testCase.poemId,
        pointId: testCase.pointId,
        passed,
        expected: {
          completionRate: [
            testCase.expectedCompletionMin,
            testCase.expectedCompletionMax,
          ],
        },
        actual: {
          completionRate: judged.completionRate,
          hitPoints: judged.hitPoints,
          missedPoints: judged.missedPoints,
        },
        notes: testCase.rationale,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      results.push({
        id: testCase.id,
        kind: 'subjective',
        poemId: testCase.poemId,
        pointId: testCase.pointId,
        passed: false,
        expected: {
          completionRate: [
            testCase.expectedCompletionMin,
            testCase.expectedCompletionMax,
          ],
        },
        actual: null,
        notes: testCase.rationale,
        error: message,
      })

      if (message.includes('Insufficient Balance') || message.includes('status code: 402')) {
        console.error('[eval] stopping subjective cases: model provider reports insufficient balance')
        break
      }
    }
  }

  return results
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return 'n/a'
  return `${Math.round((numerator / denominator) * 1000) / 10}%`
}

function printSection(title: string, rows: CaseResult[]) {
  const passed = rows.filter(row => row.passed).length
  console.log(`\n${title}: ${passed}/${rows.length} (${pct(passed, rows.length)})`)
  console.log('status  case id                         actual')
  for (const row of rows) {
    const status = row.passed ? 'PASS ' : 'FAIL '
    const actual =
      row.error ? `error=${row.error.slice(0, 80)}` :
      row.kind === 'objective'
        ? `isCorrect=${(row.actual as { isCorrect: boolean }).isCorrect}`
        : `completion=${Math.round((row.actual as { completionRate: number }).completionRate * 100)}%`
    console.log(`${status}  ${row.id.padEnd(30)} ${actual}`)
  }
}

async function main() {
  const started = performance.now()
  const objective = await runObjectiveCases()
  const subjective = await runSubjectiveCases()
  const results = [...objective, ...subjective]
  const durationMs = Math.round(performance.now() - started)

  const objectivePassed = objective.filter(row => row.passed).length
  const subjectivePassed = subjective.filter(row => row.passed).length
  const totalPassed = results.filter(row => row.passed).length

  printSection('Objective judge', objective)
  printSection('Subjective judge', subjective)
  console.log(`\nOverall: ${totalPassed}/${results.length} (${pct(totalPassed, results.length)})`)
  console.log(`Duration: ${durationMs}ms`)

  const report = {
    evalVersion: golden.version,
    generatedAt: new Date().toISOString(),
    durationMs,
    summary: {
      objective: {
        passed: objectivePassed,
        total: objective.length,
        passRate: objectivePassed / objective.length,
      },
      subjective: {
        passed: subjectivePassed,
        total: subjective.length,
        passRate: subjectivePassed / subjective.length,
      },
      overall: {
        passed: totalPassed,
        total: results.length,
        passRate: totalPassed / results.length,
      },
    },
    results,
  }

  const outDir = join(process.cwd(), 'outputs', 'evals')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, `eval-v0-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`JSON report: ${outPath}`)

  process.exit(totalPassed === results.length ? 0 : 1)
}

main().catch(err => {
  console.error('[eval] failed:', err)
  process.exit(1)
})
