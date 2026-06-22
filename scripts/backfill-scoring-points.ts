/**
 * Backfill scoringPoints for existing v2 appreciate/translate questions
 * that were generated before the scoringPoints schema was added.
 */
import { generateObject, generateText } from 'ai'
import { z } from 'zod'
import { eq, and, isNull, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { quizQuestions } from '@/db/schema'
import { route } from '@/ai/router'

const ScoringPointsSchema = z.object({
  scoringPoints: z.array(z.string()).min(2).max(5),
})

async function extractScoringPoints(
  stem: string,
  answer: string,
  explanation: string,
): Promise<string[]> {
  const prompt = `你是一位严谨的中学语文老师，请将下面这道主观题的参考答案拆成 2-4 个离散的得分要点。

每个得分要点要满足：
1. 可以独立判断"学生是否答到了这个点"
2. 一句话表达，简洁精准
3. 彼此不重叠

题干：${stem}

参考答案：${answer}

答案解析：${explanation}

只输出 JSON，格式：{ "scoringPoints": ["得分点1", "得分点2", "得分点3"] }`

  try {
    const result = await generateObject({
      model: route.quizGenerate,
      schema: ScoringPointsSchema,
      prompt,
    })
    return result.object.scoringPoints
  } catch {
    const result = await generateText({ model: route.quizGenerate, prompt })
    const m = result.text.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('No JSON from LLM')
    return ScoringPointsSchema.parse(JSON.parse(m[0])).scoringPoints
  }
}

async function main() {
  console.log('[backfill] 查询 v2 主观题中 scoringPoints 为空的记录…')

  const rows = await db
    .select()
    .from(quizQuestions)
    .where(
      and(
        eq(quizQuestions.version, 'v2'),
        inArray(quizQuestions.type, ['appreciate', 'translate']),
        isNull(quizQuestions.scoringPoints),
      ),
    )

  console.log(`[backfill] 找到 ${rows.length} 道题需要补充 scoringPoints`)

  let success = 0
  let failed = 0

  for (const row of rows) {
    try {
      const points = await extractScoringPoints(row.stem, row.answer, row.explanation)
      await db
        .update(quizQuestions)
        .set({ scoringPoints: points })
        .where(eq(quizQuestions.id, row.id))

      console.log(`  ✓ [${row.pointType ?? row.type}] ${row.stem.slice(0, 30)}… → ${points.length} 个得分点`)
      success++
    } catch (e) {
      console.error(`  ✗ ${row.id}: ${e}`)
      failed++
    }
  }

  console.log(`\n[backfill] 完成！成功 ${success} / 失败 ${failed}`)
}

main().catch(console.error)
