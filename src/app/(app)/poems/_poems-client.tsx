'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { inkFadeIn, inkFadeInStagger } from '@/lib/motion'
import { ShanshuiBanner } from '@/components/ShanshuiBanner'
import { AppNav } from '@/components/AppNav'
import { REPRESENTATIVE_QUIZ_POEM_IDS } from '@/ai/quiz/representative-set'

const QUIZ_POEM_IDS = new Set<string>(REPRESENTATIVE_QUIZ_POEM_IDS)

type Poem = {
  id: string
  title: string
  author: string
  dynasty: string | null
  grade: string | null
  hasScript: boolean
  similarity?: number | null
  matchReason?: string
}

type Props = {
  userName: string
  poems: Poem[]
}

export default function PoemsClient({ userName, poems }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [dynasty, setDynasty] = useState<string | null>(null)
  const [results, setResults] = useState<Poem[]>(poems)
  const [searching, setSearching] = useState(false)
  const [searchMode, setSearchMode] = useState<'browse' | 'hybrid' | 'keyword-fallback'>('browse')

  // 朝代筛选轴：从数据动态派生，保持诗库出现顺序
  const dynasties = useMemo(() => {
    const seen: string[] = []
    for (const p of poems) {
      if (p.dynasty && !seen.includes(p.dynasty)) seen.push(p.dynasty)
    }
    return seen
  }, [poems])

  async function startMode(mode: 'roleplay', poemId: string) {
    const key = `${mode}-${poemId}`
    if (loading) return
    setLoading(key)
    try {
      const res = await fetch('/api/conversations/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, poemId }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error?.message ?? '出了点问题，请稍后再试')
        return
      }
      router.push(`/session/${data.conversationId}`)
    } catch {
      alert('网络错误，请稍后再试')
    } finally {
      setLoading(null)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [query])

  const q = debouncedQuery
  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (dynasty) params.set('dynasty', dynasty)
    params.set('limit', '48')

    setSearching(true)
    fetch(`/api/poems/search?${params.toString()}`, { signal: controller.signal })
      .then(async res => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? '搜索失败')
        setResults(data.poems)
        setSearchMode(data.mode)
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setResults(poems.filter(p => {
          const matchQuery =
            !q ||
            p.title.includes(q) ||
            p.author.includes(q) ||
            (p.dynasty ?? '').includes(q)
          const matchDynasty = !dynasty || p.dynasty === dynasty
          return matchQuery && matchDynasty
        }))
        setSearchMode('keyword-fallback')
      })
      .finally(() => {
        if (!controller.signal.aborted) setSearching(false)
      })

    return () => controller.abort()
  }, [dynasty, poems, q])

  const filtered = results

  return (
    <div className="relative min-h-screen bg-paper text-ink">
      <AppNav title="诗笺地图" userName={userName} />

      {/* 山水页眉横幅 */}
      <ShanshuiBanner />

      <main className="relative z-10 mx-auto -mt-10 max-w-5xl px-4 pb-8">
        {/* 搜索栏（对标登录页 InkField） */}
        <div className="mb-5 flex items-center gap-3">
          <label className="group relative flex-1">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              maxLength={120}
              placeholder="想读点什么？试试「孤独」「送别」或诗人名字"
              className="w-full rounded-lg border border-edge bg-paper/60 px-4 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint/70 focus:border-jade focus:bg-paper"
            />
            <span className="pointer-events-none absolute -bottom-px left-1/2 h-px w-0 -translate-x-1/2 bg-jade transition-all duration-300 group-focus-within:w-[calc(100%-16px)]" />
          </label>
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-xs text-ink-faint transition-colors hover:text-ink"
            >
              清空
            </button>
          )}
        </div>

        {/* 朝代筛选条 */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <FilterChip active={dynasty === null} onClick={() => setDynasty(null)}>
            全部
          </FilterChip>
          {dynasties.map(d => (
            <FilterChip key={d} active={dynasty === d} onClick={() => setDynasty(d)}>
              {d}
            </FilterChip>
          ))}
        </div>

        <p className="mb-6 text-xs text-ink-faint">
          {searching
            ? '青藤正在翻诗笺…'
            : q || dynasty
              ? `找到 ${filtered.length} 首 · ${searchMode === 'hybrid' ? '语义 + 关键词混合检索' : '关键词检索'}`
              : `共 ${poems.length} 张诗笺 · 标注「可沉浸」的诗支持角色扮演模式`}
        </p>

        {/* 空状态 */}
        {filtered.length === 0 && (
          <motion.div
            variants={inkFadeIn}
            initial="hidden"
            animate="visible"
            className="py-24 text-center"
          >
            <p className="font-serif text-lg tracking-widest text-ink-faint">未寻得此诗</p>
            <p className="mt-2 text-sm text-ink-faint opacity-60">换个词试试？</p>
          </motion.div>
        )}

        {/* 诗卡片网格 */}
        <motion.div
          key={`${q}-${dynasty ?? 'all'}`}
          variants={inkFadeInStagger}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {filtered.map(poem => (
            <motion.div
              key={poem.id}
              variants={inkFadeIn}
              className="group flex flex-col rounded-xl border border-edge/60 bg-white/60 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-edge hover:bg-white/80 hover:shadow-[0_12px_30px_-18px_rgba(46,58,52,0.35)]"
            >
              {/* 诗信息 */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-serif text-lg text-ink">{poem.title}</span>
                  {poem.hasScript && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-xs"
                      style={{
                        background: 'var(--color-tag-immersive-bg)',
                        color: 'var(--color-tag-immersive-text)',
                      }}
                    >
                      可沉浸
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-ink-faint">
                  {poem.dynasty ?? ''} · {poem.author}
                  {poem.grade ? ` · ${poem.grade}` : ''}
                </p>
                {(q || dynasty) && poem.matchReason && (
                  <p className="mt-3 text-xs leading-5 text-ink-mid">
                    {poem.matchReason}
                    {poem.similarity !== null && poem.similarity !== undefined
                      ? ` · 相似度 ${Math.round(poem.similarity * 100)}%`
                      : ''}
                  </p>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Link
                  href={`/recite/${poem.id}`}
                  className="rounded-lg border border-edge bg-paper/70 px-3 py-1.5 text-xs font-medium text-ink-mid transition-colors hover:bg-paper-block hover:text-ink"
                >
                  朗读
                </Link>
                {QUIZ_POEM_IDS.has(poem.id) && (
                  <Link
                    href={`/quiz/${poem.id}`}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-80"
                    style={{ background: 'var(--qt-earth)' }}
                  >
                    青藤考你
                  </Link>
                )}
                {poem.hasScript ? (
                  <button
                    onClick={() => startMode('roleplay', poem.id)}
                    disabled={loading !== null}
                    className="rounded-lg bg-jade px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-40"
                  >
                    {loading === `roleplay-${poem.id}` ? '进入中…' : '进入沉浸'}
                  </button>
                ) : (
                  <span className="rounded-lg bg-paper-block px-3 py-1.5 text-xs text-ink-faint">
                    沉浸敬请期待
                  </span>
                )}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </main>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? 'rounded-full border border-jade bg-jade px-3.5 py-1 text-xs font-medium text-white transition-colors'
          : 'rounded-full border border-edge bg-paper/60 px-3.5 py-1 text-xs text-ink-mid transition-colors hover:border-jade/60 hover:text-ink'
      }
    >
      {children}
    </button>
  )
}
