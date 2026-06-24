'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Seal, CornerMark } from '@/components/Seal'
import { VerticalPoem } from '@/components/VerticalPoem'
import { zhuLiGuan } from '@/lib/poems'

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
    <main className="relative min-h-dvh w-full overflow-hidden bg-paper">
      {/* 宣纸纤维纹理 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 opacity-60 mix-blend-multiply"
        style={{ backgroundImage: 'url(/paper-texture.png)', backgroundSize: '480px 480px' }}
      />

      {/* 水墨主视觉（藤蔓轻摆） */}
      <div
        aria-hidden="true"
        className="animate-vine-sway pointer-events-none absolute inset-0 z-0 opacity-90"
        style={{
          backgroundImage: 'url(/ink-scene.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'left center',
          backgroundRepeat: 'no-repeat',
        }}
      />

      {/* 暖月光晕 */}
      <div
        aria-hidden="true"
        className="animate-moon-breathe pointer-events-none absolute right-[14%] top-[12%] z-0 h-44 w-44 rounded-full blur-2xl"
        style={{ background: 'radial-gradient(circle, var(--color-moon-glow) 0%, rgba(232,201,160,0) 70%)' }}
      />

      {/* 内容层 */}
      <div className="relative z-10 mx-auto flex min-h-dvh max-w-6xl flex-col items-center justify-center gap-12 px-6 py-12 lg:flex-row lg:justify-between lg:gap-8">
        {/* 左侧竹里馆（仅大屏） */}
        <div className="hidden lg:block">
          <VerticalPoem poem={zhuLiGuan} />
        </div>

        {/* 右侧注册卡片 */}
        <div className="animate-ink-rise relative w-full max-w-95" style={{ animationDelay: '0.25s' }}>
          <div
            className="relative px-9 py-10"
            style={{
              backgroundColor: 'var(--color-card-overlay)',
              boxShadow:
                '0 1px 0 rgba(255,255,255,0.6) inset, 0 0 0 1px rgba(216,207,188,0.45), 0 18px 50px -24px rgba(46,58,52,0.30)',
            }}
          >
            {/* 顶部朱砂渐变线 */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-px"
              style={{
                background:
                  'linear-gradient(90deg, transparent, rgba(192,98,63,0.35) 20%, rgba(192,98,63,0.35) 80%, transparent)',
              }}
            />

            {/* 四角回纹 */}
            <CornerMark position="tl" className="m-3 text-jade/45" />
            <CornerMark position="tr" className="m-3 text-jade/45" />
            <CornerMark position="bl" className="m-3 text-jade/45" />
            <CornerMark position="br" className="m-3 text-jade/45" />

            {/* 品牌 */}
            <div className="mb-7 flex items-center gap-3">
              <Seal char="藤" size={42} />
              <div>
                <p className="font-serif text-[30px] font-semibold leading-none text-ink">青藤</p>
                <p className="mt-1.5 font-serif text-xs tracking-[0.2em] text-ink-mid">
                  与一位 AI 诗友，一起读诗
                </p>
              </div>
            </div>

            {/* 副标题 */}
            <div className="mb-6">
              <h1 className="font-serif text-[22px] text-ink">青藤认识你</h1>
              <p className="mt-1 font-serif text-sm text-ink-faint">起个名字吧</p>
            </div>

            {/* 表单 */}
            <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
              <InkField
                label="名字"
                placeholder="你的名字（1-20 字）"
                value={name}
                onChange={e => setName(e.target.value)}
                autoFocus
                autoComplete="username"
                maxLength={20}
              />
              <InkField
                label="密码"
                type="password"
                placeholder="密码（至少 6 位）"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
              />

              {error && <p className="text-sm text-cinnabar opacity-90">{error}</p>}

              <button
                type="submit"
                disabled={loading || !name || password.length < 6}
                className="mt-2 w-full rounded-lg border border-ink/15 py-3 font-serif text-[15px] tracking-[3px] transition-all hover:brightness-110 hover:shadow-md active:scale-[0.99] disabled:opacity-40"
                style={{ background: 'var(--qt-ink-btn)', color: 'var(--qt-paper-alt)' }}
              >
                {loading ? '注册中…' : '开始'}
              </button>
            </form>

            {/* 去登录 */}
            <p className="mt-6 text-center font-serif text-sm text-ink-mid">
              已经认识了？{' '}
              <Link
                href="/login"
                className="font-medium text-cinnabar underline-offset-4 transition-colors hover:underline"
              >
                登录
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* 移动端底部诗句 */}
      <p className="animate-ink-rise absolute bottom-6 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap text-center font-serif text-sm text-ink-faint lg:hidden">
        {zhuLiGuan.lines[0]}，{zhuLiGuan.lines[1]}
      </p>
    </main>
  )
}

function InkField({
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  autoFocus,
  autoComplete,
  maxLength,
}: {
  label: string
  type?: string
  placeholder?: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  autoFocus?: boolean
  autoComplete?: string
  maxLength?: number
}) {
  return (
    <label className="group flex flex-col gap-1.5">
      <span className="font-serif text-xs tracking-wider text-ink-mid">{label}</span>
      <div className="relative">
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          maxLength={maxLength}
          className="w-full rounded-lg border border-edge bg-paper/60 px-3.5 py-2.5 font-sans text-sm text-ink outline-none transition-colors placeholder:text-ink-faint/70 focus:border-jade focus:bg-paper"
        />
        <span className="pointer-events-none absolute -bottom-px left-1/2 h-px w-0 -translate-x-1/2 bg-jade transition-all duration-300 group-focus-within:w-[calc(100%-12px)]" />
      </div>
    </label>
  )
}
