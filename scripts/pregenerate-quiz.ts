/**
 * Idempotently generate demo-ready v2 questions for the representative poem set.
 * Prerequisite: pnpm import:blueprints:representative
 */
import { generateByBlueprint } from '@/ai/quiz/generate'
import { REPRESENTATIVE_QUIZ_POEMS } from '@/ai/quiz/representative-set'

async function main() {
  console.log('\n-- Pregenerate representative v2 quiz bank --\n')

  let generated = 0
  let skipped = 0
  const failures: string[] = []

  for (const [index, poem] of REPRESENTATIVE_QUIZ_POEMS.entries()) {
    console.log(`[${index + 1}/${REPRESENTATIVE_QUIZ_POEMS.length}] 《${poem.title}》 (${poem.id})`)
    try {
      const result = await generateByBlueprint(poem.id, { maxAttempts: 3, delayMs: 900 })
      generated += result.generated.length
      skipped += result.skipped.length

      for (const question of result.generated) {
        console.log(
          `  + ${question.pointId} [${question.pointType}] ${question.form} quality=${question.qualityScore?.toFixed(2) ?? '-'}`,
        )
      }
      if (result.skipped.length > 0) console.log(`  = skipped existing: ${result.skipped.join(', ')}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error'
      failures.push(`${poem.id}: ${message}`)
      console.error(`  ! failed: ${message}`)
    }
  }

  console.log(`\nGenerated: ${generated}`)
  console.log(`Skipped existing: ${skipped}`)
  console.log(`Failed poems: ${failures.length}`)

  if (failures.length > 0) {
    failures.forEach(failure => console.log(`  - ${failure}`))
    process.exit(1)
  }

  console.log('\nRepresentative v2 generation complete.\n')
  process.exit(0)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
