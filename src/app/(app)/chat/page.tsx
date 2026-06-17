'use client'

import { useChat } from '@ai-sdk/react'
import { useEffect, useRef, useState } from 'react'

function getTextContent(parts: Array<{ type: string; text?: string }>) {
  return parts
    .filter(p => p.type === 'text')
    .map(p => p.text ?? '')
    .join('')
}

export default function ChatPage() {
  const { messages, status, sendMessage } = useChat()
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

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

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ background: '#fafaf7', color: '#1a1a1a' }}
    >
      {/* Header */}
      <header
        className="text-center py-8 border-b"
        style={{ borderColor: '#e8e4dc' }}
      >
        <h1
          className="text-3xl font-serif tracking-widest"
          style={{ color: '#1a1a1a' }}
        >
          青藤
        </h1>
        <p className="text-sm mt-1" style={{ color: '#8a8a8a' }}>
          与一位 AI 诗友对话
        </p>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto py-8">
        <div className="mx-auto max-w-[720px] px-4 space-y-6">
          {messages.length === 0 && (
            <p
              className="text-center text-sm mt-16"
              style={{ color: '#aaa9a4' }}
            >
              试着问他一首诗，或者聊聊你今天的心情。
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
                {/* 青 avatar */}
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
            className="flex-1 rounded-xl border px-4 py-3 text-sm outline-none transition-colors resize-none"
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
