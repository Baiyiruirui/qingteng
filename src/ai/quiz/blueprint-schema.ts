import { z } from 'zod'
import type { BlueprintPoint } from '@/db/schema'
import type { PoemForQuiz } from '@/db/repositories/poems'

export const BLUEPRINT_POINT_TYPES = [
  '默写',
  '炼字',
  '画面',
  '意象',
  '手法',
  '情感',
  '翻译',
  '综合选择',
] as const

export const BlueprintPointSchema = z.object({
  id: z.string().regex(/^p\d+$/),
  type: z.enum(BLUEPRINT_POINT_TYPES),
  ability: z.string().min(2),
  targetLines: z.array(z.string().min(1)).min(1),
  prompt_hint: z.string().min(5),
  answerKey: z.string().min(5),
  form: z.enum(['fill', 'appreciate', 'translate', 'mcq']),
})

export const BlueprintSchema = z.array(BlueprintPointSchema).min(4).max(10)

const EXPECTED_FORM: Partial<Record<(typeof BLUEPRINT_POINT_TYPES)[number], BlueprintPoint['form']>> = {
  默写: 'fill',
  炼字: 'appreciate',
  画面: 'appreciate',
  意象: 'appreciate',
  手法: 'appreciate',
  情感: 'appreciate',
  翻译: 'translate',
  综合选择: 'mcq',
}

function stripPunctuation(value: string) {
  return value.replace(/[，。！？、；："“”'‘’《》【】（）()\s]/g, '')
}

export function validateBlueprintAgainstPoem(
  points: BlueprintPoint[],
  poem: PoemForQuiz,
): string[] {
  const issues: string[] = []
  const expectedRange = poem.lines.length <= 4 ? [4, 6] : [6, 8]
  if (points.length < expectedRange[0] || points.length > expectedRange[1]) {
    issues.push(`expected ${expectedRange[0]}-${expectedRange[1]} points, received ${points.length}`)
  }

  const ids = new Set<string>()
  const types = new Set<string>()
  const poemCorpus = poem.lines.map(line => stripPunctuation(line.content)).join('')

  for (const point of points) {
    if (ids.has(point.id)) issues.push(`duplicate point id ${point.id}`)
    ids.add(point.id)
    types.add(point.type)

    const expectedForm = EXPECTED_FORM[point.type as keyof typeof EXPECTED_FORM]
    if (expectedForm && point.form !== expectedForm) {
      issues.push(`${point.id} ${point.type} must use form=${expectedForm}`)
    }

    for (const line of point.targetLines) {
      if (line === '全诗') continue
      const normalized = stripPunctuation(line)
      if (!normalized || !poemCorpus.includes(normalized)) {
        issues.push(`${point.id} target line is not in the poem: ${line}`)
      }
    }
  }

  if (types.size < 4) issues.push(`expected at least 4 point types, received ${types.size}`)
  return issues
}
