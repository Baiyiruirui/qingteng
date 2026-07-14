import { NextResponse } from 'next/server'
import { asc } from 'drizzle-orm'
import { getSession } from '@/lib/auth-server'
import { db } from '@/db'
import { immersionScripts, poems } from '@/db/schema'
import { semanticPoemSearch, type PoemSearchResult } from '@/ai/poems/search'
import {
  checkRateLimits,
  PUBLIC_AI_BUDGET_POLICIES,
  rateLimitResponse,
} from '@/lib/rate-limit'

export const runtime = 'nodejs'

type PoemRow = {
  id: string
  title: string
  author: string
  dynasty: string | null
  grade: string | null
  themes: string[]
  imagery: string[]
  rhetoric: string[]
  lineText: string
}

function keywordMatchReason(query: string, poem: PoemRow): string | null {
  if (poem.title.includes(query)) return '标题命中'
  if (poem.author.includes(query)) return '作者命中'
  if ((poem.dynasty ?? '').includes(query)) return '朝代命中'

  const tag = [...poem.themes, ...poem.imagery, ...poem.rhetoric]
    .find(item => item.includes(query) || query.includes(item))
  if (tag) return `标签命中：${tag}`
  if (poem.lineText.includes(query)) return '原文命中'
  return null
}

function scoreKeyword(reason: string): number {
  if (reason === '标题命中') return 5
  if (reason === '作者命中') return 4
  if (reason === '朝代命中') return 2
  if (reason.startsWith('标签命中')) return 3
  return 1
}

function toResult(poem: PoemRow, matchReason: string, similarity: number | null): PoemSearchResult {
  return {
    id: poem.id,
    title: poem.title,
    author: poem.author,
    dynasty: poem.dynasty,
    grade: poem.grade,
    themes: poem.themes,
    imagery: poem.imagery,
    rhetoric: poem.rhetoric,
    similarity,
    matchReason,
  }
}

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const query = (searchParams.get('q') ?? '').trim()
  const dynasty = (searchParams.get('dynasty') ?? '').trim()
  const requestedLimit = Number.parseInt(searchParams.get('limit') ?? '48', 10)
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, 80)
    : 48

  if (query.length > 120) {
    return NextResponse.json({ error: '搜索内容不能超过 120 字' }, { status: 400 })
  }

  if (query) {
    const rateLimit = await checkRateLimits({
      req,
      userId: session.userId,
      policies: [
        ...PUBLIC_AI_BUDGET_POLICIES,
        { scope: 'poem-search-user-minute', identity: 'user', limit: 12, windowSeconds: 60 },
      ],
    })
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit, { errorShape: 'string' })
    }
  }

  const [poemRows, scripts] = await Promise.all([
    db
      .select({
        id: poems.id,
        title: poems.title,
        author: poems.author,
        dynasty: poems.dynasty,
        grade: poems.grade,
        themes: poems.themes,
        imagery: poems.imagery,
        rhetoric: poems.rhetoric,
        lines: poems.lines,
      })
      .from(poems)
      .orderBy(asc(poems.id)),
    db.select({ poemId: immersionScripts.poemId }).from(immersionScripts),
  ])

  const scriptPoemIds = new Set(scripts.map(script => script.poemId))
  const allPoems: PoemRow[] = poemRows
    .map(poem => ({
      id: poem.id,
      title: poem.title,
      author: poem.author,
      dynasty: poem.dynasty,
      grade: poem.grade,
      themes: poem.themes ?? [],
      imagery: poem.imagery ?? [],
      rhetoric: poem.rhetoric ?? [],
      lineText: poem.lines.map(line => line.content).join(''),
    }))
    .filter(poem => !dynasty || poem.dynasty === dynasty)

  if (!query) {
    return NextResponse.json({
      mode: 'browse',
      poems: allPoems.map(poem => ({
        ...toResult(poem, '全部诗笺', null),
        hasScript: scriptPoemIds.has(poem.id),
      })),
    })
  }

  const keywordResults = allPoems
    .map(poem => {
      const reason = keywordMatchReason(query, poem)
      return reason ? { poem, reason, score: scoreKeyword(reason) } : null
    })
    .filter((item): item is { poem: PoemRow; reason: string; score: number } => Boolean(item))
    .sort((a, b) => b.score - a.score || a.poem.id.localeCompare(b.poem.id))

  let semanticResults: PoemSearchResult[] = []
  let semanticError: string | null = null
  try {
    semanticResults = (await semanticPoemSearch(query, limit))
      .filter(poem => !dynasty || poem.dynasty === dynasty)
  } catch (error) {
    console.error('[poem search] semantic search failed:', error)
    semanticError = '语义搜索暂时不可用，已回退关键词搜索'
  }

  const merged = new Map<string, PoemSearchResult & { keywordScore: number; hasScript: boolean }>()
  for (const item of keywordResults) {
    merged.set(item.poem.id, {
      ...toResult(item.poem, item.reason, null),
      keywordScore: item.score,
      hasScript: scriptPoemIds.has(item.poem.id),
    })
  }
  for (const poem of semanticResults) {
    const existing = merged.get(poem.id)
    if (existing) {
      merged.set(poem.id, {
        ...existing,
        similarity: poem.similarity,
        matchReason: `${existing.matchReason} + ${poem.matchReason}`,
      })
    } else {
      merged.set(poem.id, {
        ...poem,
        keywordScore: 0,
        hasScript: scriptPoemIds.has(poem.id),
      })
    }
  }

  const poemsOut = [...merged.values()]
    .sort((a, b) => {
      if (b.keywordScore !== a.keywordScore) return b.keywordScore - a.keywordScore
      return (b.similarity ?? 0) - (a.similarity ?? 0)
    })
    .slice(0, limit)

  return NextResponse.json({
    mode: semanticError ? 'keyword-fallback' : 'hybrid',
    semanticError,
    poems: poemsOut,
  })
}
