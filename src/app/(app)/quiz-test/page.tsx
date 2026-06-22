'use client'

import { useState } from 'react'

type Question = {
  id: string
  poemId: string
  type: string
  stem: string
  options: string[] | null
  answer: string
  explanation: string
  evidenceLines: string[]
  difficulty: string
  qualityScore: number | null
  evidenceValid: boolean
  promptVersion: string | null
}

const POEMS = [
  { id: 'TANG_001', title: '静夜思' },
  { id: 'TANG_023', title: '九月九日忆山东兄弟' },
  { id: 'TANG_042', title: '登高' },
]

const TYPE_LABEL: Record<string, string> = {
  mcq: '选择题',
  fill: '填空题',
  translate: '翻译题',
  appreciate: '赏析题',
}

export default function QuizTestPage() {
  const [poemId, setPoemId] = useState('TANG_042')
  const [loading, setLoading] = useState(false)
  const [questions, setQuestions] = useState<Question[]>([])
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  async function handleLoad() {
    setLoading(true)
    setError('')
    setQuestions([])
    setExpandedId(null)
    try {
      const res = await fetch(`/api/quiz/list?poemId=${poemId}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error?.message ?? '加载失败')
        return
      }
      setQuestions(data.questions)
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }

  const evidenceValidCount = questions.filter(q => q.evidenceValid).length
  const invalidCount = questions.length - evidenceValidCount

  return (
    <div className="min-h-screen p-8" style={{ background: '#fafaf7', color: '#1a1a1a' }}>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-serif mb-1">出题验证</h1>
        <p className="text-sm mb-8" style={{ color: '#8a8a8a' }}>
          Week 3 Day 3 · 展示预生成题库 · 验证 grounding 效果
        </p>

        {/* Controls */}
        <div className="flex gap-4 items-end mb-6">
          <div>
            <label className="text-xs block mb-1" style={{ color: '#8a8a8a' }}>选诗</label>
            <select
              value={poemId}
              onChange={e => setPoemId(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
              style={{ borderColor: '#d4cfc6', background: '#fff' }}
            >
              {POEMS.map(p => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleLoad}
            disabled={loading}
            className="px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
            style={{ background: '#1a1a1a', color: '#fafaf7' }}
          >
            {loading ? '加载中…' : '加载题库'}
          </button>
        </div>

        {error && <p className="text-sm mb-4" style={{ color: '#c0392b' }}>{error}</p>}

        {/* Stats */}
        {questions.length > 0 && (
          <div className="flex gap-3 mb-6 text-xs">
            <span
              className="px-3 py-1.5 rounded-full"
              style={{ background: '#f5f3ef', color: '#5a5248' }}
            >
              共 {questions.length} 道
            </span>
            <span
              className="px-3 py-1.5 rounded-full"
              style={{ background: '#e8f4f0', color: '#3d8c78' }}
            >
              溯源通过 {evidenceValidCount}
            </span>
            {invalidCount > 0 && (
              <span
                className="px-3 py-1.5 rounded-full"
                style={{ background: '#fde8e8', color: '#c0392b' }}
              >
                溯源失败 {invalidCount}
              </span>
            )}
          </div>
        )}

        {/* Question list */}
        <div className="space-y-2">
          {questions.map(q => (
            <div
              key={q.id}
              className="rounded-2xl overflow-hidden"
              style={{ border: '1px solid #e8e4dc' }}
            >
              {/* Row header */}
              <button
                onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
                style={{ background: expandedId === q.id ? '#f5f3ef' : '#fff' }}
              >
                <span
                  className="text-xs px-2 py-0.5 rounded shrink-0"
                  style={{ background: '#f5f3ef', color: '#5a5248' }}
                >
                  {TYPE_LABEL[q.type] ?? q.type}
                </span>
                <span
                  className="text-xs px-2 py-0.5 rounded shrink-0"
                  style={{ background: '#f5f3ef', color: '#5a5248' }}
                >
                  {q.difficulty}
                </span>
                <span
                  className="text-xs px-2 py-0.5 rounded shrink-0"
                  style={{
                    background: q.evidenceValid ? '#e8f4f0' : '#fde8e8',
                    color: q.evidenceValid ? '#3d8c78' : '#c0392b',
                  }}
                >
                  {q.evidenceValid ? '溯源✓' : '溯源✗'}
                </span>
                {q.qualityScore != null && (
                  <span className="text-xs" style={{ color: '#8a8a8a' }}>
                    Q={Math.round(q.qualityScore * 100)}
                  </span>
                )}
                <span className="text-sm flex-1 line-clamp-1">{q.stem}</span>
                <span className="text-xs ml-auto shrink-0" style={{ color: '#b0a898' }}>
                  {expandedId === q.id ? '▲' : '▼'}
                </span>
              </button>

              {/* Expanded detail */}
              {expandedId === q.id && (
                <div
                  className="px-4 pb-4 space-y-3 border-t"
                  style={{ borderColor: '#ece8e0', background: '#fafaf7' }}
                >
                  {/* Options (mcq) */}
                  {q.options && (
                    <div className="pt-3">
                      <p className="text-xs font-medium mb-1.5" style={{ color: '#8a8a8a' }}>选项</p>
                      <div className="space-y-1.5">
                        {q.options.map((opt, i) => (
                          <div
                            key={i}
                            className="flex gap-2 text-sm px-3 py-2 rounded-lg"
                            style={{
                              background: opt === q.answer ? '#e8f4f0' : '#f5f3ef',
                              border: `1px solid ${opt === q.answer ? '#3d8c78' : 'transparent'}`,
                            }}
                          >
                            <span className="font-medium" style={{ color: '#5e8b7e' }}>
                              {String.fromCharCode(65 + i)}.
                            </span>
                            <span>{opt}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Answer */}
                  <div className={q.options ? '' : 'pt-3'}>
                    <p className="text-xs font-medium mb-1" style={{ color: '#8a8a8a' }}>答案</p>
                    <p className="text-sm leading-relaxed font-medium" style={{ color: '#5e8b7e' }}>
                      {q.answer}
                    </p>
                  </div>

                  {/* Explanation */}
                  <div>
                    <p className="text-xs font-medium mb-1" style={{ color: '#8a8a8a' }}>解析</p>
                    <p className="text-sm leading-relaxed">{q.explanation}</p>
                  </div>

                  {/* evidenceLines */}
                  <div>
                    <p className="text-xs font-medium mb-1" style={{ color: '#8a8a8a' }}>
                      依据原文（evidenceLines）
                    </p>
                    <div className="space-y-1">
                      {q.evidenceLines.map((line, i) => (
                        <p
                          key={i}
                          className="text-sm font-serif px-3 py-1.5 rounded-lg"
                          style={{ background: '#f0ede7', color: '#3a3028' }}
                        >
                          {line}
                        </p>
                      ))}
                    </div>
                  </div>

                  <p className="text-xs" style={{ color: '#c0b8aa' }}>
                    id: {q.id} · {q.promptVersion}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        {questions.length === 0 && !loading && !error && (
          <p className="text-sm text-center py-12" style={{ color: '#c0b8aa' }}>
            先运行预生成脚本：<code>pnpm pregenerate:quiz</code>，再点加载
          </p>
        )}
      </div>
    </div>
  )
}
