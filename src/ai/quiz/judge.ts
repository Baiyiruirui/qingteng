import { generateObject, generateText } from 'ai'
import { z } from 'zod'
import { route } from '@/ai/router'
import { buildJudgePrompt } from '@/ai/prompts/v1/quiz-judge'
import type { PoemForQuiz } from '@/db/repositories/poems'

export interface ObjectiveQuestion {
  type: 'mcq' | 'fill'
  answer: string
  options?: string[] | null
}

export interface SubjectiveQuestion {
  type: 'appreciate' | 'translate'
  stem: string
  answer: string
  scoringPoints: string[]
}

export interface ObjectiveJudgeResult {
  isCorrect: boolean
  completionRate: null
  hitPoints: null
  missedPoints: null
  feedback: null
}

export interface SubjectiveJudgeResult {
  isCorrect: null       // not judged as binary — use completionRate instead
  completionRate: number
  hitPoints: string[]
  missedPoints: string[]
  feedback: string
}

const JudgeResponseSchema = z.object({
  hitPoints: z.array(z.string()),
  missedPoints: z.array(z.string()),
  feedback: z.string(),
})

function stripPunct(s: string): string {
  return s.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()
}

function normalizeConceptText(s: string): string {
  return stripPunct(s).replace(/[的了着过很也就都还更已他她它其而和与并及]/g, '')
}

function bigrams(s: string): Set<string> {
  const grams = new Set<string>()
  for (let i = 0; i < s.length - 1; i++) grams.add(s.slice(i, i + 2))
  return grams
}

function overlapRatio(a: string, b: string): number {
  if (a.length < 8 || b.length < 8) return 0
  const aGrams = bigrams(a)
  const bGrams = bigrams(b)
  if (aGrams.size === 0 || bGrams.size === 0) return 0

  let overlap = 0
  for (const gram of aGrams) {
    if (bGrams.has(gram)) overlap++
  }
  return overlap / Math.min(aGrams.size, bGrams.size)
}

function matchScoringPointIndex(rawPoint: string, scoringPoints: string[]): number | null {
  const raw = stripPunct(rawPoint)
  if (!raw) return null

  const normalizedPoints = scoringPoints.map(stripPunct)
  const exactIndex = normalizedPoints.findIndex(point => point === raw)
  if (exactIndex >= 0) return exactIndex

  const containsIndex = normalizedPoints.findIndex(
    point => raw.length >= 8 && (point.includes(raw) || raw.includes(point)),
  )
  if (containsIndex >= 0) return containsIndex

  let bestIndex: number | null = null
  let bestScore = 0
  normalizedPoints.forEach((point, index) => {
    const score = overlapRatio(raw, point)
    if (score > bestScore) {
      bestScore = score
      bestIndex = index
    }
  })

  return bestScore >= 0.55 ? bestIndex : null
}

function getConceptPhrases(scoringPoint: string): string[] {
  return scoringPoint
    .replace(/[“”"'‘’]/g, '')
    .split(/[，。；、（）()]/)
    .map(part => part.split(/[为即]/).at(-1) ?? part)
    .map(part =>
      part
        .replace(/^(准确翻译出|将|答出|指出|点明|表现|表达|语句通顺|保留原诗|或)/, '')
        .replace(/(等意思|之类动作|得\d分)$/g, ''),
    )
    .map(normalizeConceptText)
    .filter(part => part.length >= 4)
}

function hasAliasConceptMatch(scoringPoint: string, userAnswer: string): boolean {
  const point = normalizeConceptText(scoringPoint)
  const answer = normalizeConceptText(userAnswer)

  const aliasGroups = [
    ['饮酒', '喝酒', '不喝酒', '不能喝酒', '不再喝酒'],
    ['亲人', '家人'],
    ['思乡', '想家', '思念故乡'],
    ['霜鬓', '白发', '鬓白'],
  ]

  return aliasGroups.some(group => {
    const pointHasConcept = group.some(alias => point.includes(normalizeConceptText(alias)))
    const answerHasConcept = group.some(alias => answer.includes(normalizeConceptText(alias)))
    return pointHasConcept && answerHasConcept
  })
}

function hasAnswerConceptMatch(scoringPoint: string, userAnswer: string): boolean {
  const answer = normalizeConceptText(userAnswer)
  return getConceptPhrases(scoringPoint).some(phrase => answer.includes(phrase))
    || hasAliasConceptMatch(scoringPoint, userAnswer)
}

function normalizeJudgePoints(
  scoringPoints: string[],
  userAnswer: string,
  raw: z.infer<typeof JudgeResponseSchema>,
): Pick<SubjectiveJudgeResult, 'completionRate' | 'hitPoints' | 'missedPoints'> {
  const hitIndexes = new Set<number>()
  const missedIndexes = new Set<number>()

  for (const point of raw.hitPoints) {
    const index = matchScoringPointIndex(point, scoringPoints)
    if (index !== null) hitIndexes.add(index)
  }

  for (const point of raw.missedPoints) {
    const index = matchScoringPointIndex(point, scoringPoints)
    if (index !== null) missedIndexes.add(index)
  }

  scoringPoints.forEach((point, index) => {
    if (hitIndexes.has(index)) return
    if (hasAnswerConceptMatch(point, userAnswer)) {
      hitIndexes.add(index)
      missedIndexes.delete(index)
    }
  })

  const normalizedHitIndexes = new Set<number>()
  const normalizedHitPoints = scoringPoints.filter((_, index) => {
    if (!hitIndexes.has(index) || missedIndexes.has(index)) return false
    normalizedHitIndexes.add(index)
    return true
  })
  const normalizedMissedPoints = scoringPoints.filter((_, index) => {
    return !normalizedHitIndexes.has(index)
  })

  const total = scoringPoints.length
  return {
    completionRate: total > 0 ? normalizedHitPoints.length / total : 0,
    hitPoints: normalizedHitPoints,
    missedPoints: normalizedMissedPoints,
  }
}

export function judgeObjective(
  question: ObjectiveQuestion,
  userAnswer: string,
): ObjectiveJudgeResult {
  const correct = stripPunct(question.answer)
  const given = stripPunct(userAnswer)

  let isCorrect: boolean
  if (question.type === 'mcq') {
    const letterMatch = userAnswer.trim().match(/^([A-D])/i)
    if (letterMatch && question.options) {
      const idx = 'ABCD'.indexOf(letterMatch[1].toUpperCase())
      isCorrect = idx >= 0 && stripPunct(question.options[idx]) === correct
    } else {
      isCorrect = correct === given || question.answer.trim() === userAnswer.trim()
    }
  } else {
    isCorrect = correct === given
  }

  return { isCorrect, completionRate: null, hitPoints: null, missedPoints: null, feedback: null }
}

export async function judgeSubjective(
  question: SubjectiveQuestion,
  userAnswer: string,
  poem: PoemForQuiz,
): Promise<SubjectiveJudgeResult> {
  const prompt = buildJudgePrompt({
    stem: question.stem,
    answer: question.answer,
    scoringPoints: question.scoringPoints,
    userAnswer,
    poem,
  })

  let raw: z.infer<typeof JudgeResponseSchema>

  try {
    const result = await generateObject({
      model: route.quizGenerate,
      schema: JudgeResponseSchema,
      prompt,
    })
    raw = result.object
  } catch {
    const result = await generateText({ model: route.quizGenerate, prompt })
    const m = result.text.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('LLM returned no parseable JSON for judge')
    raw = JudgeResponseSchema.parse(JSON.parse(m[0]))
  }

  const normalized = normalizeJudgePoints(question.scoringPoints, userAnswer, raw)

  return {
    isCorrect: null,
    completionRate: normalized.completionRate,
    hitPoints: normalized.hitPoints,
    missedPoints: normalized.missedPoints,
    feedback: raw.feedback,
  }
}
