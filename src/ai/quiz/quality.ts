import type { quizQuestions } from '@/db/schema'

export const MIN_DEMO_QUIZ_QUALITY = 0.7

type QuestionLike = Pick<
  typeof quizQuestions.$inferSelect,
  'type' | 'options' | 'answer' | 'scoringPoints' | 'qualityScore' | 'evidenceValid' | 'pointId'
>

export function isDemoReadyQuestion(question: QuestionLike) {
  if (!question.pointId || !question.evidenceValid) return false
  if ((question.qualityScore ?? 0) < MIN_DEMO_QUIZ_QUALITY) return false

  if (question.type === 'mcq') {
    const options = question.options as string[] | null
    if (!Array.isArray(options) || options.length !== 4) return false
    if (!options.some(option => option.trim() === question.answer.trim())) return false
  }

  if (question.type === 'appreciate' || question.type === 'translate') {
    const scoringPoints = question.scoringPoints as string[] | null
    if (!Array.isArray(scoringPoints) || scoringPoints.length < 2) return false
  }

  return true
}
