import { generateObject, generateText } from 'ai'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { route } from '@/ai/router'
import { buildQuizPrompt, buildBlueprintPrompt, QUIZ_GEN_VERSION, QUIZ_GEN_VERSION_V2 } from '@/ai/prompts/v1/quiz-generate'
import type { QuizType, QuizDifficulty } from '@/ai/prompts/v1/quiz-generate'
import { getPoemForQuiz } from '@/db/repositories/poems'
import { db } from '@/db'
import { quizQuestions, quizBlueprints } from '@/db/schema'
import type { BlueprintPoint } from '@/db/schema'
import { telemetry } from '@/ai/observability/telemetry'
import { isDemoReadyQuestion, MIN_DEMO_QUIZ_QUALITY } from '@/ai/quiz/quality'

// Zod schemas — mcq has options, subjective adds scoringPoints
const BaseQuizSchema = z.object({
  stem: z.string().min(5),
  answer: z.string().min(1),
  explanation: z.string().min(5),
  evidenceLines: z.array(z.string()).min(1),
  qualityScore: z.number().min(0).max(1),
})

const McqSchema = BaseQuizSchema.extend({
  options: z.array(z.string()).length(4),
})

const SubjectiveSchema = BaseQuizSchema.extend({
  scoringPoints: z.array(z.string()).min(2).max(5),
})

type QuizForm = 'mcq' | 'subjective' | 'fill'

// Strip punctuation for loose evidence matching
function stripPunct(s: string): string {
  return s.replace(/[，。！？、；：""''《》【】\s]/g, '')
}

// Verify every evidenceLine appears in the poem's original text
function verifyEvidence(evidenceLines: string[], poemLines: string[]): boolean {
  const poemCorpus = poemLines.map(l => stripPunct(l)).join('')
  return evidenceLines.every(ev => {
    const stripped = stripPunct(ev)
    return stripped.length > 0 && poemCorpus.includes(stripped)
  })
}

// Verify mcq answer matches one of the options
function verifyMcqAnswer(answer: string, options: string[]): boolean {
  return options.some(o => o.trim() === answer.trim())
}

async function callWithFallback(
  prompt: string,
  form: QuizForm,
  metadata: Record<string, string | number | boolean | undefined>,
): Promise<z.infer<typeof McqSchema> | z.infer<typeof SubjectiveSchema> | z.infer<typeof BaseQuizSchema>> {
  const schema = form === 'mcq' ? McqSchema : form === 'subjective' ? SubjectiveSchema : BaseQuizSchema

  // Try generateObject first (structured output)
  try {
    const result = await generateObject({
      model: route.quizGenerate,
      schema,
      prompt,
      experimental_telemetry: telemetry('qingteng.quiz.generate.object', metadata),
    })
    return result.object
  } catch (e) {
    console.warn('[quiz] generateObject failed, falling back to generateText:', e)
  }

  // Fallback: generateText + manual JSON parse + Zod validation
  const result = await generateText({
    model: route.quizGenerate,
    prompt,
    experimental_telemetry: telemetry('qingteng.quiz.generate.text-fallback', metadata),
  })

  const jsonMatch = result.text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('LLM returned no parseable JSON')

  const parsed = JSON.parse(jsonMatch[0])
  return schema.parse(parsed)
}

export async function generateQuestion(
  poemId: string,
  type: QuizType,
  difficulty: QuizDifficulty,
) {
  const poem = await getPoemForQuiz(poemId)
  if (!poem) throw new Error(`Poem not found: ${poemId}`)

  const prompt = buildQuizPrompt(poem, type, difficulty)

  const raw = await callWithFallback(prompt, type === 'mcq' ? 'mcq' : 'fill', {
    mode: 'quiz-generate',
    version: QUIZ_GEN_VERSION,
    poemId,
    type,
    difficulty,
  })

  // Post-validation 1: evidence lines must appear in poem text
  const poemLineContents = poem.lines.map(l => l.content)
  const evidenceValid = verifyEvidence(raw.evidenceLines, poemLineContents)
  let qualityScore = raw.qualityScore

  if (!evidenceValid) {
    console.warn('[quiz] evidence verification failed — LLM may have hallucinated evidence lines', {
      poemId,
      evidenceLines: raw.evidenceLines,
    })
    qualityScore = Math.min(qualityScore, 0.3) // penalise
  }

  // Post-validation 2: mcq answer must match one option
  if (type === 'mcq' && 'options' in raw) {
    if (!verifyMcqAnswer(raw.answer, raw.options)) {
      console.warn('[quiz] mcq answer does not match any option — fixing', {
        answer: raw.answer,
        options: raw.options,
      })
      // Try to find closest option, otherwise mark low quality
      qualityScore = Math.min(qualityScore, 0.4)
    }
  }

  // Persist to DB
  const [saved] = await db
    .insert(quizQuestions)
    .values({
      poemId,
      type,
      stem: raw.stem,
      options: 'options' in raw ? (raw.options as string[]) : null,
      answer: raw.answer,
      explanation: raw.explanation,
      evidenceLines: raw.evidenceLines as string[],
      difficulty,
      qualityScore,
      evidenceValid,
      promptVersion: QUIZ_GEN_VERSION,
    })
    .returning()

  return {
    id: saved.id,
    poemId: saved.poemId,
    type: saved.type as QuizType,
    stem: saved.stem,
    options: saved.options as string[] | null,
    answer: saved.answer,
    explanation: saved.explanation,
    evidenceLines: saved.evidenceLines as string[],
    difficulty: saved.difficulty as QuizDifficulty,
    qualityScore: saved.qualityScore,
    evidenceValid: saved.evidenceValid,
  }
}

// ── Blueprint-driven generation (v2) ─────────────────────────────────────────

async function generateOneByPoint(
  poem: Awaited<ReturnType<typeof getPoemForQuiz>> & object,
  point: BlueprintPoint,
) {
  const prompt = buildBlueprintPrompt(poem, point)
  const isSubjective = point.form === 'appreciate' || point.form === 'translate'
  const quizForm: QuizForm = point.form === 'mcq' ? 'mcq' : isSubjective ? 'subjective' : 'fill'

  const raw = await callWithFallback(prompt, quizForm, {
    mode: 'quiz-generate',
    version: QUIZ_GEN_VERSION_V2,
    poemId: poem.id,
    pointId: point.id,
    pointType: point.type,
    form: point.form,
  })

  // evidenceLines validation: for 默写, the answer itself IS the poem line
  const poemLineContents = poem.lines.map(l => l.content)
  let evidenceValid: boolean

  if (point.type === '默写') {
    // answer should be an original poem line — verify that
    evidenceValid = verifyEvidence([raw.answer], poemLineContents)
  } else {
    evidenceValid = verifyEvidence(raw.evidenceLines, poemLineContents)
  }

  if (!evidenceValid) {
    throw new Error(`Evidence validation failed for ${poem.id}/${point.id}`)
  }

  if (point.form === 'mcq' && 'options' in raw) {
    if (!verifyMcqAnswer(raw.answer, raw.options)) {
      throw new Error(`MCQ answer mismatch for ${poem.id}/${point.id}`)
    }
  }

  const qualityScore = raw.qualityScore ?? 0
  if (qualityScore < MIN_DEMO_QUIZ_QUALITY) {
    throw new Error(
      `Quality score ${qualityScore} is below ${MIN_DEMO_QUIZ_QUALITY} for ${poem.id}/${point.id}`,
    )
  }

  const [saved] = await db
    .insert(quizQuestions)
    .values({
      poemId: poem.id,
      type: point.form,
      stem: raw.stem,
      options: 'options' in raw ? (raw.options as string[]) : null,
      answer: raw.answer,
      explanation: raw.explanation,
      evidenceLines: raw.evidenceLines as string[],
      scoringPoints: 'scoringPoints' in raw ? (raw.scoringPoints as string[]) : null,
      difficulty: '中',
      qualityScore,
      evidenceValid,
      version: 'v2',
      pointType: point.type,
      pointId: point.id,
      promptVersion: QUIZ_GEN_VERSION_V2,
    })
    .returning()

  return {
    id: saved.id,
    pointId: point.id,
    pointType: point.type,
    form: point.form,
    stem: saved.stem,
    answer: saved.answer,
    options: saved.options as string[] | null,
    explanation: saved.explanation,
    evidenceLines: saved.evidenceLines as string[],
    scoringPoints: saved.scoringPoints as string[] | null,
    qualityScore: saved.qualityScore,
    evidenceValid: saved.evidenceValid,
  }
}

export async function generateByBlueprint(
  poemId: string,
  options: { maxAttempts?: number; delayMs?: number } = {},
) {
  const poem = await getPoemForQuiz(poemId)
  if (!poem) throw new Error(`Poem not found: ${poemId}`)

  const [blueprintRows, existingQuestions] = await Promise.all([
    db
      .select()
      .from(quizBlueprints)
      .where(eq(quizBlueprints.poemId, poemId))
      .limit(1),
    db
      .select()
      .from(quizQuestions)
      .where(and(eq(quizQuestions.poemId, poemId), eq(quizQuestions.version, 'v2'))),
  ])

  const [blueprintRow] = blueprintRows
  if (!blueprintRow) throw new Error(`No blueprint found for poem: ${poemId}`)

  const points = blueprintRow.points as BlueprintPoint[]
  const results: Awaited<ReturnType<typeof generateOneByPoint>>[] = []
  const skipped: string[] = []
  const maxAttempts = options.maxAttempts ?? 3
  const delayMs = options.delayMs ?? 800

  for (const point of points) {
    const existingForPoint = existingQuestions.filter(question => question.pointId === point.id)
    if (existingForPoint.some(isDemoReadyQuestion)) {
      skipped.push(point.id)
      continue
    }
    if (existingForPoint.length > 0) {
      throw new Error(
        `${poemId}/${point.id} has an existing v2 question that failed the demo quality gate`,
      )
    }

    let generated: Awaited<ReturnType<typeof generateOneByPoint>> | null = null
    let lastError: unknown
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        generated = await generateOneByPoint(poem, point)
        break
      } catch (error) {
        lastError = error
        const message = error instanceof Error ? error.message : 'unknown error'
        console.warn(`[quiz-v2] ${poemId}/${point.id} attempt ${attempt}/${maxAttempts} failed: ${message}`)
        if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }

    if (!generated) {
      throw lastError instanceof Error
        ? lastError
        : new Error(`Question generation failed for ${poemId}/${point.id}`)
    }

    results.push(generated)
    if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs))
  }

  return { generated: results, skipped }
}
