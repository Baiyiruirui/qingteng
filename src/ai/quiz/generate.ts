import { generateObject, generateText } from 'ai'
import { z } from 'zod'
import { route } from '@/ai/router'
import { buildQuizPrompt, QUIZ_GEN_VERSION } from '@/ai/prompts/v1/quiz-generate'
import type { QuizType, QuizDifficulty } from '@/ai/prompts/v1/quiz-generate'
import { getPoemForQuiz } from '@/db/repositories/poems'
import { db } from '@/db'
import { quizQuestions } from '@/db/schema'

// Zod schemas — mcq has options, others don't
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
  isMcq: boolean,
): Promise<z.infer<typeof McqSchema> | z.infer<typeof BaseQuizSchema>> {
  const schema = isMcq ? McqSchema : BaseQuizSchema

  // Try generateObject first (structured output)
  try {
    const result = await generateObject({
      model: route.quizGenerate,
      schema,
      prompt,
    })
    return result.object
  } catch (e) {
    console.warn('[quiz] generateObject failed, falling back to generateText:', e)
  }

  // Fallback: generateText + manual JSON parse + Zod validation
  const result = await generateText({
    model: route.quizGenerate,
    prompt,
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
  const isMcq = type === 'mcq'

  const raw = await callWithFallback(prompt, isMcq)

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
  if (isMcq && 'options' in raw) {
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
