'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

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
        alert(data.error?.message ?? '出了点问题,请稍后再试')
        return
      }
      router.push(`/session/${data.conversationId}`)
    } catch {
      alert('网络错误,请稍后再试')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: '#fafaf7', color: '#1a1a1a' }}>
      {/* Header */}
      <header
        className="flex items-center justify-between px-6 py-5 border-b"
        style={{ borderColor: '#e8e4dc' }}
      >
        <Link
          href="/chat"
          className="text-sm"
          style={{ color: '#8a8a8a' }}
        >
          ← 返回对话
        </Link>
        <h1 className="text-2xl font-serif tracking-widest">诗库</h1>
        <span className="text-sm" style={{ color: '#8a8a8a' }}>
          你好,{userName}
        </span>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-sm mb-8" style={{ color: '#8a8a8a' }}>
          共 {poems.length} 首 · 标注「可沉浸」的诗支持角色扮演模式
        </p>

        <div className="space-y-3">
          {poems.map(poem => (
            <div
              key={poem.id}
              className="flex items-center justify-between py-4 px-5 rounded-xl border"
              style={{ borderColor: '#e8e4dc', background: '#fff' }}
            >
              {/* Poem info */}
              <div className="flex items-center gap-4 min-w-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-serif text-base">{poem.title}</span>
                    {poem.hasScript && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded-full"
                        style={{ background: '#e8f4f0', color: '#3d8c78' }}
                      >
                        可沉浸
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: '#8a8a8a' }}>
                    {poem.dynasty ?? ''} · {poem.author}
                    {poem.grade ? ` · ${poem.grade}` : ''}
                  </p>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                {poem.hasScript ? (
                  <button
                    onClick={() => startMode('roleplay', poem.id)}
                    disabled={loading !== null}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium transition-opacity disabled:opacity-40"
                    style={{ background: '#5e8b7e', color: '#fff' }}
                  >
                    {loading === `roleplay-${poem.id}` ? '进入中…' : '进入沉浸'}
                  </button>
                ) : (
                  <span
                    className="text-xs px-3 py-1.5 rounded-lg"
                    style={{ background: '#f5f3ef', color: '#b0aba4' }}
                  >
                    沉浸模式敬请期待
                  </span>
                )}
                <button
                  onClick={() => startMode('creative', poem.id)}
                  disabled={loading !== null}
                  className="text-xs px-3 py-1.5 rounded-lg border font-medium transition-opacity disabled:opacity-40"
                  style={{ borderColor: '#d4cfc6', color: '#5a5a5a', background: 'transparent' }}
                >
                  {loading === `creative-${poem.id}` ? '进入中…' : '一起写诗'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
