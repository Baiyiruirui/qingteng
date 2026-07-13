import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { db } from '@/db'
import { quizBlueprints, quizQuestions } from '@/db/schema'
import { inArray, sql } from 'drizzle-orm'
import { isDemoReadyQuestion } from '@/ai/quiz/quality'
import {
  REPRESENTATIVE_QUIZ_POEM_IDS,
  REPRESENTATIVE_QUIZ_TARGET,
  REPRESENTATIVE_V2_MAX_QUESTIONS,
  REPRESENTATIVE_V2_MIN_QUESTIONS,
} from '@/ai/quiz/representative-set'

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
  const representativeIds = [...REPRESENTATIVE_QUIZ_POEM_IDS]

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

  if (v2EvidenceValid === v2Questions) ok('v2 quiz evidence', `${v2EvidenceValid}/${v2Questions} evidenceValid`)
  else {
    fail('v2 quiz evidence', `${v2EvidenceValid}/${v2Questions} evidenceValid`)
    failures++
  }

  const [representativeBlueprints, representativeQuestions] = await Promise.all([
    db
      .select({ poemId: quizBlueprints.poemId })
      .from(quizBlueprints)
      .where(inArray(quizBlueprints.poemId, representativeIds)),
    db
      .select()
      .from(quizQuestions)
      .where(inArray(quizQuestions.poemId, representativeIds)),
  ])
  const representativeV2 = representativeQuestions.filter(question => question.version === 'v2')
  const representativeReady = representativeV2.filter(isDemoReadyQuestion)
  const representativeReadyPoems = new Set(representativeReady.map(question => question.poemId))

  if (representativeBlueprints.length === REPRESENTATIVE_QUIZ_TARGET) {
    ok('representative blueprints', `${representativeBlueprints.length}/${REPRESENTATIVE_QUIZ_TARGET}`)
  } else {
    fail('representative blueprints', `${representativeBlueprints.length}/${REPRESENTATIVE_QUIZ_TARGET}`)
    failures++
  }

  if (
    representativeReady.length >= REPRESENTATIVE_V2_MIN_QUESTIONS
    && representativeReady.length <= REPRESENTATIVE_V2_MAX_QUESTIONS
  ) {
    ok(
      'representative quiz depth',
      `${representativeReady.length} demo-ready questions across ${representativeReadyPoems.size} poems`,
    )
  } else {
    fail(
      'representative quiz depth',
      `${representativeReady.length}; expected ${REPRESENTATIVE_V2_MIN_QUESTIONS}-${REPRESENTATIVE_V2_MAX_QUESTIONS}`,
    )
    failures++
  }

  if (representativeReadyPoems.size === REPRESENTATIVE_QUIZ_TARGET) {
    ok('representative poem coverage', `${representativeReadyPoems.size}/${REPRESENTATIVE_QUIZ_TARGET}`)
  } else {
    fail('representative poem coverage', `${representativeReadyPoems.size}/${REPRESENTATIVE_QUIZ_TARGET}`)
    failures++
  }

  if (representativeReady.length === representativeV2.length) {
    ok('representative runtime quality gate', `${representativeReady.length}/${representativeV2.length}`)
  } else {
    fail(
      'representative runtime quality gate',
      `${representativeReady.length}/${representativeV2.length} v2 questions are demo-ready`,
    )
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
  info(
    'adaptive quiz depth',
    `${representativeReady.length} demo-ready v2 questions across ${representativeReadyPoems.size} representative poems`,
  )
  info('full-library quiz backlog', `${v2Questions} total v2 questions across ${asNumber(coverage.v2Poems)} poems`)
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
