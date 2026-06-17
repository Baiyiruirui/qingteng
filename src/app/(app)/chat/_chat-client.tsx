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
}

export default function ChatClient({ userName, conversationId, initialMessages }: Props) {
  const router = useRouter()
  const [input, setInput] = useState('')
  const [newConvLoading, setNewConvLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const transport = useMemo(
    () => new DefaultChatTransport({ body: { conversationId } }),
    [conversationId],
  )

  const { messages, status, sendMessage } = useChat({
    transport,
    messages: initialMessages,
  })

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
    <div
      className="flex flex-col min-h-screen"
      style={{ background: '#fafaf7', color: '#1a1a1a' }}
    >
      {/* Header */}
      <header
        className="flex items-center justify-between px-6 py-5 border-b"
        style={{ borderColor: '#e8e4dc' }}
      >
        <div className="flex-1" />
        <h1
          className="text-3xl font-serif tracking-widest"
          style={{ color: '#1a1a1a' }}
        >
          青藤
        </h1>
        <div className="flex-1 flex justify-end items-center gap-4">
          <span className="text-sm" style={{ color: '#8a8a8a' }}>
            你好,{userName}
          </span>
          <button
            onClick={handleNewConversation}
            disabled={newConvLoading}
            className="text-xs px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-40"
            style={{
              borderColor: '#d4cfc6',
              color: '#8a8a8a',
              background: 'transparent',
            }}
          >
            + 新对话
          </button>
          <button
            onClick={handleLogout}
            className="text-sm underline"
            style={{ color: '#aaa9a4' }}
          >
            登出
          </button>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto py-8">
        <div className="mx-auto max-w-[720px] px-4 space-y-8">
          {messages.length === 0 && (
            <p
              className="text-center font-serif mt-16 opacity-40"
              style={{ color: '#1a1a1a' }}
            >
              和青藤说说话吧
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
                    style={{ background: '#ede9e1', color: '#1a1a1a' }}
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
                  style={{ background: '#5e8b7e' }}
                >
                  青
                </div>
                <div
                  className="flex-1 text-sm leading-relaxed pt-1 whitespace-pre-wrap"
                  style={{ color: '#2a2a2a' }}
                >
                  {text}
                  {status === 'streaming' &&
                    m.id === messages[messages.length - 1]?.id && (
                      <span
                        className="inline-block w-0.5 h-4 ml-0.5 animate-pulse align-middle"
                        style={{ background: '#5e8b7e' }}
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
        style={{ background: '#fafaf7', borderColor: '#e8e4dc' }}
      >
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-[720px] px-4 flex gap-3 items-end"
        >
          <input
            className="flex-1 rounded-xl border px-4 py-3 text-sm outline-none transition-colors"
            style={{
              borderColor: '#d4cfc6',
              background: '#fff',
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
            placeholder="和青藤聊聊..."
            disabled={status !== 'ready'}
            autoFocus
          />
          <button
            type="submit"
            disabled={!input.trim() || status !== 'ready'}
            className="flex-shrink-0 px-5 py-3 rounded-xl text-sm font-medium transition-opacity disabled:opacity-40"
            style={{ background: '#1a1a1a', color: '#fafaf7' }}
          >
            发送
          </button>
        </form>
      </footer>
    </div>
  )
}
