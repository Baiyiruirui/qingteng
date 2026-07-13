/**
 * 导入考点蓝图：读 data/quiz-blueprints.json → quiz_blueprints 表
 * 运行：pnpm import:blueprints
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { db } from '../src/db'
import { quizBlueprints } from '../src/db/schema'
import { sql } from 'drizzle-orm'

import { BlueprintSchema, validateBlueprintAgainstPoem } from '../src/ai/quiz/blueprint-schema'
import { getPoemForQuiz } from '../src/db/repositories/poems'

const sourceFile = process.argv[2] ?? 'data/quiz-blueprints.json'
const raw = readFileSync(join(process.cwd(), sourceFile), 'utf-8')
const data = JSON.parse(raw)

const blueprints: Array<{ poemId: string; points: unknown[] }> = (data.blueprints as Array<Record<string, unknown>>).map(b => ({
  poemId: b.poemId as string,
  points: b.points as unknown[],
}))

async function main() {
  console.log(`[import-blueprints] 从 ${sourceFile} 导入 ${blueprints.length} 份蓝图…`)

  for (const bp of blueprints) {
    const poem = await getPoemForQuiz(bp.poemId)
    if (!poem) throw new Error(`Poem not found: ${bp.poemId}`)
    const points = BlueprintSchema.parse(bp.points)
    const issues = validateBlueprintAgainstPoem(points, poem)
    if (issues.length > 0) {
      throw new Error(`${bp.poemId} blueprint rejected: ${issues.join('; ')}`)
    }

    await db
      .insert(quizBlueprints)
      .values({ poemId: bp.poemId, points })
      .onConflictDoUpdate({
        target: quizBlueprints.poemId,
        set: { points: sql`excluded.points` },
      })
    console.log(`  ✓ ${bp.poemId}`)
  }

  console.log('[import-blueprints] 完成！')
  process.exit(0)
}

main().catch(err => {
  console.error('[import-blueprints] 失败:', err)
  process.exit(1)
})
