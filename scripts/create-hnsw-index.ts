import postgres from 'postgres'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const sql = postgres(process.env.DATABASE_URL!, { max: 1 })

async function main() {
  await sql`
    CREATE INDEX IF NOT EXISTS memories_embedding_idx
    ON memories USING hnsw (embedding vector_cosine_ops)
  `
  console.log('✅ HNSW index created on memories.embedding')
  await sql.end()
}

main().catch(e => {
  console.error('❌', e.message)
  process.exit(1)
})
