'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { History, House, MessageCircle, Plus } from 'lucide-react'
import type { UIMessage } from 'ai'
import { inkFadeIn, inkFadeInStagger } from '@/lib/motion'
import { ShanshuiBanner } from '@/components/ShanshuiBanner'
import { Seal } from '@/components/Seal'
import { AppNav } from '@/components/AppNav'
import { ConversationHistoryDrawer } from '@/components/ConversationHistoryDrawer'
import { getPoemImage } from '@/lib/poem-images'
import { withReturnTo } from '@/lib/navigation'

function getTextContent(parts: Array<{ type: string; text?: string }>) {
  return parts
    .filter(p => p.type === 'text')
    .map(p => p.text ?? '')
    .join('')
}

function chatErrorMessage(error: Error) {
  if (error.message.includes('429') || error.message.includes('RATE_LIMITED')) {
    return '今天聊得有些密了，稍等片刻再继续。'
  }
  if (error.message.includes('503') || error.message.includes('RATE_LIMIT_UNAVAILABLE')) {
    return '青藤暂时接不上话，请稍后再试。'
  }
  return '这次没有收到回应，请稍后再试。'
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
  const [historyOpen, setHistoryOpen] = useState(false)
  const [openingLoading, setOpeningLoading] = useState(false)
  const [modeLoading, setModeLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [memCtx, setMemCtx] = useState<MemoryContext | null>(null)
  const openingFetched = useRef(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const isDailyChat = !sessionMode || sessionMode === 'chat'
  const supportsDesk = sessionMode === undefined
  const [dailyView, setDailyView] = useState<'desk' | 'conversation'>(
    supportsDesk ? 'desk' : 'conversation',
  )

  const transport = useMemo(
    () => new DefaultChatTransport({ body: { conversationId } }),
    [conversationId],
  )

  const { messages, status, sendMessage, setMessages, error, clearError } = useChat({
    transport,
    messages: initialMessages,
  })

  // /chat 始终保留今日案头；进入对话后可在两种视图间往返。
  const hasConversation = messages.some(m => m.role === 'user')
  const showDesk = supportsDesk && dailyView === 'desk'

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

  // 三层 Memory 上下文（日常模式才拉取，信文 + 对话记忆卡共用）
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
    if (!text || status === 'submitted' || status === 'streaming') return
    if (error) clearError()
    if (supportsDesk) setDailyView('conversation')
    sendMessage({ text })
    setInput('')
  }

  async function handleNewConversation() {
    if (newConvLoading) return
    setNewConvLoading(true)
    try {
      const response = await fetch('/api/conversations', { method: 'POST' })
      if (!response.ok) {
        setActionError('暂时无法新建对话，请稍后再试。')
        return
      }
      if (supportsDesk) setDailyView('desk')
      router.replace('/chat')
      router.refresh()
    } finally {
      setNewConvLoading(false)
    }
  }

  /** 进入沉浸（与诗笺地图页同一 API） */
  async function startMode(mode: 'roleplay', poemId: string) {
    const key = `${mode}-${poemId}`
    if (modeLoading) return
    setActionError(null)
    setModeLoading(key)
    try {
      const res = await fetch('/api/conversations/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, poemId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setActionError(data.error?.message ?? '暂时无法进入诗境，请稍后再试。')
        return
      }
      router.push(withReturnTo(`/session/${data.conversationId}`, '/chat'))
    } catch {
      setActionError('网络暂时不稳，请稍后再试。')
    } finally {
      setModeLoading(null)
    }
  }

  const waiting = status === 'submitted'
  const busy = status === 'submitted' || status === 'streaming'

  // 案头信文 = 开场白（最后一条 assistant 消息）
  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
  const openingText = !hasConversation && lastAssistant
    ? getTextContent(lastAssistant.parts as Array<{ type: string; text?: string }>)
    : null

  const navTitle = supportsDesk
    ? (showDesk ? '今日案头' : '与青藤对话')
    : `${sessionMode === 'creative' ? '共写' : '旧日对话'}${sessionPoemTitle ? ` · ${sessionPoemTitle}` : ''}`
  const deskToggleLabel = showDesk ? '继续对话' : '返回案头'

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <AppNav
        title={navTitle}
        userName={userName}
        right={isDailyChat ? (
          <div className="flex items-center gap-1">
            {supportsDesk && hasConversation && (
              <button
                type="button"
                onClick={() => setDailyView(showDesk ? 'conversation' : 'desk')}
                aria-label={deskToggleLabel}
                title={deskToggleLabel}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-edge px-2 text-xs font-medium text-ink-mid outline-none transition-colors hover:bg-paper-block hover:text-ink focus-visible:ring-2 focus-visible:ring-jade/55"
              >
                {showDesk
                  ? <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  : <House className="h-3.5 w-3.5" aria-hidden="true" />}
                <span className="hidden lg:inline">{deskToggleLabel}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              aria-label="历史对话"
              title="历史对话"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-faint outline-none transition-colors hover:bg-paper-block hover:text-ink focus-visible:ring-2 focus-visible:ring-jade/55"
            >
              <History className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleNewConversation}
              disabled={newConvLoading}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-edge px-2.5 text-xs font-medium text-ink-mid outline-none transition-colors hover:bg-paper-block focus-visible:ring-2 focus-visible:ring-jade/55 disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden md:inline">新对话</span>
            </button>
          </div>
        ) : undefined}
      />

      {isDailyChat && (
        <ConversationHistoryDrawer
          open={historyOpen}
          currentConversationId={conversationId}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      {actionError && (
        <p role="alert" className="mx-auto mt-3 w-[calc(100%-2rem)] max-w-6xl border-l-2 border-cinnabar bg-cinnabar/5 px-4 py-3 text-sm text-cinnabar">
          {actionError}
        </p>
      )}

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
      <footer
        className={`${showDesk ? 'relative' : 'sticky bottom-0'} z-20 border-t border-edge bg-paper/95 py-4 backdrop-blur`}
      >
        {error && (
          <p className="mx-auto mb-2 max-w-180 px-4 text-xs text-cinnabar">
            {chatErrorMessage(error)}
          </p>
        )}
        <form onSubmit={handleSubmit} className="mx-auto flex max-w-180 items-end gap-3 px-4">
          <input
            className="flex-1 rounded-xl border border-edge bg-white px-4 py-3 text-sm text-ink outline-none transition-colors duration-200 placeholder:text-ink-faint focus:border-jade"
            value={input}
            onChange={e => {
              if (error) clearError()
              setInput(e.target.value)
            }}
            maxLength={2000}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e as unknown as React.FormEvent)
              }
            }}
            placeholder={showDesk ? '回应青藤，或随便聊聊…' : '和青藤聊聊…'}
            disabled={busy}
            autoFocus
          />
          <button
            type="submit"
            disabled={!input.trim() || busy}
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

// ── 今日案头 · 方案 A「一封信」：信 + 今日入诗 + 三枚书签，无图标 ──────────

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
  onStartMode: (mode: 'roleplay', poemId: string) => void
}) {
  const p = memCtx?.profile
  const memories = memCtx?.memories ?? []
  const hour = new Date().getHours()
  const greet = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好'

  // 把三层记忆织成信里的一段话（不再是图标行）
  const memParts: string[] = []
  if (p?.recentPoems && p.recentPoems.length > 0) {
    memParts.push(`你最近读了${p.recentPoems.slice(0, 2).map(t => `《${t}》`).join('、')}`)
  }
  if (p?.recentThemes && p.recentThemes.length > 0) {
    memParts.push(`常在「${p.recentThemes[0]}」处停留`)
  }
  const memSentence = memParts.length > 0 ? memParts.join('，') + '。' : ''
  const remembered = memories[0]
    ? `我还记得——${memories[0].content.replace(/这位学生/g, '你').replace(/。$/, '')}。`
    : ''
  const nextStep = dailyPoem
    ? p?.recentThemes?.[0]
      ? `今天，不妨沿着「${p.recentThemes[0]}」，把这首《${dailyPoem.title}》读进去。`
      : `今天，从这首《${dailyPoem.title}》开始吧。`
    : ''

  const reason = p?.recentThemes?.[0]
    ? `因为你最近常聊「${p.recentThemes[0]}」`
    : '今天想和你一起读读它'

  const yijingSrc = dailyPoem ? getPoemImage(dailyPoem.id) : undefined

  return (
    <main className="relative mx-auto w-full max-w-6xl flex-1 px-4 pb-12 pt-8 lg:px-6">
      {/* 垂藤（左缘垂下，multiply 融进宣纸，径向遮罩消掉方形纸底边界） */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/yijing/vine-left.webp"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 -top-10 hidden w-[34rem] select-none opacity-95 mix-blend-multiply lg:block xl:w-[40rem]"
        style={{
          maskImage:
            'radial-gradient(130% 115% at 24% 4%, black 48%, rgba(0,0,0,0.35) 72%, transparent 90%)',
        }}
      />

      <motion.div
        variants={inkFadeInStagger}
        initial="hidden"
        animate="visible"
        className="grid items-start gap-10 lg:grid-cols-[1fr_1.15fr]"
      >
        {/* 左：青藤的信 */}
        <motion.section variants={inkFadeIn} className="relative lg:pl-28 lg:pt-8">
          <h2 className="font-kai text-[26px] text-ink">今日青藤札记</h2>
          <div className="mt-6 space-y-4 font-serif text-[16px] leading-loose text-ink">
            <p>
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
            {(memSentence || remembered) && (
              <p>
                {memSentence}
                {remembered}
              </p>
            )}
            {nextStep && <p>{nextStep}</p>}
          </div>
          <div className="mt-7 flex items-center justify-end gap-2 lg:pr-4">
            <span className="font-kai text-lg text-ink-mid">青藤</span>
            <Seal char="藤" size={22} />
          </div>
        </motion.section>

        {/* 右：今日入诗（顶部嵌意境图） */}
        <motion.section variants={inkFadeIn}>
          {dailyPoem ? (
            <div className="relative overflow-hidden rounded-2xl border border-edge bg-paper-block/70 shadow-[0_28px_70px_-36px_rgba(46,58,52,0.45),0_1px_0_rgba(255,255,255,0.7)_inset]">
              {yijingSrc && (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={yijingSrc}
                    alt={`《${dailyPoem.title}》意境图`}
                    className="aspect-[16/9] w-full object-cover object-top"
                  />
                  {/* 图底烘染，融进纸卡 */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-16"
                    style={{
                      background: 'linear-gradient(to top, rgba(242,237,224,0.95), transparent)',
                    }}
                  />
                  <p className="absolute left-6 top-5 flex items-center gap-1.5 font-serif text-sm tracking-[0.25em] text-ink/80">
                    <span className="inline-block h-2 w-2 rounded-full border border-ink/60" />
                    今日入诗
                  </p>
                </div>
              )}
              <div className="px-8 pb-8 pt-3">
                {!yijingSrc && (
                  <p className="flex items-center gap-1.5 pt-3 font-serif text-sm tracking-[0.25em] text-jade">
                    <span className="inline-block h-2 w-2 rounded-full border border-jade" />
                    今日入诗
                  </p>
                )}
                <h3 className="mt-2 text-center font-kai text-[32px] leading-tight text-ink">
                  《{dailyPoem.title}》
                </h3>
                <p className="mt-1 text-center font-serif text-sm text-ink-mid">
                  {dailyPoem.dynasty ? `${dailyPoem.dynasty} · ` : ''}
                  {dailyPoem.author}
                </p>
                <span className="mx-auto mt-3 block h-0.5 w-10 rounded bg-cinnabar/60" />
                <div className="mt-4 space-y-2.5">
                  {dailyPoem.lines.map((ln, i) => (
                    <p
                      key={i}
                      className="text-center font-serif text-[18px] tracking-[0.28em] text-ink"
                    >
                      {ln}
                    </p>
                  ))}
                </div>
                <p className="mt-4 text-center text-xs text-jade">{reason}</p>
                <div className="mt-5 flex items-center justify-center gap-3">
                  <button
                    onClick={() => onStartMode('roleplay', dailyPoem.id)}
                    disabled={modeLoading !== null}
                    className="cursor-pointer rounded-lg bg-jade px-6 py-2.5 font-serif text-[15px] tracking-[0.15em] text-white transition-all duration-200 hover:brightness-105 hover:shadow-md active:scale-[0.98] disabled:opacity-40"
                  >
                    {modeLoading === `roleplay-${dailyPoem.id}` ? '入境中…' : '入诗境 ›'}
                  </button>
                  {dailyPoem.hasQuiz && (
                    <Link
                      href={withReturnTo(`/quiz/${dailyPoem.id}`, '/chat')}
                      className="cursor-pointer rounded-lg border border-jade/60 px-6 py-2.5 font-serif text-[15px] tracking-[0.15em] text-jade transition-all duration-200 hover:bg-jade/10 active:scale-[0.98]"
                    >
                      青藤考你 ›
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-edge bg-paper-block/70 px-8 py-16 text-center font-serif text-ink-faint">
              今日入诗准备中…先去诗笺地图逛逛吧。
            </div>
          )}
        </motion.section>
      </motion.div>

      {/* 三枚书签（竖排签条，替代图标条） */}
      <motion.div
        variants={inkFadeInStagger}
        initial="hidden"
        animate="visible"
        className="mt-12 flex items-start justify-center gap-7 sm:gap-10"
      >
        <DeskTab label="读一首" tone="cinnabar" href="/poems" />
        <DeskTab
          label="练一题"
          tone="jade"
          href={dailyPoem?.hasQuiz ? withReturnTo(`/quiz/${dailyPoem.id}`, '/chat') : '/poems'}
        />
      </motion.div>
    </main>
  )
}

const TAB_TONE: Record<string, string> = {
  cinnabar: '#C0623F',
  jade: '#6E8B7E',
  earth: '#7C6B4F',
}

/** 竖排书签签条 */
function DeskTab({
  label,
  tone,
  href,
  onClick,
  loading,
}: {
  label: string
  tone: keyof typeof TAB_TONE
  href?: string
  onClick?: () => void
  loading?: boolean
}) {
  const inner = (
    <span
      className="flex h-44 w-14 flex-col items-center rounded-b-xl border border-edge/80 bg-white/55 pt-4 shadow-[0_10px_24px_-16px_rgba(46,58,52,0.4)] backdrop-blur-[2px] transition-all duration-200 group-hover:-translate-y-1 group-hover:bg-white/80 group-hover:shadow-[0_16px_32px_-16px_rgba(46,58,52,0.5)]"
      style={{ borderTop: `4px solid ${TAB_TONE[tone]}` }}
    >
      <span
        className="font-kai text-xl text-ink"
        style={{ writingMode: 'vertical-rl', letterSpacing: '0.35em' }}
      >
        {loading ? '进入中' : label}
      </span>
    </span>
  )

  if (onClick) {
    return (
      <motion.div variants={inkFadeIn}>
        <button
          onClick={onClick}
          disabled={loading}
          aria-label={label}
          className="group cursor-pointer disabled:opacity-50"
        >
          {inner}
        </button>
      </motion.div>
    )
  }
  return (
    <motion.div variants={inkFadeIn}>
      <Link href={href ?? '/poems'} aria-label={label} className="group cursor-pointer">
        {inner}
      </Link>
    </motion.div>
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
