import { db } from '@/db'
import { poems } from '@/db/schema'
import { sql, count } from 'drizzle-orm'

async function main() {
  // Total count
  const [{ total }] = await db.select({ total: count() }).from(poems)

  // Lines non-empty count
  const [{ withLines }] = await db
    .select({ withLines: count() })
    .from(poems)
    .where(sql`jsonb_array_length(lines) > 0`)

  console.log(`\n── 诗词数据验证 ──────────────────────────`)
  console.log(`总数:      ${total}`)
  console.log(`有诗句:    ${withLines}`)

  if (Number(total) !== 140) {
    console.warn(`⚠️  期望 140 首，实际 ${total} 首`)
  } else {
    console.log(`✓  共 140 首，全部有诗句`)
  }

  // Random poem sample
  const [sample] = await db
    .select()
    .from(poems)
    .orderBy(sql`random()`)
    .limit(1)

  if (sample) {
    console.log(`\n── 随机抽样 ──────────────────────────────`)
    console.log(`ID:    ${sample.id}`)
    console.log(`标题:  ${sample.title}  [${sample.author} · ${sample.dynasty}]`)
    console.log(`学段:  ${sample.grade ?? '-'}  体裁: ${sample.textType ?? '-'}`)
    console.log(`主题:  ${(sample.themes as string[])?.join(', ') ?? '-'}`)
    console.log(`诗句数: ${(sample.lines as unknown[]).length}`)
    const firstLine = (sample.lines as Array<{ content: string; translation?: string }>)[0]
    console.log(`首句:  ${firstLine.content}`)
    console.log(`译文:  ${firstLine.translation ?? '-'}`)
  }

  // Dynasty distribution
  const dynastyRows = await db
    .select({ dynasty: poems.dynasty, cnt: count() })
    .from(poems)
    .groupBy(poems.dynasty)
    .orderBy(sql`count(*) desc`)

  console.log(`\n── 朝代分布 ──────────────────────────────`)
  dynastyRows.forEach(r => console.log(`  ${(r.dynasty ?? '未知').padEnd(6)} ${r.cnt} 首`))

  // Grade distribution
  const gradeRows = await db
    .select({ grade: poems.grade, cnt: count() })
    .from(poems)
    .groupBy(poems.grade)
    .orderBy(sql`count(*) desc`)

  console.log(`\n── 学段分布 ──────────────────────────────`)
  gradeRows.forEach(r => console.log(`  ${(r.grade ?? '未标注').padEnd(6)} ${r.cnt} 首`))

  // Top 10 themes (unnested from jsonb array)
  const themeRows = await db.execute<{ theme: string; cnt: number }>(sql`
    SELECT theme, count(*)::int AS cnt
    FROM poems, jsonb_array_elements_text(themes) AS theme
    GROUP BY theme
    ORDER BY cnt DESC
    LIMIT 10
  `)

  console.log(`\n── 主题 Top 10 ───────────────────────────`)
  themeRows.forEach(r => console.log(`  ${r.theme.padEnd(10)} ${r.cnt} 首`))

  console.log(`\n──────────────────────────────────────────\n`)
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
