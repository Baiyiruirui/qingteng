/**
 * 预生成题库脚本：3 首诗 × 4 题型 × 3 难度 = 36 道
 * 运行：pnpm pregenerate:quiz
 */
import { generateQuestion } from '../src/ai/quiz/generate'
import type { QuizType, QuizDifficulty } from '../src/ai/prompts/v1/quiz-generate'

const POEMS = [
  { id: 'TANG_001', title: '静夜思' },
  { id: 'TANG_023', title: '九月九日忆山东兄弟' },
  { id: 'TANG_042', title: '登高' },
]

const TYPES: QuizType[] = ['mcq', 'fill', 'translate', 'appreciate']
const DIFFICULTIES: QuizDifficulty[] = ['易', '中', '难']

const DELAY_MS = 1500 // 避免 DeepSeek 限流

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  const tasks: Array<{ poemId: string; title: string; type: QuizType; difficulty: QuizDifficulty }> = []

  for (const poem of POEMS) {
    for (const type of TYPES) {
      for (const difficulty of DIFFICULTIES) {
        tasks.push({ poemId: poem.id, title: poem.title, type, difficulty })
      }
    }
  }

  console.log(`[pregenerate] 开始生成 ${tasks.length} 道题目…\n`)

  let success = 0
  let failed = 0
  const evidenceInvalidList: string[] = []

  for (let i = 0; i < tasks.length; i++) {
    const { poemId, title, type, difficulty } = tasks[i]
    const label = `[${i + 1}/${tasks.length}] ${title} · ${type} · ${difficulty}`

    try {
      const q = await generateQuestion(poemId, type, difficulty)
      const ev = q.evidenceValid ? '✓' : '✗'
      console.log(`  ${ev} ${label}  qualityScore=${q.qualityScore?.toFixed(2) ?? '-'}  id=${q.id}`)
      if (!q.evidenceValid) evidenceInvalidList.push(label)
      success++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`  ⚠ ${label}  FAILED: ${msg}`)
      failed++
    }

    if (i < tasks.length - 1) {
      await sleep(DELAY_MS)
    }
  }

  console.log(`\n[pregenerate] 完成！`)
  console.log(`  成功 ${success} / 失败 ${failed} / 共 ${tasks.length}`)
  console.log(`  evidenceValid=false 的题: ${evidenceInvalidList.length} 道`)
  if (evidenceInvalidList.length > 0) {
    evidenceInvalidList.forEach(l => console.log(`    - ${l}`))
  }
}

main().catch(err => {
  console.error('[pregenerate] 脚本异常退出:', err)
  process.exit(1)
})
