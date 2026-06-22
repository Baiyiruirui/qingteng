/**
 * 预生成题库脚本（v2 蓝图驱动）
 * 对 3 首诗按考点蓝图出题：静夜思 6 道 + 九月九 6 道 + 登高 8 道 = 20 道
 * 运行：pnpm pregenerate:quiz
 */
import { generateByBlueprint } from '../src/ai/quiz/generate'
import { generateBlueprintForPoem } from '../src/ai/quiz/generate-blueprint'

const POEMS = [
  { id: 'TANG_001', title: '静夜思' },
  { id: 'TANG_023', title: '九月九日忆山东兄弟' },
  { id: 'TANG_042', title: '登高' },
]

// 蓝图生成器测试：拿春晓（TANG_002）测试生成 1 份蓝图
const BLUEPRINT_TEST_POEM = { id: 'TANG_002', title: '春晓' }

const DELAY_MS = 1500

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  // ── 1. 测试蓝图生成器（春晓）──────────────────────────────
  console.log(`\n[blueprint-test] 为《${BLUEPRINT_TEST_POEM.title}》生成蓝图…`)
  try {
    const points = await generateBlueprintForPoem(BLUEPRINT_TEST_POEM.id)
    console.log(`  ✓ 生成 ${points.length} 个考点:`)
    points.forEach(p => console.log(`    ${p.id} [${p.type}] ${p.targetLines.join('，')}`))
  } catch (err) {
    console.warn(`  ⚠ 蓝图生成失败:`, err instanceof Error ? err.message : err)
  }
  await sleep(DELAY_MS)

  // ── 2. v2 题目预生成（3 首 × 蓝图考点）─────────────────────
  console.log(`\n[pregenerate-v2] 开始按蓝图出题…`)

  let totalSuccess = 0
  let totalFailed = 0
  const evidenceInvalidList: string[] = []

  for (const poem of POEMS) {
    console.log(`\n  《${poem.title}》（${poem.id}）`)
    try {
      const questions = await generateByBlueprint(poem.id)
      for (const q of questions) {
        const ev = q.evidenceValid ? '✓' : '✗'
        console.log(`    ${ev} [${q.pointType}] ${q.form}  Q=${q.qualityScore?.toFixed(2) ?? '-'}  id=${q.id}`)
        if (!q.evidenceValid) evidenceInvalidList.push(`${poem.title} · ${q.pointType}`)
        totalSuccess++
        await sleep(DELAY_MS)
      }
    } catch (err) {
      console.warn(`  ⚠ ${poem.title} 整批失败:`, err instanceof Error ? err.message : err)
      totalFailed++
    }
  }

  console.log(`\n[pregenerate-v2] 完成！`)
  console.log(`  成功 ${totalSuccess} 道 / 失败批次 ${totalFailed} / evidenceValid=false ${evidenceInvalidList.length} 道`)
  if (evidenceInvalidList.length > 0) {
    evidenceInvalidList.forEach(l => console.log(`    - ${l}`))
  }
}

main().catch(err => {
  console.error('[pregenerate] 脚本异常退出:', err)
  process.exit(1)
})
