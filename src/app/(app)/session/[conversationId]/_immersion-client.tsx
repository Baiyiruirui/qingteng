'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { UIMessage } from 'ai'
import { AppNav } from '@/components/AppNav'
import { getPoemImage } from '@/lib/poem-images'

function getTextContent(parts: Array<{ type: string; text?: string }>) {
  return parts
    .filter(p => p.type === 'text')
    .map(p => p.text ?? '')
    .join('')
}

function chatErrorMessage(error: Error) {
  if (error.message.includes('429') || error.message.includes('RATE_LIMITED')) {
    return '这一程走得有些急了，稍等片刻再回应。'
  }
  return '诗境暂时没有回应，请稍后再试。'
}

type Props = {
  userName: string
  conversationId: string
  initialMessages: UIMessage[]
  poemId: string
  poemTitle: string
  poemAuthor: string
  poemLines: string[]
  role: string
}

export default function ImmersionClient({
  userName,
  conversationId,
  initialMessages,
  poemId,
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

  const { messages, status, sendMessage, setMessages, error, clearError } = useChat({
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
    if (!text || status === 'submitted' || status === 'streaming') return
    if (error) clearError()
    sendMessage({ text })
    setInput('')
  }

  const roleDisplay = role.replace(/^你是/, '').split(',')[0].trim()
  const sceneImage = getPoemImage(poemId)
  const busy = status === 'submitted' || status === 'streaming'

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <AppNav
        title={`诗境 · ${poemTitle}`}
        userName={userName}
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPoem(v => !v)}
              className="rounded-lg border border-edge px-2.5 py-1 text-xs text-ink-mid transition-colors hover:bg-paper-block"
            >
              {showPoem ? '收起原诗' : '展开原诗'}
            </button>
            <button
              onClick={() => router.push('/chat')}
              className="rounded-lg border border-edge px-2.5 py-1 text-xs text-ink-mid transition-colors hover:bg-paper-block"
            >
              结束沉浸
            </button>
          </div>
        }
      />

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-8 pt-5 lg:px-6">
        <section className="relative overflow-hidden rounded-2xl border border-edge bg-paper-block/70 shadow-[0_24px_70px_-42px_rgba(46,58,52,0.55)]">
          {sceneImage ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sceneImage}
                alt=""
                aria-hidden="true"
                className="h-52 w-full object-cover opacity-90 mix-blend-multiply sm:h-64 lg:h-72"
              />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(to top, rgba(247,244,236,0.98), rgba(247,244,236,0.18) 48%, transparent)',
                }}
              />
            </>
          ) : (
            <div className="h-44 bg-paper-block" />
          )}
          <div className="absolute inset-x-0 bottom-0 px-6 pb-6 sm:px-8">
            <p className="font-serif text-sm tracking-[0.24em] text-jade">诗境剧场</p>
            <h1 className="mt-2 font-kai text-[40px] leading-none text-ink sm:text-[52px]">
              《{poemTitle}》
            </h1>
            <p className="mt-3 text-sm text-ink-mid">
              {poemAuthor} · 此刻你是：{roleDisplay}
            </p>
          </div>
        </section>

        <section className="grid flex-1 gap-4 py-5 lg:grid-cols-[220px_minmax(0,1fr)_260px]">
          <aside className="space-y-4">
            <div className="rounded-xl border border-edge bg-white/55 p-4">
              <p className="font-serif text-xs tracking-[0.2em] text-ink-faint">身份牌</p>
              <p className="mt-3 font-kai text-3xl text-ink">{roleDisplay}</p>
              <p className="mt-3 text-sm leading-7 text-ink-mid">
                不急着答题。先看见、听见、走近诗里的人，再把感受说出来。
              </p>
            </div>
            <div className="rounded-xl border border-edge bg-paper-block/70 p-4">
              <p className="font-serif text-xs tracking-[0.2em] text-ink-faint">青藤提示</p>
              <p className="mt-3 text-sm leading-7 text-ink-mid">
                可以从一句景、一种声音，或一个动作开始回应。
              </p>
            </div>
          </aside>

          <section className="min-h-[520px] rounded-xl border border-edge bg-white/62 p-4 shadow-[0_18px_60px_-48px_rgba(46,58,52,0.7)] sm:p-6">
            <div className="mb-5 flex items-center justify-between border-b border-edge pb-3">
              <div>
                <p className="font-serif text-sm tracking-[0.2em] text-ink">对白</p>
                <p className="mt-1 text-xs text-ink-faint">青藤会扮演诗中角色，也会在必要时轻轻点拨。</p>
              </div>
              <span className="rounded-full bg-paper-block px-2.5 py-1 text-xs text-ink-faint">
                {status === 'streaming' ? '入境中' : '可回应'}
              </span>
            </div>

            <div className="space-y-6">
              {openingLoading && (
                <p className="py-16 text-center font-serif tracking-widest text-ink-faint opacity-55">
                  青藤正在把你带入诗的情境...
                </p>
              )}

              {messages.map(m => {
                const text = getTextContent(m.parts as Array<{ type: string; text?: string }>)
                const isUser = m.role === 'user'

                return (
                  <div key={m.id} className={isUser ? 'flex justify-end' : 'flex justify-start'}>
                    <div
                      className={
                        isUser
                          ? 'max-w-[82%] rounded-xl border border-edge bg-paper-block/80 px-4 py-3 text-sm leading-7 text-ink'
                          : 'max-w-[86%] border-l-2 border-cinnabar/55 bg-transparent py-1 pl-4 text-sm leading-8 text-ink'
                      }
                    >
                      <p className="mb-1 font-serif text-xs tracking-[0.16em] text-ink-faint">
                        {isUser ? '你' : roleDisplay || '青藤'}
                      </p>
                      <div className="whitespace-pre-wrap">
                        {text}
                        {status === 'streaming' &&
                          m.id === messages[messages.length - 1]?.id && (
                            <span
                              className="ml-0.5 inline-block h-4 w-0.5 animate-pulse align-middle"
                              style={{ background: 'var(--qt-ink-mid)' }}
                            />
                          )}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>
          </section>

          <aside
            className={
              showPoem
                ? 'rounded-xl border border-edge bg-paper-block/70 p-5'
                : 'hidden rounded-xl border border-edge bg-paper-block/70 p-5 lg:block'
            }
          >
            <p className="text-center font-serif text-xs tracking-[0.22em] text-ink-faint">
              原诗
            </p>
            <div className="mt-5 flex min-h-80 justify-center gap-4 overflow-x-auto font-serif text-lg leading-loose tracking-[0.18em] text-ink [writing-mode:vertical-rl]">
              {poemLines.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </aside>
        </section>
      </main>

      <footer className="sticky bottom-0 border-t border-edge bg-paper/92 py-4 backdrop-blur">
        {error && (
          <p className="mx-auto mb-2 max-w-4xl px-4 text-xs text-cinnabar">
            {chatErrorMessage(error)}
          </p>
        )}
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex max-w-4xl items-end gap-3 px-4"
        >
          <input
            className="flex-1 rounded-xl border border-edge bg-white/80 px-4 py-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-jade"
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
            placeholder="说说你看见了什么，感受到什么..."
            disabled={busy}
            autoFocus
          />
          <button
            type="submit"
            disabled={!input.trim() || busy}
            className="shrink-0 rounded-xl px-5 py-3 font-serif text-sm tracking-[0.12em] text-paper-block transition-opacity disabled:opacity-40"
            style={{ background: 'var(--qt-ink-btn)' }}
          >
            回应
          </button>
        </form>
      </footer>
    </div>
  )
}
