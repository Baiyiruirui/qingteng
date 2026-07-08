import {
  MEMORY_CAP_PER_USER,
  effectiveMemoryScore,
  memoryDecayMultiplier,
  normalizeMemoryContent,
  normalizeMemoryKind,
} from '@/ai/memory/policy'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function main() {
  const now = new Date('2026-07-08T00:00:00.000Z')
  const today = new Date('2026-07-08T00:00:00.000Z')
  const tenDaysAgo = new Date('2026-06-28T00:00:00.000Z')

  assert(MEMORY_CAP_PER_USER === 80, 'memory cap should stay explicit')
  assert(normalizeMemoryKind('preference') === 'preference', 'known kind should pass through')
  assert(normalizeMemoryKind('study') === 'personal', 'unknown kind should fall back to personal')
  assert(
    normalizeMemoryContent('  这位学生喜欢李白。  ') === '这位学生喜欢李白。',
    'content should be trimmed and normalized',
  )
  assert(normalizeMemoryContent('太短') === null, 'short content should be dropped')

  const freshDecay = memoryDecayMultiplier(today, now)
  const oldDecay = memoryDecayMultiplier(tenDaysAgo, now)
  assert(freshDecay === 1, 'fresh memory should not decay')
  assert(oldDecay < freshDecay, 'old memory should decay')

  const freshScore = effectiveMemoryScore({
    similarity: 0.7,
    weight: 1,
    createdAt: today,
    now,
  })
  const oldScore = effectiveMemoryScore({
    similarity: 0.7,
    weight: 1,
    createdAt: tenDaysAgo,
    now,
  })
  const weightedOldScore = effectiveMemoryScore({
    similarity: 0.7,
    weight: 2,
    createdAt: tenDaysAgo,
    now,
  })

  assert(freshScore > oldScore, 'fresh memory should outrank same-similarity old memory')
  assert(weightedOldScore > oldScore, 'higher weight should compensate for age')

  console.log('Memory policy checks passed.')
}

main()
