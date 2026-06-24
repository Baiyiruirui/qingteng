'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { SealStamp } from '@/components/SealStamp'
import { inkFadeIn, inkFadeInStagger } from '@/lib/motion'

const QUIZ_POEM_IDS = new Set(['TANG_001', 'TANG_023', 'TANG_042'])

type Poem = {
  id: string
  title: string
  author: string
  dynasty: string | null
  grade: string | null
  hasScript: boolean
}

type Props = {
  userName: string
  poems: Poem[]
}

export default function PoemsClient({ userName, poems }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  async function startMode(mode: 'roleplay' | 'creative', poemId: string) {
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

  const filtered = query.trim()
    ? poems.filter(
        p =>
          p.title.includes(query.trim()) ||
          p.author.includes(query.trim()) ||
          (p.dynasty ?? '').includes(query.trim()),
      )
    : poems

  return (
    <div className="min-h-screen bg-qt-paper text-qt-ink">
      {/* Header */}
      <header
        className="flex items-center justify-between px-6 py-5 border-b border-qt-border"
        style={{ background: 'rgba(247,244,236,0.92)', backdropFilter: 'blur(8px)', position: 'sticky', top: 0, zIndex: 10 }}
      >
        <Link href="/chat" className="text-sm text-qt-ink-light hover:text-qt-ink transition-colors">
          ← 对话
        </Link>
        <h1 className="font-serif text-2xl tracking-[0.18em] text-qt-ink">诗库</h1>
        <span className="text-sm text-qt-ink-light">你好，{userName}</span>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {/* 搜索栏 */}
        <div className="mb-6 flex items-center gap-3">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="搜题目、作者、朝代…"
            className="flex-1 rounded-lg border border-qt-border bg-qt-paper-alt px-4 py-2.5 text-sm text-qt-ink placeholder:text-qt-ink-light outline-none focus:border-qt-green transition-colors"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-xs text-qt-ink-light hover:text-qt-ink transition-colors"
            >
              清空
            </button>
          )}
        </div>

        <p className="text-xs text-qt-ink-light mb-6">
          {query
            ? `找到 ${filtered.length} 首`
            : `共 ${poems.length} 首 · 标注「可沉浸」的诗支持角色扮演模式`}
        </p>

        {/* 空状态 */}
        {filtered.length === 0 && (
          <motion.div
            variants={inkFadeIn}
            initial="hidden"
            animate="visible"
            className="text-center py-24"
          >
            <p className="font-serif text-qt-ink-light tracking-widest text-lg">
              未寻得此诗
            </p>
            <p className="text-sm text-qt-ink-light opacity-60 mt-2">
              换个词试试？
            </p>
          </motion.div>
        )}

        {/* 诗列表 */}
        <motion.div
          variants={inkFadeInStagger}
          initial="hidden"
          animate="visible"
          className="space-y-2.5"
        >
          {filtered.map(poem => (
            <motion.div
              key={poem.id}
              variants={inkFadeIn}
              className="flex items-center justify-between py-4 px-5 rounded-xl border border-qt-border"
              style={{ background: 'rgba(255,255,255,0.6)' }}
            >
              {/* 诗信息 */}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-serif text-base text-qt-ink">{poem.title}</span>
                  {poem.hasScript && (
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-full"
                      style={{ background: 'var(--color-tag-immersive-bg)', color: 'var(--color-tag-immersive-text)' }}
                    >
                      可沉浸
                    </span>
                  )}
                </div>
                <p className="text-xs mt-0.5 text-qt-ink-light">
                  {poem.dynasty ?? ''} · {poem.author}
                  {poem.grade ? ` · ${poem.grade}` : ''}
                </p>
              </div>

              {/* 操作按钮 */}
              <div className="flex items-center gap-2 shrink-0 ml-4">
                {QUIZ_POEM_IDS.has(poem.id) && (
                  <Link
                    href={`/quiz/${poem.id}`}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium transition-opacity hover:opacity-80"
                    style={{ background: 'var(--qt-earth)', color: '#fff' }}
                  >
                    青藤考你
                  </Link>
                )}
                {poem.hasScript ? (
                  <button
                    onClick={() => startMode('roleplay', poem.id)}
                    disabled={loading !== null}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium transition-opacity disabled:opacity-40 hover:opacity-80"
                    style={{ background: 'var(--qt-green)', color: '#fff' }}
                  >
                    {loading === `roleplay-${poem.id}` ? '进入中…' : '进入沉浸'}
                  </button>
                ) : (
                  <span
                    className="text-xs px-3 py-1.5 rounded-lg text-qt-ink-light"
                    style={{ background: 'var(--qt-paper-alt)' }}
                  >
                    沉浸敬请期待
                  </span>
                )}
                <button
                  onClick={() => startMode('creative', poem.id)}
                  disabled={loading !== null}
                  className="text-xs px-3 py-1.5 rounded-lg border border-qt-border text-qt-ink-mid font-medium transition-opacity disabled:opacity-40 hover:opacity-70"
                  style={{ background: 'transparent' }}
                >
                  {loading === `creative-${poem.id}` ? '进入中…' : '一起写诗'}
                </button>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </main>
    </div>
  )
}
