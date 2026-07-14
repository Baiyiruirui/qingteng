import assert from 'node:assert/strict'
import { getWrongQuestionOutcome } from '@/ai/quiz/wrong-question'

const cases = [
  {
    name: 'objective wrong enters the wrong book',
    input: { isObjective: true, isCorrect: false, completionRate: null },
    expected: 'increment',
  },
  {
    name: 'objective correct resolves an existing wrong question',
    input: { isObjective: true, isCorrect: true, completionRate: null },
    expected: 'resolve',
  },
  {
    name: 'very weak subjective answer enters the wrong book',
    input: { isObjective: false, isCorrect: null, completionRate: 0.24 },
    expected: 'increment',
  },
  {
    name: 'partial subjective answer keeps the current state',
    input: { isObjective: false, isCorrect: null, completionRate: 0.49 },
    expected: 'none',
  },
  {
    name: 'subjective answer at the mastery threshold resolves the question',
    input: { isObjective: false, isCorrect: null, completionRate: 0.5 },
    expected: 'resolve',
  },
] as const

for (const testCase of cases) {
  assert.equal(getWrongQuestionOutcome(testCase.input), testCase.expected, testCase.name)
}

console.log(`wrong-question policy: ${cases.length}/${cases.length} checks passed`)
