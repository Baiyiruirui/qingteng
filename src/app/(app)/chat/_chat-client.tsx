'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
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

  return (
    <div className="flex flex-col min-h-screen bg-qt-paper text-qt-ink">
      {/* Header */}
      <header
        className="flex items-center justify-between px-6 py-5 border-b border-qt-border"
        style={{ background: 'rgba(247,244,236,0.92)', backdropFilter: 'blur(8px)', position: 'sticky', top: 0, zIndex: 10 }}
      >
        <div className="flex-1">
          {sessionMode && sessionMode !== 'chat' ? (
            <Link href="/poems" className="text-sm text-qt-ink-light hover:text-qt-ink transition-colors">
              ← 诗库
            </Link>
          ) : (
            <Link href="/poems" className="text-sm text-qt-ink-light hover:text-qt-ink transition-colors">
              诗库
            </Link>
          )}
        </div>

        <div className="text-center">
          <h1 className="font-serif text-[1.75rem] tracking-[0.22em] text-qt-ink">青藤</h1>
          {sessionMode && sessionMode !== 'chat' && (
            <p className="text-xs mt-0.5 text-qt-ink-light">
              {sessionMode === 'roleplay' ? '沉浸模式' : '协同创作'}
              {sessionPoemTitle ? ` · ${sessionPoemTitle}` : ''}
            </p>
          )}
        </div>

        <div className="flex-1 flex justify-end items-center gap-4">
          <span className="text-sm text-qt-ink-light">你好，{userName}</span>
          {(!sessionMode || sessionMode === 'chat') && (
            <button
              onClick={handleNewConversation}
              disabled={newConvLoading}
              className="text-xs px-2.5 py-1 rounded-lg border border-qt-border text-qt-ink-light transition-opacity disabled:opacity-40 hover:opacity-70"
              style={{ background: 'transparent' }}
            >
              + 新对话
            </button>
          )}
          <button
            onClick={handleLogout}
            className="text-sm text-qt-ink-light hover:text-qt-ink transition-colors underline underline-offset-2"
          >
            登出
          </button>
        </div>
      </header>

      {/* 消息区 */}
      <main className="flex-1 overflow-y-auto py-8">
        <div className="mx-auto max-w-180 px-4 space-y-8">
          {openingLoading && (
            <p className="text-center font-serif mt-16 opacity-30 text-qt-ink-light tracking-widest">
              青藤正在准备打招呼…
            </p>
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
                  <div
                    className="max-w-[75%] rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed text-qt-ink"
                    style={{ background: 'var(--qt-paper-alt)' }}
                  >
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
                {/* 青藤头像 */}
                <div
                  className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-serif font-medium select-none"
                  style={{ background: 'var(--qt-green)', color: '#fff' }}
                >
                  青
                </div>
                <div className="flex-1 text-sm leading-relaxed pt-1 whitespace-pre-wrap text-qt-ink">
                  {text}
                  {status === 'streaming' && i === messages.length - 1 && (
                    <span
                      className="inline-block w-0.5 h-4 ml-0.5 animate-pulse align-middle"
                      style={{ background: 'var(--qt-green)' }}
                    />
                  )}
                </div>
              </motion.div>
            )
          })}

          <div ref={bottomRef} />
        </div>
      </main>

      {/* 输入框 */}
      <footer
        className="sticky bottom-0 border-t border-qt-border py-4"
        style={{ background: 'rgba(247,244,236,0.95)', backdropFilter: 'blur(8px)' }}
      >
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-180 px-4 flex gap-3 items-end"
        >
          <input
            className="flex-1 rounded-xl border border-qt-border px-4 py-3 text-sm outline-none transition-colors bg-white text-qt-ink placeholder:text-qt-ink-light focus:border-qt-green"
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
            className="shrink-0 px-5 py-3 rounded-xl font-serif text-sm tracking-[0.12em] transition-opacity disabled:opacity-40"
            style={{ background: 'var(--qt-ink-btn)', color: 'var(--qt-paper-alt)' }}
          >
            发
          </button>
        </form>
      </footer>
    </div>
  )
}
