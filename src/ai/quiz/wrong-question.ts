export type WrongQuestionOutcome = 'increment' | 'resolve' | 'none'

type JudgeOutcome = {
  isObjective: boolean
  isCorrect: boolean | null
  completionRate: number | null
}

export function getWrongQuestionOutcome({
  isObjective,
  isCorrect,
  completionRate,
}: JudgeOutcome): WrongQuestionOutcome {
  if (isObjective) {
    if (isCorrect === false) return 'increment'
    if (isCorrect === true) return 'resolve'
    return 'none'
  }

  if (completionRate === null) return 'none'
  if (completionRate < 0.25) return 'increment'
  if (completionRate >= 0.5) return 'resolve'
  return 'none'
}
