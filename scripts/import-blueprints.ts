/**
 * 导入考点蓝图：读 data/quiz-blueprints.json → quiz_blueprints 表
 * 运行：pnpm import:blueprints
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { db } from '../src/db'
import { quizBlueprints } from '../src/db/schema'
import { sql } from 'drizzle-orm'

const raw = readFileSync(join(process.cwd(), 'data/quiz-blueprints.json'), 'utf-8')
const data = JSON.parse(raw)

const blueprints: Array<{ poemId: string; points: unknown[] }> = (data.blueprints as Array<Record<string, unknown>>).map(b => ({
  poemId: b.poemId as string,
  points: b.points as unknown[],
}))

async function main() {
  console.log(`[import-blueprints] 导入 ${blueprints.length} 份蓝图…`)

  for (const bp of blueprints) {
    await db
      .insert(quizBlueprints)
      .values({ poemId: bp.poemId, points: bp.points })
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
