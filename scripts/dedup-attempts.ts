import { db } from '@/db'
import { sql } from 'drizzle-orm'

async function main() {
  // Delete duplicate attempts, keep only the earliest per (sessionId, questionId)
  const result = await db.execute(sql`
    DELETE FROM quiz_attempts
    WHERE id NOT IN (
      SELECT DISTINCT ON (session_id, question_id) id
      FROM quiz_attempts
      ORDER BY session_id, question_id, created_at ASC
    )
  `)
  console.log('Deleted duplicate attempts ✓')

  const total = await db.execute(sql`SELECT count(*) as n FROM quiz_attempts`)
  console.log('Remaining attempts:', (total[0] as { n: string }).n)
}

main().catch(console.error)
