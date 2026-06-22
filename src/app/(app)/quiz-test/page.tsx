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
}

const POEMS = [
  { id: 'TANG_001', title: '静夜思' },
  { id: 'TANG_023', title: '九月九日忆山东兄弟' },
  { id: 'TANG_042', title: '登高' },
]

const TYPES = [
  { value: 'mcq', label: '选择题' },
  { value: 'fill', label: '填空题' },
  { value: 'translate', label: '翻译题' },
  { value: 'appreciate', label: '赏析题' },
]

const DIFFICULTIES = ['易', '中', '难']

export default function QuizTestPage() {
  const [poemId, setPoemId] = useState('TANG_042')
  const [type, setType] = useState('mcq')
  const [difficulty, setDifficulty] = useState('中')
  const [loading, setLoading] = useState(false)
  const [question, setQuestion] = useState<Question | null>(null)
  const [error, setError] = useState('')

  async function handleGenerate() {
    setLoading(true)
    setError('')
    setQuestion(null)
    try {
      const res = await fetch('/api/quiz/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poemId, type, difficulty }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error?.message ?? '生成失败')
        return
      }
      setQuestion(data.question)
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen p-8" style={{ background: '#fafaf7', color: '#1a1a1a' }}>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-serif mb-2">出题测试</h1>
        <p className="text-sm mb-8" style={{ color: '#8a8a8a' }}>
          Week 3 Day 3 验证页 · 测完可删
        </p>

        {/* Controls */}
        <div className="flex gap-4 flex-wrap mb-6">
          <div>
            <label className="text-xs block mb-1" style={{ color: '#8a8a8a' }}>诗</label>
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
            <label className="text-xs block mb-1" style={{ color: '#8a8a8a' }}>题型</label>
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
              style={{ borderColor: '#d4cfc6', background: '#fff' }}
            >
              {TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs block mb-1" style={{ color: '#8a8a8a' }}>难度</label>
            <select
              value={difficulty}
              onChange={e => setDifficulty(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
              style={{ borderColor: '#d4cfc6', background: '#fff' }}
            >
              {DIFFICULTIES.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div className="self-end">
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
              style={{ background: '#1a1a1a', color: '#fafaf7' }}
            >
              {loading ? '生成中…' : '出题'}
            </button>
          </div>
        </div>

        {error && (
          <p className="text-sm mb-4" style={{ color: '#c0392b' }}>{error}</p>
        )}

        {/* Question display */}
        {question && (
          <div
            className="rounded-2xl p-6 space-y-4"
            style={{ background: '#fff', border: '1px solid #e8e4dc' }}
          >
            {/* Header */}
            <div className="flex items-center gap-2 text-xs" style={{ color: '#8a8a8a' }}>
              <span className="px-2 py-0.5 rounded" style={{ background: '#f5f3ef' }}>
                {question.type}
              </span>
              <span className="px-2 py-0.5 rounded" style={{ background: '#f5f3ef' }}>
                {question.difficulty}度
              </span>
              <span
                className="px-2 py-0.5 rounded"
                style={{
                  background: question.evidenceValid ? '#e8f4f0' : '#fde8e8',
                  color: question.evidenceValid ? '#3d8c78' : '#c0392b',
                }}
              >
                溯源 {question.evidenceValid ? '✓ 通过' : '✗ 失败'}
              </span>
              {question.qualityScore != null && (
                <span className="px-2 py-0.5 rounded" style={{ background: '#f5f3ef' }}>
                  质量 {(question.qualityScore * 100).toFixed(0)}
                </span>
              )}
            </div>

            {/* Stem */}
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: '#8a8a8a' }}>题干</p>
              <p className="text-base leading-relaxed">{question.stem}</p>
            </div>

            {/* Options (mcq only) */}
            {question.options && (
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: '#8a8a8a' }}>选项</p>
                <div className="space-y-2">
                  {question.options.map((opt, i) => (
                    <div
                      key={i}
                      className="flex gap-2 text-sm px-3 py-2 rounded-lg"
                      style={{
                        background: opt === question.answer ? '#e8f4f0' : '#fafaf7',
                        border: `1px solid ${opt === question.answer ? '#3d8c78' : '#e8e4dc'}`,
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
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: '#8a8a8a' }}>答案</p>
              <p className="text-sm leading-relaxed font-medium" style={{ color: '#5e8b7e' }}>
                {question.answer}
              </p>
            </div>

            {/* Explanation */}
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: '#8a8a8a' }}>解析</p>
              <p className="text-sm leading-relaxed">{question.explanation}</p>
            </div>

            {/* Evidence lines */}
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: '#8a8a8a' }}>
                依据原文（evidenceLines）
              </p>
              <div className="space-y-1">
                {question.evidenceLines.map((line, i) => (
                  <p
                    key={i}
                    className="text-sm font-serif px-3 py-1.5 rounded-lg"
                    style={{ background: '#f5f3ef', color: '#3a3028' }}
                  >
                    {line}
                  </p>
                ))}
              </div>
            </div>

            {/* ID */}
            <p className="text-xs" style={{ color: '#c0b8aa' }}>
              ID: {question.id}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
