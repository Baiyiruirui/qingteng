import 'dotenv/config'
import postgres from 'postgres'

const EXPECTED_TABLES = ['poems', 'users', 'events', 'conversations', 'messages', 'memories']

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: 'require' })
  const rows = await sql<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `
  const found = rows.map(r => r.tablename)
  const missing = EXPECTED_TABLES.filter(t => !found.includes(t))

  if (missing.length > 0) {
    console.error(`Missing tables: ${missing.join(', ')}`)
    process.exit(1)
  }

  console.log(`All 6 tables exist ✓`)
  console.log(`  Tables: ${found.join(', ')}`)
  await sql.end()
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
