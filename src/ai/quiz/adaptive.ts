import type { quizQuestions } from '@/db/schema'

export type QuizQuestionRow = typeof quizQuestions.$inferSelect

export type PointMasterySignal = {
  pointType: string
  weakScore: number
  attemptCount: number
  averageScore: number | null
}

export type QuizSessionMode = 'adaptive' | 'review'

export type QuizSelectionPlan = {
  mode: QuizSessionMode
  focusPointType: string | null
  weakPointTypes: string[]
  strategy: string
}

type SelectionInput = {
  questions: QuizQuestionRow[]
  signals: PointMasterySignal[]
  mode?: QuizSessionMode
  focusPointType?: string | null
  focusQuestionIds?: string[]
  count?: number
}

function pointTypeOf(question: QuizQuestionRow): string {
  return question.pointType ?? question.type
}

function uniqueById(questions: QuizQuestionRow[]): QuizQuestionRow[] {
  const seen = new Set<string>()
  return questions.filter(question => {
    if (seen.has(question.id)) return false
    seen.add(question.id)
    return true
  })
}

function fillByCoverage(
  picked: QuizQuestionRow[],
  questions: QuizQuestionRow[],
  count: number,
): QuizQuestionRow[] {
  const selected = uniqueById(picked)
  if (selected.length >= count) return selected.slice(0, count)

  const byType = new Map<string, QuizQuestionRow[]>()
  for (const question of questions) {
    const key = pointTypeOf(question)
    if (!byType.has(key)) byType.set(key, [])
    byType.get(key)!.push(question)
  }

  const types = [...byType.keys()]
  let cursor = 0
  while (selected.length < count && cursor < types.length * count) {
    const type = types[cursor % types.length]
    const pool = byType.get(type)!
    const alreadyPicked = selected.filter(question => pointTypeOf(question) === type).length
    const candidate = pool[alreadyPicked]
    if (candidate) selected.push(candidate)
    cursor++
  }

  return uniqueById(selected).slice(0, count)
}

export function selectAdaptiveQuestions({
  questions,
  signals,
  mode = 'adaptive',
  focusPointType = null,
  focusQuestionIds = [],
  count = 5,
}: SelectionInput): { selected: QuizQuestionRow[]; plan: QuizSelectionPlan } {
  const sortedSignals = [...signals]
    .filter(signal => signal.weakScore > 0)
    .sort((a, b) => b.weakScore - a.weakScore)
  const weakPointTypes = sortedSignals.map(signal => signal.pointType)

  if (mode === 'review') {
    const focused = questions.filter(question => {
      return (
        focusQuestionIds.includes(question.id) ||
        (focusPointType ? pointTypeOf(question) === focusPointType : weakPointTypes.includes(pointTypeOf(question)))
      )
    })

    return {
      selected: fillByCoverage(focused, questions, count),
      plan: {
        mode,
        focusPointType,
        weakPointTypes,
        strategy: focusPointType
          ? `专项复习：优先 ${focusPointType} 考点`
          : '专项复习：优先待加强考点',
      },
    }
  }

  const weakQuota = Math.min(3, count)
  const weakCandidates = questions.filter(question => weakPointTypes.includes(pointTypeOf(question)))
  const weakPicked: QuizQuestionRow[] = []

  for (const type of weakPointTypes) {
    const candidate = weakCandidates.find(question => pointTypeOf(question) === type)
    if (candidate && weakPicked.length < weakQuota) weakPicked.push(candidate)
  }

  return {
    selected: fillByCoverage(weakPicked, questions, count),
    plan: {
      mode,
      focusPointType: null,
      weakPointTypes,
      strategy: weakPointTypes.length > 0
        ? '自适应组卷：优先薄弱考点，混入巩固题'
        : '均衡组卷：暂无薄弱记录，优先覆盖不同考点',
    },
  }
}
