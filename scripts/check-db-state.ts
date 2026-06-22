import { db } from '@/db'
import { sql } from 'drizzle-orm'

async function main() {
  const dupes = await db.execute(sql`
    SELECT session_id, question_id, count(*) as cnt
    FROM quiz_attempts
    GROUP BY session_id, question_id
    HAVING count(*) > 1
  `)
  console.log('Duplicate session+question pairs:', dupes.length)
  if (dupes.length > 0) console.log(dupes.slice(0, 5))

  const total = await db.execute(sql`SELECT count(*) as n FROM quiz_attempts`)
  console.log('Total attempts:', (total[0] as { n: string }).n)

  const wq = await db.execute(sql`SELECT count(*) as n, max(wrong_count) as max_wc FROM wrong_questions`)
  console.log('Wrong questions:', (wq[0] as { n: string; max_wc: string }).n, '| max wrongCount:', (wq[0] as { n: string; max_wc: string }).max_wc)

  // Reset inflated wrong counts caused by duplicate submissions
  await db.execute(sql`UPDATE wrong_questions SET wrong_count = 1 WHERE wrong_count > 3`)
  console.log('Reset inflated wrongCount (>3) to 1 ✓')
}

main().catch(console.error)
