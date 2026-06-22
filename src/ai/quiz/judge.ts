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
  return s.replace(/[，。！？、；：""''《》【】\s]/g, '').toLowerCase()
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

  const total = question.scoringPoints.length
  const completionRate = total > 0 ? raw.hitPoints.length / total : 0

  return {
    isCorrect: null,
    completionRate,
    hitPoints: raw.hitPoints,
    missedPoints: raw.missedPoints,
    feedback: raw.feedback,
  }
}
