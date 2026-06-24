'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { SealStamp } from '@/components/SealStamp'
import { inkFadeIn } from '@/lib/motion'

export default function RegisterPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error?.message ?? '注册失败')
        return
      }
      router.push('/chat')
    } catch {
      setError('网络错误，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-qt-paper px-4">
      <motion.div
        variants={inkFadeIn}
        initial="hidden"
        animate="visible"
        className="w-full max-w-sm"
      >
        {/* 朱砂印章 */}
        <div className="flex justify-center mb-7">
          <SealStamp size={52} tilt />
        </div>

        {/* 卡片 */}
        <div
          className="rounded-2xl px-8 py-10"
          style={{
            background: 'rgba(255,255,255,0.72)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 4px 32px rgba(46,58,52,0.07), 0 0 0 0.5px #D8CFBC',
          }}
        >
          <h1 className="font-serif text-[2rem] tracking-[0.22em] text-center text-qt-ink mb-1.5">
            青藤认识你
          </h1>
          <p className="text-center text-sm text-qt-ink-light mb-8 tracking-wide">
            起个名字吧
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
              className="w-full rounded-lg border px-4 py-3 text-sm outline-none transition-colors bg-qt-paper-alt text-qt-ink border-qt-border placeholder:text-qt-ink-light focus:border-qt-green"
              placeholder="你的名字（1-20 字）"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              autoComplete="username"
              maxLength={20}
            />
            <input
              type="password"
              className="w-full rounded-lg border px-4 py-3 text-sm outline-none transition-colors bg-qt-paper-alt text-qt-ink border-qt-border placeholder:text-qt-ink-light focus:border-qt-green"
              placeholder="密码（至少 6 位）"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
            />

            {error && (
              <p className="text-sm text-qt-vermilion opacity-90">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !name || password.length < 6}
              className="w-full py-3 rounded-lg font-serif tracking-[0.2em] text-sm transition-opacity disabled:opacity-40 mt-1"
              style={{ background: 'var(--qt-ink-btn)', color: 'var(--qt-paper-alt)' }}
            >
              {loading ? '注册中…' : '开始'}
            </button>
          </form>

          <p className="text-center text-sm mt-7 text-qt-ink-light">
            已经认识了？{' '}
            <Link
              href="/login"
              className="text-qt-vermilion hover:opacity-70 transition-opacity"
            >
              登录
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  )
}
