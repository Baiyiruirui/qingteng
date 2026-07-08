import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { db } from '@/db'
import { sql } from 'drizzle-orm'

type CoverageRow = {
  poems: number
  poemsWithLines: number
  embeddings: number
  immersionScripts: number
  quizBlueprints: number
  v2Questions: number
  v2Poems: number
  v2EvidenceValid: number
  reciteEvents: number
}

type IssueRow = Record<string, unknown>

const EXPECTED_POEMS = 140
const EXPECTED_V2_QUESTIONS = 20

function asNumber(value: unknown) {
  return Number(value ?? 0)
}

function ok(label: string, detail: string) {
  console.log(`[OK] ${label}: ${detail}`)
}

function fail(label: string, detail: string) {
  console.log(`[FAIL] ${label}: ${detail}`)
}

function info(label: string, detail: string) {
  console.log(`[INFO] ${label}: ${detail}`)
}

async function verifySourceFiles() {
  const dir = join(process.cwd(), 'data', 'poems')
  const files = (await readdir(dir)).filter(file => file.endsWith('.json')).sort()
  const issues: string[] = []
  const ids = new Set<string>()

  for (const file of files) {
    const raw = await readFile(join(dir, file), 'utf-8')
    const poem = JSON.parse(raw) as {
      poem_id?: string
      title?: string
      author?: string
      dynasty?: string
      lines?: unknown[]
    }

    if (!poem.poem_id) issues.push(`${file}: missing poem_id`)
    if (poem.poem_id && ids.has(poem.poem_id)) issues.push(`${file}: duplicate poem_id ${poem.poem_id}`)
    if (poem.poem_id) ids.add(poem.poem_id)

    if (!poem.title) issues.push(`${file}: missing title`)
    if (!poem.author) issues.push(`${file}: missing author`)
    if (!poem.dynasty) issues.push(`${file}: missing dynasty`)
    if (poem.dynasty && !/^[\u4e00-\u9fff]+$/.test(poem.dynasty)) {
      issues.push(`${file}: non-Chinese dynasty "${poem.dynasty}"`)
    }
    if (!Array.isArray(poem.lines) || poem.lines.length === 0) {
      issues.push(`${file}: missing lines`)
    }
  }

  return { files: files.length, issues }
}

async function main() {
  console.log('\n-- Qingteng data readiness check --\n')

  let failures = 0

  const source = await verifySourceFiles()
  if (source.files === EXPECTED_POEMS) ok('source poems', `${source.files}/${EXPECTED_POEMS}`)
  else {
    fail('source poems', `${source.files}/${EXPECTED_POEMS}`)
    failures++
  }

  if (source.issues.length === 0) ok('source consistency', 'no malformed poem JSON found')
  else {
    fail('source consistency', `${source.issues.length} issue(s)`)
    source.issues.slice(0, 10).forEach(issue => console.log(`  - ${issue}`))
    failures += source.issues.length
  }

  const [coverage] = await db.execute<CoverageRow>(sql`
    SELECT
      (SELECT count(*)::int FROM poems) AS "poems",
      (SELECT count(*)::int FROM poems WHERE jsonb_array_length(lines) > 0) AS "poemsWithLines",
      (SELECT count(*)::int FROM poem_embeddings) AS "embeddings",
      (SELECT count(*)::int FROM immersion_scripts) AS "immersionScripts",
      (SELECT count(*)::int FROM quiz_blueprints) AS "quizBlueprints",
      (SELECT count(*)::int FROM quiz_questions WHERE version = 'v2') AS "v2Questions",
      (SELECT count(DISTINCT poem_id)::int FROM quiz_questions WHERE version = 'v2') AS "v2Poems",
      (SELECT count(*)::int FROM quiz_questions WHERE version = 'v2' AND evidence_valid = true) AS "v2EvidenceValid",
      (SELECT count(*)::int FROM events WHERE type = 'recite') AS "reciteEvents"
  `)

  const dbPoems = asNumber(coverage.poems)
  const dbPoemsWithLines = asNumber(coverage.poemsWithLines)
  const embeddings = asNumber(coverage.embeddings)
  const v2Questions = asNumber(coverage.v2Questions)
  const v2EvidenceValid = asNumber(coverage.v2EvidenceValid)

  if (dbPoems === EXPECTED_POEMS) ok('db poems', `${dbPoems}/${EXPECTED_POEMS}`)
  else {
    fail('db poems', `${dbPoems}/${EXPECTED_POEMS}`)
    failures++
  }

  if (dbPoemsWithLines === EXPECTED_POEMS) ok('db poem lines', `${dbPoemsWithLines}/${EXPECTED_POEMS}`)
  else {
    fail('db poem lines', `${dbPoemsWithLines}/${EXPECTED_POEMS}`)
    failures++
  }

  if (embeddings === EXPECTED_POEMS) ok('poem embeddings', `${embeddings}/${EXPECTED_POEMS}`)
  else {
    fail('poem embeddings', `${embeddings}/${EXPECTED_POEMS}`)
    failures++
  }

  const missingEmbeddings = await db.execute<IssueRow>(sql`
    SELECT p.id, p.title
    FROM poems p
    LEFT JOIN poem_embeddings e ON e.poem_id = p.id
    WHERE e.poem_id IS NULL
    ORDER BY p.id
  `)

  if (missingEmbeddings.length === 0) ok('embedding coverage', 'no missing poem embeddings')
  else {
    fail('embedding coverage', `${missingEmbeddings.length} missing`)
    console.log(JSON.stringify(missingEmbeddings.slice(0, 10), null, 2))
    failures += missingEmbeddings.length
  }

  const nonChineseDynasties = await db.execute<IssueRow>(sql`
    SELECT id, title, author, dynasty
    FROM poems
    WHERE dynasty IS NULL OR dynasty !~ '^[\\u4e00-\\u9fff]+$'
    ORDER BY id
  `)

  if (nonChineseDynasties.length === 0) ok('db dynasty values', 'all dynasty values are Chinese')
  else {
    fail('db dynasty values', `${nonChineseDynasties.length} issue(s)`)
    console.log(JSON.stringify(nonChineseDynasties, null, 2))
    failures += nonChineseDynasties.length
  }

  if (v2Questions === EXPECTED_V2_QUESTIONS) ok('v2 quiz count', `${v2Questions}/${EXPECTED_V2_QUESTIONS}`)
  else {
    fail('v2 quiz count', `${v2Questions}/${EXPECTED_V2_QUESTIONS}`)
    failures++
  }

  if (v2EvidenceValid === v2Questions) ok('v2 quiz evidence', `${v2EvidenceValid}/${v2Questions} evidenceValid`)
  else {
    fail('v2 quiz evidence', `${v2EvidenceValid}/${v2Questions} evidenceValid`)
    failures++
  }

  const [indexRow] = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE indexname = 'poem_embeddings_embedding_idx'
    ) AS "exists"
  `)

  if (indexRow.exists) ok('semantic search index', 'poem_embeddings_embedding_idx exists')
  else {
    fail('semantic search index', 'poem_embeddings_embedding_idx missing')
    failures++
  }

  console.log('\n-- Product coverage statement --')
  info('base content', `${dbPoems} poems with structured lines`)
  info('semantic search', `${embeddings} poem embeddings`)
  info('immersion depth', `${asNumber(coverage.immersionScripts)} curated scripts`)
  info('adaptive quiz depth', `${v2Questions} v2 questions across ${asNumber(coverage.v2Poems)} poems`)
  info('recite signal', `${asNumber(coverage.reciteEvents)} recite event(s) recorded`)

  if (failures > 0) {
    console.log(`\nData readiness failed with ${failures} issue(s).\n`)
    process.exit(1)
  }

  console.log('\nData readiness passed.\n')
  process.exit(0)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
