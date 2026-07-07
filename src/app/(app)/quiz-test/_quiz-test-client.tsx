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
  version: string
  pointType: string | null
  pointId: string | null
  promptVersion: string | null
}

const POEMS = [
  { id: 'TANG_001', title: '静夜思' },
  { id: 'TANG_023', title: '九月九日忆山东兄弟' },
  { id: 'TANG_042', title: '登高' },
]

const FORM_LABEL: Record<string, string> = {
  mcq: '选择题',
  fill: '填空题',
  translate: '翻译题',
  appreciate: '赏析题',
}

const POINT_COLORS: Record<string, string> = {
  默写: '#dbeafe',
  炼字: '#fef9c3',
  画面: '#dcfce7',
  意象: '#f3e8ff',
  手法: '#ffedd5',
  情感: '#ffe4e6',
  翻译: '#e0f2fe',
  综合选择: '#f1f5f9',
}

export default function QuizTestClient() {
  const [poemId, setPoemId] = useState('TANG_042')
  const [showVersion, setShowVersion] = useState<'v2' | 'v1' | 'all'>('v2')
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

  const filtered = questions.filter(q =>
    showVersion === 'all' ? true : q.version === showVersion,
  )

  const v2 = questions.filter(q => q.version === 'v2')
  const v2Valid = v2.filter(q => q.evidenceValid).length
  const v2PointTypes = [...new Set(v2.map(q => q.pointType).filter(Boolean))]

  return (
    <div className="min-h-screen p-8" style={{ background: '#fafaf7', color: '#1a1a1a' }}>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-serif mb-1">出题验证 · 蓝图版</h1>
        <p className="text-sm mb-8" style={{ color: '#8a8a8a' }}>
          Week 3 Day 3 修订 · 考点蓝图驱动 · 验证覆盖度与防幻觉
        </p>

        {/* Controls */}
        <div className="flex gap-4 items-end flex-wrap mb-6">
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
          <div>
            <label className="text-xs block mb-1" style={{ color: '#8a8a8a' }}>版本</label>
            <select
              value={showVersion}
              onChange={e => setShowVersion(e.target.value as 'v2' | 'v1' | 'all')}
              className="border rounded-lg px-3 py-2 text-sm"
              style={{ borderColor: '#d4cfc6', background: '#fff' }}
            >
              <option value="v2">v2（蓝图）</option>
              <option value="v1">v1（旧版对比）</option>
              <option value="all">全部</option>
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

        {/* v2 Stats */}
        {v2.length > 0 && (
          <div
            className="rounded-xl px-4 py-3 mb-6 text-xs space-y-1.5"
            style={{ background: '#fff', border: '1px solid #e8e4dc' }}
          >
            <p className="font-medium text-sm">v2 蓝图题目统计</p>
            <div className="flex gap-3 flex-wrap">
              <span style={{ color: '#5a5248' }}>共 {v2.length} 道</span>
              <span style={{ color: '#3d8c78' }}>溯源通过 {v2Valid}/{v2.length}（{Math.round(v2Valid / v2.length * 100)}%）</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              <span style={{ color: '#8a8a8a' }}>考点覆盖：</span>
              {v2PointTypes.map(pt => (
                <span
                  key={pt}
                  className="px-2 py-0.5 rounded"
                  style={{ background: POINT_COLORS[pt!] ?? '#f5f3ef', color: '#3a3028' }}
                >
                  {pt}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Question list */}
        <div className="space-y-2">
          {filtered.map(q => (
            <div
              key={q.id}
              className="rounded-2xl overflow-hidden"
              style={{ border: '1px solid #e8e4dc' }}
            >
              {/* Row header */}
              <button
                onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
                className="w-full flex items-center gap-2 px-4 py-3 text-left"
                style={{ background: expandedId === q.id ? '#f5f3ef' : '#fff' }}
              >
                {/* version badge */}
                <span
                  className="text-xs px-2 py-0.5 rounded shrink-0 font-mono"
                  style={{
                    background: q.version === 'v2' ? '#dbeafe' : '#f5f3ef',
                    color: q.version === 'v2' ? '#1d4ed8' : '#8a8a8a',
                  }}
                >
                  {q.version}
                </span>
                {/* pointType badge (v2 only) */}
                {q.pointType && (
                  <span
                    className="text-xs px-2 py-0.5 rounded shrink-0"
                    style={{ background: POINT_COLORS[q.pointType] ?? '#f5f3ef', color: '#3a3028' }}
                  >
                    {q.pointType}
                  </span>
                )}
                {/* form badge */}
                <span
                  className="text-xs px-2 py-0.5 rounded shrink-0"
                  style={{ background: '#f5f3ef', color: '#5a5248' }}
                >
                  {FORM_LABEL[q.type] ?? q.type}
                </span>
                {/* evidence badge */}
                <span
                  className="text-xs px-2 py-0.5 rounded shrink-0"
                  style={{
                    background: q.evidenceValid ? '#e8f4f0' : '#fde8e8',
                    color: q.evidenceValid ? '#3d8c78' : '#c0392b',
                  }}
                >
                  {q.evidenceValid ? '溯源✓' : '溯源✗'}
                </span>
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

                  {/* Meta */}
                  <p className="text-xs" style={{ color: '#c0b8aa' }}>
                    {q.version} · {q.pointId} · {q.promptVersion} · id: {q.id}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        {filtered.length === 0 && !loading && !error && questions.length === 0 && (
          <p className="text-sm text-center py-12" style={{ color: '#c0b8aa' }}>
            先运行 <code>pnpm import:blueprints</code> 导入蓝图，再 <code>pnpm pregenerate:quiz</code>，然后点加载
          </p>
        )}

        {filtered.length === 0 && !loading && !error && questions.length > 0 && (
          <p className="text-sm text-center py-12" style={{ color: '#c0b8aa' }}>
            该版本暂无题目
          </p>
        )}
      </div>
    </div>
  )
}
