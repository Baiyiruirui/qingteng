'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

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
      setError('网络错误,请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: '#fafaf7' }}
    >
      <div
        className="w-full max-w-[400px] mx-4 rounded-2xl px-8 py-10"
        style={{ background: '#fff', boxShadow: '0 2px 16px 0 rgba(0,0,0,0.06)' }}
      >
        <h1
          className="text-4xl font-serif tracking-widest text-center mb-1"
          style={{ color: '#1a1a1a' }}
        >
          青藤认识你
        </h1>
        <p className="text-center text-sm mb-8" style={{ color: '#8a8a8a' }}>
          起个名字吧
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors"
            style={{ borderColor: '#d4cfc6', background: '#fafaf7', color: '#1a1a1a' }}
            placeholder="你的名字(1-20 字)"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
            autoComplete="username"
            maxLength={20}
          />
          <input
            type="password"
            className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors"
            style={{ borderColor: '#d4cfc6', background: '#fafaf7', color: '#1a1a1a' }}
            placeholder="密码(至少 6 位)"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="new-password"
          />

          {error && (
            <p className="text-sm" style={{ color: '#c0392b' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !name || password.length < 6}
            className="w-full py-3 rounded-xl text-sm font-medium transition-opacity disabled:opacity-40"
            style={{ background: '#1a1a1a', color: '#fafaf7' }}
          >
            {loading ? '注册中…' : '开始'}
          </button>
        </form>

        <p className="text-center text-sm mt-6" style={{ color: '#8a8a8a' }}>
          已经认识了?{' '}
          <Link href="/login" className="underline" style={{ color: '#5e8b7e' }}>
            登录
          </Link>
        </p>
      </div>
    </div>
  )
}
