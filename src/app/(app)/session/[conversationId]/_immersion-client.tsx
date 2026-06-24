'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { UIMessage } from 'ai'

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
  poemTitle: string
  poemAuthor: string
  poemLines: string[]
  role: string
}

export default function ImmersionClient({
  userName,
  conversationId,
  initialMessages,
  poemTitle,
  poemAuthor,
  poemLines,
  role,
}: Props) {
  const router = useRouter()
  const [input, setInput] = useState('')
  const [openingLoading, setOpeningLoading] = useState(false)
  const [showPoem, setShowPoem] = useState(false)
  const openingFetched = useRef(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const transport = useMemo(
    () => new DefaultChatTransport({
      api: '/api/session/immersion/chat',
      body: { conversationId },
    }),
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
    fetch('/api/session/immersion/opening', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.opening) {
          setMessages([{
            id: data.opening.id,
            role: 'assistant' as const,
            parts: [{ type: 'text' as const, text: data.opening.content }],
          }])
        }
      })
      .catch(e => console.error('[immersion opening] fetch failed:', e))
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

  const roleDisplay = role.replace(/^你是/, '').split(',')[0].trim()

  return (
    <div className="flex flex-col min-h-screen bg-qt-paper-alt text-qt-ink">
      {/* Header */}
      <header
        className="flex items-center justify-between px-6 py-4 border-b border-qt-border"
        style={{ background: 'rgba(242,237,224,0.95)', backdropFilter: 'blur(8px)', position: 'sticky', top: 0, zIndex: 10 }}
      >
        <div className="flex-1">
          <button
            onClick={() => setShowPoem(v => !v)}
            className="text-xs px-2.5 py-1 rounded-lg border border-qt-border text-qt-ink-mid transition-colors hover:bg-qt-paper"
            style={{ background: 'transparent' }}
          >
            {showPoem ? '收起原文' : '查看原文'}
          </button>
        </div>

        <div className="text-center">
          <h1 className="font-serif text-xl tracking-widest text-qt-ink">
            沉浸 · {poemTitle}
          </h1>
          <p className="text-xs mt-0.5 text-qt-ink-mid">
            {poemAuthor} · 你是{roleDisplay}
          </p>
        </div>

        <div className="flex-1 flex justify-end items-center gap-3">
          <span className="text-xs text-qt-ink-light">{userName}</span>
          <button
            onClick={() => router.push('/chat')}
            className="text-xs px-2.5 py-1 rounded-lg border border-qt-border text-qt-ink-mid transition-colors hover:bg-qt-paper"
            style={{ background: 'transparent' }}
          >
            结束沉浸
          </button>
        </div>
      </header>

      {/* 原文面板（可收折） */}
      {showPoem && (
        <div
          className="px-6 py-4 border-b border-qt-border"
          style={{ background: 'rgba(232,224,204,0.8)' }}
        >
          <div className="mx-auto max-w-180">
            <p className="text-xs mb-2 font-medium text-qt-ink-mid">
              《{poemTitle}》{poemAuthor}
            </p>
            <div className="space-y-1">
              {poemLines.map((line, i) => (
                <p key={i} className="text-sm font-serif tracking-wider text-qt-ink">
                  {line}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 消息区 */}
      <main className="flex-1 overflow-y-auto py-8">
        <div className="mx-auto max-w-180 px-4 space-y-8">
          {openingLoading && (
            <p className="text-center font-serif mt-16 opacity-40 text-qt-ink-light tracking-widest">
              青藤正在把你带入诗的情境…
            </p>
          )}

          {messages.map(m => {
            const text = getTextContent(m.parts as Array<{ type: string; text?: string }>)
            const isUser = m.role === 'user'

            if (isUser) {
              return (
                <div key={m.id} className="flex justify-end">
                  <div
                    className="max-w-[75%] rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed text-qt-ink"
                    style={{ background: 'var(--qt-border)' }}
                  >
                    {text}
                  </div>
                </div>
              )
            }

            return (
              <div key={m.id} className="flex items-start gap-3">
                <div
                  className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-serif font-medium select-none"
                  style={{ background: 'var(--qt-ink-mid)', color: '#fff' }}
                >
                  藤
                </div>
                <div className="flex-1 text-sm leading-relaxed pt-1 whitespace-pre-wrap text-qt-ink">
                  {text}
                  {status === 'streaming' &&
                    m.id === messages[messages.length - 1]?.id && (
                      <span
                        className="inline-block w-0.5 h-4 ml-0.5 animate-pulse align-middle"
                        style={{ background: 'var(--qt-ink-mid)' }}
                      />
                    )}
                </div>
              </div>
            )
          })}

          <div ref={bottomRef} />
        </div>
      </main>

      {/* 输入框 */}
      <footer
        className="sticky bottom-0 border-t border-qt-border py-4"
        style={{ background: 'rgba(242,237,224,0.95)', backdropFilter: 'blur(8px)' }}
      >
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-180 px-4 flex gap-3 items-end"
        >
          <input
            className="flex-1 rounded-xl border border-qt-border px-4 py-3 text-sm outline-none transition-colors text-qt-ink placeholder:text-qt-ink-light focus:border-qt-ink-mid"
            style={{ background: 'var(--qt-paper)' }}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e as unknown as React.FormEvent)
              }
            }}
            placeholder="说说你看见了什么，感受到什么…"
            disabled={status !== 'ready'}
            autoFocus
          />
          <button
            type="submit"
            disabled={!input.trim() || status !== 'ready'}
            className="shrink-0 px-5 py-3 rounded-xl font-serif text-sm tracking-[0.12em] transition-opacity disabled:opacity-40"
            style={{ background: 'var(--qt-ink-btn)', color: 'var(--qt-paper-alt)' }}
          >
            回应
          </button>
        </form>
      </footer>
    </div>
  )
}
