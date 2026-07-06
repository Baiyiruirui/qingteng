'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import type { UIMessage } from 'ai'
import { inkFadeIn, inkFadeInStagger } from '@/lib/motion'
import { ShanshuiBanner } from '@/components/ShanshuiBanner'
import { Seal } from '@/components/Seal'

function getTextContent(parts: Array<{ type: string; text?: string }>) {
  return parts
    .filter(p => p.type === 'text')
    .map(p => p.text ?? '')
    .join('')
}

export type DailyPoem = {
  id: string
  title: string
  author: string
  dynasty: string | null
  lines: string[]
  hasQuiz: boolean
}

type MemoryContext = {
  profile: {
    totalConversations: number
    recentPoems: string[]
    recentThemes: string[]
    activeDays7: number
    emotionalNotes: string[]
  } | null
  memories: { content: string; source: string | null }[]
}

type Props = {
  userName: string
  conversationId: string
  initialMessages: UIMessage[]
  sessionMode?: 'chat' | 'roleplay' | 'creative'
  sessionPoemTitle?: string
  dailyPoem?: DailyPoem | null
}

export default function ChatClient({
  userName,
  conversationId,
  initialMessages,
  sessionMode,
  sessionPoemTitle,
  dailyPoem,
}: Props) {
  const router = useRouter()
  const [input, setInput] = useState('')
  const [newConvLoading, setNewConvLoading] = useState(false)
  const [openingLoading, setOpeningLoading] = useState(false)
  const [modeLoading, setModeLoading] = useState<string | null>(null)
  const [memCtx, setMemCtx] = useState<MemoryContext | null>(null)
  const openingFetched = useRef(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const isDailyChat = !sessionMode || sessionMode === 'chat'

  const transport = useMemo(
    () => new DefaultChatTransport({ body: { conversationId } }),
    [conversationId],
  )

  const { messages, status, sendMessage, setMessages } = useChat({
    transport,
    messages: initialMessages,
  })

  // 案头模式：还没聊起来（无用户消息）时展示今日案头
  const hasConversation = messages.some(m => m.role === 'user')
  const showDesk = isDailyChat && !hasConversation

  useEffect(() => {
    if (initialMessages.length > 0 || openingFetched.current) return
    openingFetched.current = true
    setOpeningLoading(true)
    fetch('/api/chat/opening', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (data.opening) {
          setMessages([
            {
              id: data.opening.id,
              role: 'assistant' as const,
              parts: [{ type: 'text' as const, text: data.opening.content }],
            },
          ])
        }
      })
      .catch(e => console.error('[opening] fetch failed:', e))
      .finally(() => setOpeningLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 三层 Memory 上下文（日常模式才拉取，案头右栏 + 对话记忆卡共用）
  useEffect(() => {
    if (!isDailyChat) return
    fetch('/api/memory/context')
      .then(res => (res.ok ? res.json() : null))
      .then(d => d && !d.error && setMemCtx(d))
      .catch(() => {})
  }, [isDailyChat])

  useEffect(() => {
    if (!showDesk) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, showDesk])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || status !== 'ready') return
    sendMessage({ text })
    setInput('')
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  async function handleNewConversation() {
    if (newConvLoading) return
    setNewConvLoading(true)
    try {
      await fetch('/api/conversations', { method: 'POST' })
      router.refresh()
    } finally {
      setNewConvLoading(false)
    }
  }

  /** 进入沉浸 / 协同创作（与诗库页同一 API） */
  async function startMode(mode: 'roleplay' | 'creative', poemId: string) {
    const key = `${mode}-${poemId}`
    if (modeLoading) return
    setModeLoading(key)
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
      setModeLoading(null)
    }
  }

  const waiting = status === 'submitted'

  // 案头札记文案 = 开场白（最后一条 assistant 消息）
  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
  const openingText = lastAssistant
    ? getTextContent(lastAssistant.parts as Array<{ type: string; text?: string }>)
    : null

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      {/* 磨砂 Header */}
      <header className="sticky top-0 z-20 border-b border-edge bg-paper/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 lg:px-6">
          <div className="flex items-center gap-2.5">
            <Seal char="藤" size={30} />
            <span className="font-kai text-[26px] leading-none text-ink">青藤</span>
            {!isDailyChat && (
              <span className="ml-2 rounded-full bg-paper-block px-2.5 py-1 text-xs text-ink-mid">
                {sessionMode === 'roleplay' ? '沉浸' : '共写'}
                {sessionPoemTitle ? ` · ${sessionPoemTitle}` : ''}
              </span>
            )}
          </div>

          <nav className="flex items-center gap-5">
            <Link
              href="/poems"
              className="cursor-pointer font-serif text-sm text-ink-mid transition-colors duration-200 hover:text-ink"
            >
              诗库
            </Link>
            <Link
              href="/wrong"
              className="cursor-pointer font-serif text-sm text-ink-mid transition-colors duration-200 hover:text-ink"
            >
              待加强
            </Link>
            <span className="hidden text-sm text-ink-faint sm:inline">你好，{userName}</span>
            {isDailyChat && (
              <button
                onClick={handleNewConversation}
                disabled={newConvLoading}
                className="cursor-pointer rounded-lg border border-edge bg-transparent px-2.5 py-1 text-xs text-ink-faint transition-opacity duration-200 hover:opacity-70 disabled:opacity-40"
              >
                + 新对话
              </button>
            )}
            <button
              onClick={handleLogout}
              className="cursor-pointer text-xs text-ink-faint underline underline-offset-2 transition-colors duration-200 hover:text-ink"
            >
              登出
            </button>
          </nav>
        </div>
      </header>

      {showDesk ? (
        <DailyDesk
          userName={userName}
          openingLoading={openingLoading}
          openingText={openingText}
          dailyPoem={dailyPoem ?? null}
          memCtx={memCtx}
          modeLoading={modeLoading}
          onStartMode={startMode}
        />
      ) : (
        <>
          {isDailyChat && <ShanshuiBanner className="-mb-10" />}

          {isDailyChat && (
            <div className="relative z-10 mx-auto w-full max-w-180 px-4">
              <MemoryCard data={memCtx} />
            </div>
          )}

          {/* 消息区 */}
          <main className="flex-1 overflow-y-auto py-8">
            <div className="mx-auto max-w-180 space-y-8 px-4">
              {messages.map((m, i) => {
                const text = getTextContent(m.parts as Array<{ type: string; text?: string }>)
                const isUser = m.role === 'user'

                if (isUser) {
                  return (
                    <motion.div
                      key={m.id}
                      variants={inkFadeIn}
                      initial="hidden"
                      animate="visible"
                      className="flex justify-end"
                    >
                      <div className="max-w-[75%] rounded-2xl rounded-br-sm bg-paper-block px-4 py-3 text-sm leading-relaxed text-ink">
                        {text}
                      </div>
                    </motion.div>
                  )
                }

                return (
                  <motion.div
                    key={m.id}
                    variants={inkFadeIn}
                    initial="hidden"
                    animate="visible"
                    className="flex items-start gap-3"
                  >
                    <Avatar />
                    <div className="flex-1 whitespace-pre-wrap pt-1 text-sm leading-relaxed text-ink">
                      {text}
                      {status === 'streaming' && i === messages.length - 1 && (
                        <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse align-middle bg-jade" />
                      )}
                    </div>
                  </motion.div>
                )
              })}

              {waiting && (
                <motion.div
                  variants={inkFadeIn}
                  initial="hidden"
                  animate="visible"
                  className="flex items-start gap-3"
                >
                  <Avatar />
                  <div className="pt-2">
                    <TypingDots />
                  </div>
                </motion.div>
              )}

              <div ref={bottomRef} />
            </div>
          </main>
        </>
      )}

      {/* 输入区（案头与对话共用：从案头输入即进入对话） */}
      <footer className="sticky bottom-0 z-20 border-t border-edge bg-paper/95 py-4 backdrop-blur">
        <form onSubmit={handleSubmit} className="mx-auto flex max-w-180 items-end gap-3 px-4">
          <input
            className="flex-1 rounded-xl border border-edge bg-white px-4 py-3 text-sm text-ink outline-none transition-colors duration-200 placeholder:text-ink-faint focus:border-jade"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e as unknown as React.FormEvent)
              }
            }}
            placeholder={showDesk ? '回应青藤，或随便聊聊…' : '和青藤聊聊…'}
            disabled={status !== 'ready'}
            autoFocus
          />
          <button
            type="submit"
            disabled={!input.trim() || status !== 'ready'}
            className="shrink-0 cursor-pointer rounded-xl px-5 py-3 font-serif text-sm tracking-[0.12em] text-paper-block transition-opacity duration-200 disabled:opacity-40"
            style={{ background: 'var(--qt-ink-btn)' }}
          >
            发
          </button>
        </form>
      </footer>
    </div>
  )
}

// ── 今日案头（对标示意图 1：札记 / 今日入诗 / 青藤记得 + 三入口） ──────────

function DailyDesk({
  userName,
  openingLoading,
  openingText,
  dailyPoem,
  memCtx,
  modeLoading,
  onStartMode,
}: {
  userName: string
  openingLoading: boolean
  openingText: string | null
  dailyPoem: DailyPoem | null
  memCtx: MemoryContext | null
  modeLoading: string | null
  onStartMode: (mode: 'roleplay' | 'creative', poemId: string) => void
}) {
  const p = memCtx?.profile
  const memories = memCtx?.memories ?? []
  const hour = new Date().getHours()
  const greet = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好'
  const reason = p?.recentThemes?.[0]
    ? `因为你最近常聊「${p.recentThemes[0]}」`
    : '今天想和你一起读读它'

  return (
    <main className="relative mx-auto w-full max-w-6xl flex-1 px-4 pb-10 pt-8 lg:px-6">
      <motion.div
        variants={inkFadeInStagger}
        initial="hidden"
        animate="visible"
        className="grid items-start gap-6 lg:grid-cols-[1fr_1.3fr_1fr]"
      >
        {/* 左：今日青藤札记 */}
        <motion.section variants={inkFadeIn} className="lg:pt-6">
          <h2 className="flex items-center gap-2 font-kai text-2xl text-ink">
            <LeafGlyph />
            今日青藤札记
          </h2>
          <div className="mt-5 min-h-32 font-serif text-[15px] leading-loose text-ink">
            <p className="mb-3">
              {userName}，{greet}。
            </p>
            {openingLoading ? (
              <span className="inline-flex items-center gap-2 text-ink-faint">
                <TypingDots />
                <span className="text-sm tracking-widest opacity-70">青藤研墨中</span>
              </span>
            ) : (
              <p className="whitespace-pre-wrap">
                {openingText ?? '青藤在这里等你。随便聊聊——今天读的诗、卡住的题，或只是心情。'}
              </p>
            )}
          </div>
          <div className="mt-6 flex items-center gap-2">
            <span className="h-px w-8 bg-edge" />
            <span className="font-serif text-sm text-ink-mid">青藤</span>
            <Seal char="藤" size={20} />
          </div>
        </motion.section>

        {/* 中：今日入诗 */}
        <motion.section variants={inkFadeIn}>
          {dailyPoem ? (
            <div className="relative overflow-hidden rounded-2xl border border-edge bg-paper-block/70 px-8 pb-8 pt-7 shadow-[0_28px_70px_-36px_rgba(46,58,52,0.45),0_1px_0_rgba(255,255,255,0.7)_inset]">
              {/* 暖月光晕 */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-8 top-2 h-36 w-36 rounded-full blur-xl"
                style={{
                  background:
                    'radial-gradient(circle, rgba(232,201,160,0.55) 0%, rgba(232,201,160,0) 70%)',
                }}
              />
              <p className="flex items-center gap-1.5 font-serif text-sm tracking-[0.25em] text-jade">
                <span className="inline-block h-2 w-2 rounded-full border border-jade" />
                今日入诗
              </p>
              <h3 className="mt-5 text-center font-kai text-[34px] leading-tight text-ink">
                《{dailyPoem.title}》
              </h3>
              <p className="mt-1 text-center font-serif text-sm text-ink-mid">
                {dailyPoem.dynasty ? `${dailyPoem.dynasty} · ` : ''}
                {dailyPoem.author}
              </p>
              <span className="mx-auto mt-3 block h-0.5 w-10 rounded bg-cinnabar/60" />
              <div className="mt-5 space-y-3">
                {dailyPoem.lines.map((ln, i) => (
                  <p
                    key={i}
                    className="text-center font-serif text-[19px] tracking-[0.3em] text-ink"
                  >
                    {ln}
                  </p>
                ))}
              </div>
              <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-jade">
                <LeafGlyph small />
                {reason}
              </p>
              <div className="mt-6 flex items-center justify-center gap-3">
                <button
                  onClick={() => onStartMode('roleplay', dailyPoem.id)}
                  disabled={modeLoading !== null}
                  className="cursor-pointer rounded-lg bg-jade px-6 py-2.5 font-serif text-[15px] tracking-[0.15em] text-white transition-all duration-200 hover:brightness-105 hover:shadow-md active:scale-[0.98] disabled:opacity-40"
                >
                  {modeLoading === `roleplay-${dailyPoem.id}` ? '入境中…' : '入诗境 ›'}
                </button>
                {dailyPoem.hasQuiz && (
                  <Link
                    href={`/quiz/${dailyPoem.id}`}
                    className="cursor-pointer rounded-lg border border-jade/60 px-6 py-2.5 font-serif text-[15px] tracking-[0.15em] text-jade transition-all duration-200 hover:bg-jade/10 active:scale-[0.98]"
                  >
                    青藤考你 ›
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-edge bg-paper-block/70 px-8 py-16 text-center font-serif text-ink-faint">
              今日入诗准备中…先去诗库逛逛吧。
            </div>
          )}
        </motion.section>

        {/* 右：青藤记得 */}
        <motion.aside variants={inkFadeIn} className="lg:pt-6">
          <h2 className="flex items-center gap-2 font-kai text-2xl text-ink">
            <MemGlyph />
            青藤记得
          </h2>
          <div className="mt-5 space-y-5">
            {p && p.recentPoems.length > 0 ? (
              <DeskMemRow
                icon={<BookGlyph />}
                title="最近读过"
                body={p.recentPoems.slice(0, 2).map(t => `《${t}》`).join(' ')}
                sub={p.activeDays7 > 0 ? `近 7 天来了 ${p.activeDays7} 天` : undefined}
              />
            ) : (
              <DeskMemRow
                icon={<BookGlyph />}
                title="初次见面"
                body="聊过之后，青藤就会记得你读过的诗。"
              />
            )}

            {p && p.recentThemes.length > 0 && (
              <DeskMemRow
                icon={<ThemeGlyph />}
                title="常聊的意象"
                body={p.recentThemes.slice(0, 3).join(' · ')}
                sub="多次停留"
              />
            )}

            {memories.length > 0 && (
              <DeskMemRow
                icon={<HeartGlyph />}
                title="记在心里"
                body={memories[0].content}
                sub={memories[1]?.content}
              />
            )}

            <DeskMemRow
              icon={<StepGlyph />}
              title="下一步"
              body={
                p?.recentThemes?.[0]
                  ? `沿着「${p.recentThemes[0]}」，把今日这首读进去`
                  : '从今日入诗开始，读一首、聊几句'
              }
              sub="建议今日完成"
            />
          </div>
        </motion.aside>
      </motion.div>

      {/* 底部三入口 */}
      <motion.div
        variants={inkFadeInStagger}
        initial="hidden"
        animate="visible"
        className="mt-10 grid gap-3 sm:grid-cols-3"
      >
        <DeskStrip
          char="读"
          title="读一首"
          desc="沉浸式读诗，感受语言与意境"
          href="/poems"
        />
        <DeskStrip
          char="练"
          title="练一题"
          desc="精选题目，巩固理解与方法"
          href={dailyPoem?.hasQuiz ? `/quiz/${dailyPoem.id}` : '/poems'}
        />
        <DeskStrip
          char="写"
          title="写两句"
          desc="从诗中取法，写下你的两句"
          onClick={dailyPoem ? () => onStartMode('creative', dailyPoem.id) : undefined}
          href={dailyPoem ? undefined : '/poems'}
          loading={dailyPoem ? modeLoading === `creative-${dailyPoem.id}` : false}
        />
      </motion.div>
    </main>
  )
}

function DeskMemRow({
  icon,
  title,
  body,
  sub,
}: {
  icon: React.ReactNode
  title: string
  body: string
  sub?: string
}) {
  return (
    <div className="flex items-start gap-3 border-b border-edge/50 pb-4 last:border-b-0">
      <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-paper-block text-jade">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="font-serif text-[15px] font-medium text-ink">{title}</p>
        <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-ink-mid">{body}</p>
        {sub && <p className="mt-1 line-clamp-1 text-xs text-ink-faint">{sub}</p>}
      </div>
    </div>
  )
}

function DeskStrip({
  char,
  title,
  desc,
  href,
  onClick,
  loading,
}: {
  char: string
  title: string
  desc: string
  href?: string
  onClick?: () => void
  loading?: boolean
}) {
  const inner = (
    <>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-[1.5px] border-jade/60 font-kai text-xl text-jade">
        {char}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-kai text-xl text-ink">{loading ? '进入中…' : title}</span>
        <span className="mt-0.5 block truncate text-xs text-ink-faint">{desc}</span>
      </span>
      <span aria-hidden="true" className="text-ink-faint">
        ›
      </span>
    </>
  )
  const cls =
    'group flex w-full cursor-pointer items-center gap-4 rounded-xl border border-edge/70 bg-white/50 px-5 py-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-edge hover:bg-white/75 hover:shadow-[0_14px_34px_-20px_rgba(46,58,52,0.4)]'

  if (onClick) {
    return (
      <motion.div variants={inkFadeIn}>
        <button onClick={onClick} disabled={loading} className={cls + ' disabled:opacity-50'}>
          {inner}
        </button>
      </motion.div>
    )
  }
  return (
    <motion.div variants={inkFadeIn}>
      <Link href={href ?? '/poems'} className={cls}>
        {inner}
      </Link>
    </motion.div>
  )
}

// ── 极简线性字形（1.5px 描边，统一风格，不用 emoji） ──────────────────

function LeafGlyph({ small }: { small?: boolean }) {
  const s = small ? 12 : 18
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 19C5 12 9 5 19 4c1 10-6 14-13 14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M5 19c3-5 7-9 11-11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function MemGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 21s-7-4.5-9-9c-1.2-2.8.6-6 3.8-6 2 0 3.4 1 4.2 2.4H11c.8-1.4 2.2-2.4 4.2-2.4 3.2 0 5 3.2 3.8 6-2 4.5-9 9-9 9h2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function BookGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M20 18v3H6.5A2.5 2.5 0 0 1 4 18.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function ThemeGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function HeartGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 20s-7.5-4.8-9.4-9.2C1.3 7.6 3.6 4.5 6.8 4.5c2 0 3.7 1.1 4.5 2.7h1.4c.8-1.6 2.5-2.7 4.5-2.7 3.2 0 5.5 3.1 4.2 6.3C19.5 15.2 12 20 12 20Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function StepGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 18c4 0 4-4 8-4s4 4 8 4M4 12c4 0 4-4 8-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M17 5.5 20 8l-3 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Avatar() {
  return (
    <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full bg-jade font-serif text-xs font-medium text-white">
      青
    </div>
  )
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="青藤正在思考">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-jade/70"
          style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.9s' }}
        />
      ))}
    </span>
  )
}

// ── 「青藤记得你」：对话视图中的折叠记忆卡 ──────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  preference: '偏好',
  emotion: '情绪',
  confusion: '困惑',
  personal: '个人',
}

function MemoryCard({ data }: { data: MemoryContext | null }) {
  const [open, setOpen] = useState(false)

  const hasProfile =
    data?.profile &&
    (data.profile.totalConversations > 1 ||
      data.profile.recentPoems.length > 0 ||
      data.profile.recentThemes.length > 0)
  const hasMemories = (data?.memories?.length ?? 0) > 0

  if (!data || (!hasProfile && !hasMemories)) return null

  const p = data.profile

  return (
    <motion.div
      variants={inkFadeIn}
      initial="hidden"
      animate="visible"
      className="rounded-xl border border-edge/60 bg-white/50 backdrop-blur-sm"
    >
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full cursor-pointer items-center justify-between px-4 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 font-serif text-sm text-ink">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-cinnabar/70" />
          青藤记得你
          {p && p.totalConversations > 0 && (
            <span className="font-sans text-xs text-ink-faint">
              · 聊过 {p.totalConversations} 次
              {p.activeDays7 > 0 ? ` · 近 7 天来 ${p.activeDays7} 天` : ''}
            </span>
          )}
        </span>
        <span
          className="text-xs text-ink-faint transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}
        >
          ⌄
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-3 border-t border-edge/50 px-4 py-3">
              {p && p.recentPoems.length > 0 && (
                <TagRow label="最近读过" items={p.recentPoems} tone="jade" />
              )}
              {p && p.recentThemes.length > 0 && (
                <TagRow label="触及主题" items={p.recentThemes} tone="ink" />
              )}
              {hasMemories && (
                <div>
                  <p className="mb-1.5 text-xs text-ink-faint">长期记忆</p>
                  <ul className="space-y-1.5">
                    {data.memories.map((m, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-ink">
                        {m.source && SOURCE_LABEL[m.source] && (
                          <span className="mt-0.5 shrink-0 rounded-full bg-cinnabar/10 px-1.5 py-0.5 text-[10px] text-cinnabar">
                            {SOURCE_LABEL[m.source]}
                          </span>
                        )}
                        <span className="leading-relaxed">{m.content}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="pt-1 text-[11px] leading-relaxed text-ink-faint/70">
                这些记忆由青藤在对话中自动提炼，用于个性化陪伴。
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function TagRow({ label, items, tone }: { label: string; items: string[]; tone: 'jade' | 'ink' }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-ink-faint">{label}</span>
      {items.map((t, i) => (
        <span
          key={i}
          className={
            tone === 'jade'
              ? 'rounded-full bg-jade/10 px-2 py-0.5 text-xs text-jade'
              : 'rounded-full bg-paper-block px-2 py-0.5 text-xs text-ink-mid'
          }
        >
          {t}
        </span>
      ))}
    </div>
  )
}
