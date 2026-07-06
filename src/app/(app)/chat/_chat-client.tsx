'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import type { UIMessage } from 'ai'
import { inkFadeIn } from '@/lib/motion'

function getTextContent(parts: Array<{ type: string; text?: string }>) {
  return parts
    .filter(p => p.type === 'text')
    .map(p => p.text ?? '')
    .join('')
}

type Props = {
  userName: string
  conversationId: string
  initialMessages: UIMessage[]
  sessionMode?: 'chat' | 'roleplay' | 'creative'
  sessionPoemTitle?: string
}

export default function ChatClient({
  userName,
  conversationId,
  initialMessages,
  sessionMode,
  sessionPoemTitle,
}: Props) {
  const router = useRouter()
  const [input, setInput] = useState('')
  const [newConvLoading, setNewConvLoading] = useState(false)
  const [openingLoading, setOpeningLoading] = useState(false)
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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

  const waiting = status === 'submitted'

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      {/* 磨砂 Header（minimal chrome） */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-edge bg-paper/90 px-6 py-5 backdrop-blur">
        <div className="flex-1">
          <Link
            href="/poems"
            className="cursor-pointer text-sm text-ink-faint transition-colors duration-200 hover:text-ink"
          >
            {isDailyChat ? '诗库' : '← 诗库'}
          </Link>
        </div>

        <div className="text-center">
          <h1 className="font-serif text-[1.75rem] tracking-[0.22em] text-ink">青藤</h1>
          {!isDailyChat && (
            <p className="mt-0.5 text-xs text-ink-faint">
              {sessionMode === 'roleplay' ? '沉浸模式' : '协同创作'}
              {sessionPoemTitle ? ` · ${sessionPoemTitle}` : ''}
            </p>
          )}
        </div>

        <div className="flex flex-1 items-center justify-end gap-4">
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
            className="cursor-pointer text-sm text-ink-faint underline underline-offset-2 transition-colors duration-200 hover:text-ink"
          >
            登出
          </button>
        </div>
      </header>

      {/* 「青藤记得你」记忆卡片：把三层 Memory 可视化（仅日常对话，常驻 header 下方） */}
      {isDailyChat && (
        <div className="mx-auto w-full max-w-180 px-4 pt-4">
          <MemoryCard />
        </div>
      )}

      {/* 消息区 */}
      <main className="flex-1 overflow-y-auto py-8">
        <div className="mx-auto max-w-180 space-y-8 px-4">
          {openingLoading && (
            <div className="mt-16 flex items-center justify-center gap-2 text-ink-faint">
              <TypingDots />
              <span className="font-serif tracking-widest opacity-50">青藤正在准备打招呼</span>
            </div>
          )}

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

          {/* 打字指示器：已提交、等待首个 token */}
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

      {/* 输入区 */}
      <footer className="sticky bottom-0 border-t border-edge bg-paper/95 py-4 backdrop-blur">
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
            placeholder="和青藤聊聊…"
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

// ── 「青藤记得你」：三层 Memory 可视化 ──────────────────────────────
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

const SOURCE_LABEL: Record<string, string> = {
  preference: '偏好',
  emotion: '情绪',
  confusion: '困惑',
  personal: '个人',
}

function MemoryCard() {
  const [data, setData] = useState<MemoryContext | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    fetch('/api/memory/context')
      .then(res => (res.ok ? res.json() : null))
      .then(d => d && !d.error && setData(d))
      .catch(() => {})
  }, [])

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
        <span className="text-xs text-ink-faint transition-transform duration-200" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>
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
