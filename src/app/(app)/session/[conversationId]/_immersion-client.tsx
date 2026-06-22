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

  // Fetch immersion opening on mount (only if conversation is empty)
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

  // Extract the role name for display (e.g., "你是李白" → "李白")
  const roleDisplay = role.replace(/^你是/, '').split(',')[0].trim()

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ background: '#f2ece0', color: '#1a1a1a' }}
    >
      {/* Header */}
      <header
        className="flex items-center justify-between px-6 py-4 border-b"
        style={{ borderColor: '#d8d0c0', background: '#ece5d4' }}
      >
        {/* Left: poem text toggle */}
        <div className="flex-1">
          <button
            onClick={() => setShowPoem(v => !v)}
            className="text-xs px-2.5 py-1 rounded-lg border transition-colors"
            style={{ borderColor: '#c8c0b0', color: '#6a6055', background: 'transparent' }}
          >
            {showPoem ? '收起原文' : '查看原文'}
          </button>
        </div>

        {/* Center: title */}
        <div className="text-center">
          <h1 className="text-xl font-serif tracking-widest" style={{ color: '#1a1a1a' }}>
            沉浸 · {poemTitle}
          </h1>
          <p className="text-xs mt-0.5" style={{ color: '#7a6e5f' }}>
            {poemAuthor} · 你是{roleDisplay}
          </p>
        </div>

        {/* Right: user + exit */}
        <div className="flex-1 flex justify-end items-center gap-3">
          <span className="text-xs" style={{ color: '#7a6e5f' }}>
            {userName}
          </span>
          <button
            onClick={() => router.push('/chat')}
            className="text-xs px-2.5 py-1 rounded-lg border transition-colors"
            style={{ borderColor: '#c8c0b0', color: '#6a6055', background: 'transparent' }}
          >
            结束沉浸
          </button>
        </div>
      </header>

      {/* Poem text panel (collapsible) */}
      {showPoem && (
        <div
          className="px-6 py-4 border-b"
          style={{ background: '#e8e0cc', borderColor: '#d8d0c0' }}
        >
          <div className="mx-auto max-w-[720px]">
            <p className="text-xs mb-2 font-medium" style={{ color: '#7a6e5f' }}>
              《{poemTitle}》{poemAuthor}
            </p>
            <div className="space-y-1">
              {poemLines.map((line, i) => (
                <p key={i} className="text-sm font-serif tracking-wider" style={{ color: '#3a3028' }}>
                  {line}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <main className="flex-1 overflow-y-auto py-8">
        <div className="mx-auto max-w-[720px] px-4 space-y-8">
          {openingLoading && (
            <p
              className="text-center font-serif mt-16 opacity-40"
              style={{ color: '#3a3028' }}
            >
              青藤正在把你带入诗的情境…
            </p>
          )}

          {messages.map(m => {
            const text = getTextContent(
              m.parts as Array<{ type: string; text?: string }>,
            )
            const isUser = m.role === 'user'

            if (isUser) {
              return (
                <div key={m.id} className="flex justify-end">
                  <div
                    className="max-w-[75%] rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed"
                    style={{ background: '#d8cdb8', color: '#1a1a1a' }}
                  >
                    {text}
                  </div>
                </div>
              )
            }

            return (
              <div key={m.id} className="flex items-start gap-3">
                <div
                  className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-serif font-medium text-white select-none"
                  style={{ background: '#7a6e5f' }}
                >
                  藤
                </div>
                <div
                  className="flex-1 text-sm leading-relaxed pt-1 whitespace-pre-wrap"
                  style={{ color: '#2a2218' }}
                >
                  {text}
                  {status === 'streaming' &&
                    m.id === messages[messages.length - 1]?.id && (
                      <span
                        className="inline-block w-0.5 h-4 ml-0.5 animate-pulse align-middle"
                        style={{ background: '#7a6e5f' }}
                      />
                    )}
                </div>
              </div>
            )
          })}

          <div ref={bottomRef} />
        </div>
      </main>

      {/* Input */}
      <footer
        className="sticky bottom-0 border-t py-4"
        style={{ background: '#f2ece0', borderColor: '#d8d0c0' }}
      >
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-[720px] px-4 flex gap-3 items-end"
        >
          <input
            className="flex-1 rounded-xl border px-4 py-3 text-sm outline-none transition-colors"
            style={{
              borderColor: '#c8c0b0',
              background: '#ece5d4',
              color: '#1a1a1a',
            }}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e as unknown as React.FormEvent)
              }
            }}
            placeholder="说说你看见了什么,感受到什么..."
            disabled={status !== 'ready'}
            autoFocus
          />
          <button
            type="submit"
            disabled={!input.trim() || status !== 'ready'}
            className="flex-shrink-0 px-5 py-3 rounded-xl text-sm font-medium transition-opacity disabled:opacity-40"
            style={{ background: '#5a5040', color: '#f5f0e8' }}
          >
            回应
          </button>
        </form>
      </footer>
    </div>
  )
}
