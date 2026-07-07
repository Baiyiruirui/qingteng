import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { and, eq } from 'drizzle-orm'
import golden from './golden-v0.json'
import { judgeObjective, judgeSubjective } from '@/ai/quiz/judge'
import { getPoemForQuiz } from '@/db/repositories/poems'
import { db } from '@/db'
import { quizQuestions } from '@/db/schema'
import { renderMemoryContext } from '@/ai/memory/render-context'
import { buildOpeningUserPrompt } from '@/ai/prompts/v1/opening-core'
import { selectAdaptiveQuestions } from '@/ai/quiz/adaptive'

type Question = typeof quizQuestions.$inferSelect
type EvalKind =
  | 'objective'
  | 'subjective'
  | 'quiz_quality'
  | 'memory_recall'
  | 'opening_quality'
  | 'adaptive_session'
type QualityCheck = {
  name: string
  passed: boolean
  actual: unknown
  expected: unknown
}

type CaseResult = {
  id: string
  kind: EvalKind
  poemId?: string
  pointId?: string
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

async function runQuizQualityCases(): Promise<CaseResult[]> {
  const results: CaseResult[] = []

  for (const testCase of golden.quizQualityCases) {
    console.log(`[eval] quiz-quality ${testCase.id}`)
    const question = await findQuestion(testCase.poemId, testCase.pointId)
    const options = (question.options ?? []) as string[]
    const scoringPoints = (question.scoringPoints ?? []) as string[]
    const evidenceLines = (question.evidenceLines ?? []) as string[]

    const checks: QualityCheck[] = [
      {
        name: 'form',
        passed: question.type === testCase.expectedForm,
        actual: question.type,
        expected: testCase.expectedForm,
      },
      {
        name: 'pointType',
        passed: question.pointType === testCase.expectedPointType,
        actual: question.pointType,
        expected: testCase.expectedPointType,
      },
      {
        name: 'qualityScore',
        passed: Number(question.qualityScore ?? 0) >= testCase.minQualityScore,
        actual: question.qualityScore,
        expected: `>=${testCase.minQualityScore}`,
      },
      {
        name: 'evidenceLines',
        passed: evidenceLines.length > 0,
        actual: evidenceLines.length,
        expected: '>0',
      },
    ]

    if (testCase.requireEvidenceValid) {
      checks.push({
        name: 'evidenceValid',
        passed: question.evidenceValid === true,
        actual: question.evidenceValid,
        expected: true,
      })
    }

    if (testCase.requireOptions) {
      checks.push({
        name: 'options',
        passed: options.length === 4,
        actual: options.length,
        expected: 4,
      })
    }

    if (testCase.requireScoringPoints) {
      checks.push({
        name: 'scoringPoints',
        passed: scoringPoints.length >= 2,
        actual: scoringPoints.length,
        expected: '>=2',
      })
    }

    results.push({
      id: testCase.id,
      kind: 'quiz_quality',
      poemId: testCase.poemId,
      pointId: testCase.pointId,
      passed: checks.every(check => check.passed),
      expected: {
        form: testCase.expectedForm,
        pointType: testCase.expectedPointType,
        minQualityScore: testCase.minQualityScore,
      },
      actual: {
        passedChecks: checks.filter(check => check.passed).length,
        totalChecks: checks.length,
        checks,
      },
    })
  }

  return results
}

function runMemoryRecallCases(): CaseResult[] {
  const results: CaseResult[] = []

  for (const testCase of golden.memoryRecallCases) {
    console.log(`[eval] memory-recall ${testCase.id}`)
    const rendered = renderMemoryContext(testCase.memories)
    const includes = testCase.expectedIncludes.every(fragment => rendered.includes(fragment))
    const excludes = (testCase.forbiddenIncludes ?? []).every(fragment => !rendered.includes(fragment))
    const emptyOk = testCase.expectedEmpty ? rendered === '' : true

    results.push({
      id: testCase.id,
      kind: 'memory_recall',
      passed: includes && excludes && emptyOk,
      expected: {
        includes: testCase.expectedIncludes,
        forbiddenIncludes: testCase.forbiddenIncludes ?? [],
        expectedEmpty: testCase.expectedEmpty ?? false,
      },
      actual: {
        outputChars: rendered.length,
        missingIncludes: testCase.expectedIncludes.filter(fragment => !rendered.includes(fragment)),
        forbiddenHits: (testCase.forbiddenIncludes ?? []).filter(fragment => rendered.includes(fragment)),
        isEmpty: rendered === '',
      },
    })
  }

  return results
}

function runOpeningQualityCases(): CaseResult[] {
  const results: CaseResult[] = []

  for (const testCase of golden.openingQualityCases) {
    console.log(`[eval] opening-quality ${testCase.id}`)
    const snapshot = testCase.snapshot
      ? {
          lastMessageAt: Date.now() - testCase.snapshot.lastMessageAtOffsetMs,
          recentMessages: testCase.snapshot.recentMessages,
        }
      : null
    const prompt = buildOpeningUserPrompt({ userName: testCase.userName, snapshot })
    const includes = testCase.expectedIncludes.every(fragment => prompt.includes(fragment))
    const excludes = (testCase.forbiddenIncludes ?? []).every(fragment => !prompt.includes(fragment))

    results.push({
      id: testCase.id,
      kind: 'opening_quality',
      passed: includes && excludes,
      expected: {
        includes: testCase.expectedIncludes,
        forbiddenIncludes: testCase.forbiddenIncludes ?? [],
      },
      actual: {
        outputChars: prompt.length,
        missingIncludes: testCase.expectedIncludes.filter(fragment => !prompt.includes(fragment)),
        forbiddenHits: (testCase.forbiddenIncludes ?? []).filter(fragment => prompt.includes(fragment)),
      },
    })
  }

  return results
}

async function runAdaptiveSessionCases(): Promise<CaseResult[]> {
  const results: CaseResult[] = []

  for (const testCase of golden.adaptiveSessionCases) {
    console.log(`[eval] adaptive-session ${testCase.id}`)
    const questions = await db
      .select()
      .from(quizQuestions)
      .where(and(eq(quizQuestions.poemId, testCase.poemId), eq(quizQuestions.version, 'v2')))

    const { selected, plan } = selectAdaptiveQuestions({
      questions,
      signals: testCase.signals,
      mode: testCase.mode as 'adaptive' | 'review',
      focusPointType: testCase.focusPointType ?? null,
      count: 5,
    })

    const selectedPointTypes = selected.map(question => question.pointType ?? question.type)
    const distinctPointTypes = new Set(selectedPointTypes).size
    const includesExpected = (testCase.expectedIncludesPointTypes ?? []).every(pointType =>
      selectedPointTypes.includes(pointType),
    )
    const meetsDiversity = testCase.minDistinctPointTypes
      ? distinctPointTypes >= testCase.minDistinctPointTypes
      : true
    const strategyOk = plan.strategy.includes(testCase.expectedStrategyIncludes)

    results.push({
      id: testCase.id,
      kind: 'adaptive_session',
      poemId: testCase.poemId,
      passed: selected.length > 0 && includesExpected && meetsDiversity && strategyOk,
      expected: {
        includesPointTypes: testCase.expectedIncludesPointTypes ?? [],
        minDistinctPointTypes: testCase.minDistinctPointTypes ?? null,
        strategyIncludes: testCase.expectedStrategyIncludes,
      },
      actual: {
        selectedPointTypes,
        distinctPointTypes,
        strategy: plan.strategy,
      },
    })
  }

  return results
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return 'n/a'
  return `${Math.round((numerator / denominator) * 1000) / 10}%`
}

function passRate(rows: CaseResult[]): number | null {
  if (rows.length === 0) return null
  return rows.filter(row => row.passed).length / rows.length
}

function formatActual(row: CaseResult): string {
  if (row.error) return `error=${row.error.slice(0, 80)}`
  if (row.kind === 'objective') {
    return `isCorrect=${(row.actual as { isCorrect: boolean }).isCorrect}`
  }
  if (row.kind === 'subjective') {
    return `completion=${Math.round((row.actual as { completionRate: number }).completionRate * 100)}%`
  }
  if (row.kind === 'quiz_quality') {
    const actual = row.actual as { passedChecks: number; totalChecks: number }
    return `checks=${actual.passedChecks}/${actual.totalChecks}`
  }
  if (row.kind === 'memory_recall' || row.kind === 'opening_quality') {
    const actual = row.actual as { outputChars: number; missingIncludes: string[]; forbiddenHits: string[] }
    return `chars=${actual.outputChars} missing=${actual.missingIncludes.length} forbidden=${actual.forbiddenHits.length}`
  }
  if (row.kind === 'adaptive_session') {
    const actual = row.actual as { selectedPointTypes: string[]; distinctPointTypes: number }
    return `types=${actual.selectedPointTypes.join('/')} distinct=${actual.distinctPointTypes}`
  }
  return JSON.stringify(row.actual).slice(0, 80)
}

function printSection(title: string, rows: CaseResult[]) {
  const passed = rows.filter(row => row.passed).length
  console.log(`\n${title}: ${passed}/${rows.length} (${pct(passed, rows.length)})`)
  console.log('status  case id                         actual')
  for (const row of rows) {
    const status = row.passed ? 'PASS ' : 'FAIL '
    console.log(`${status}  ${row.id.padEnd(30)} ${formatActual(row)}`)
  }
}

async function main() {
  const started = performance.now()
  const quizQuality = await runQuizQualityCases()
  const memoryRecall = runMemoryRecallCases()
  const openingQuality = runOpeningQualityCases()
  const adaptiveSession = await runAdaptiveSessionCases()
  const objective = await runObjectiveCases()
  const subjective = await runSubjectiveCases()
  const results = [
    ...quizQuality,
    ...memoryRecall,
    ...openingQuality,
    ...adaptiveSession,
    ...objective,
    ...subjective,
  ]
  const durationMs = Math.round(performance.now() - started)

  const objectivePassed = objective.filter(row => row.passed).length
  const subjectivePassed = subjective.filter(row => row.passed).length
  const quizQualityPassed = quizQuality.filter(row => row.passed).length
  const memoryRecallPassed = memoryRecall.filter(row => row.passed).length
  const openingQualityPassed = openingQuality.filter(row => row.passed).length
  const adaptiveSessionPassed = adaptiveSession.filter(row => row.passed).length
  const totalPassed = results.filter(row => row.passed).length

  printSection('Quiz quality', quizQuality)
  printSection('Memory recall', memoryRecall)
  printSection('Opening quality', openingQuality)
  printSection('Adaptive session', adaptiveSession)
  printSection('Objective judge', objective)
  printSection('Subjective judge', subjective)
  console.log(`\nOverall: ${totalPassed}/${results.length} (${pct(totalPassed, results.length)})`)
  console.log(`Duration: ${durationMs}ms`)

  const report = {
    evalVersion: golden.version,
    generatedAt: new Date().toISOString(),
    durationMs,
    summary: {
      quizQuality: {
        passed: quizQualityPassed,
        total: quizQuality.length,
        passRate: passRate(quizQuality),
      },
      memoryRecall: {
        passed: memoryRecallPassed,
        total: memoryRecall.length,
        passRate: passRate(memoryRecall),
      },
      openingQuality: {
        passed: openingQualityPassed,
        total: openingQuality.length,
        passRate: passRate(openingQuality),
      },
      adaptiveSession: {
        passed: adaptiveSessionPassed,
        total: adaptiveSession.length,
        passRate: passRate(adaptiveSession),
      },
      objective: {
        passed: objectivePassed,
        total: objective.length,
        passRate: passRate(objective),
      },
      subjective: {
        passed: subjectivePassed,
        total: subjective.length,
        passRate: passRate(subjective),
      },
      overall: {
        passed: totalPassed,
        total: results.length,
        passRate: passRate(results),
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
