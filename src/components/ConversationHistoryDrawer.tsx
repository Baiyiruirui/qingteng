'use client'

import Link from 'next/link'
import { BookOpenText, Feather, LoaderCircle, MessageCircle, RotateCw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { withReturnTo } from '@/lib/navigation'

type ConversationHistoryItem = {
  id: string
  mode: string
  poemTitle: string | null
  title: string
  preview: string
  messageCount: number
  createdAt: string | null
}

function modeDetails(mode: string) {
  if (mode === 'roleplay') return { label: '诗境沉浸', Icon: BookOpenText }
  if (mode === 'creative') return { label: '共写', Icon: Feather }
  return { label: '日常对话', Icon: MessageCircle }
}

function formatDate(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function ConversationHistoryDrawer({
  open,
  currentConversationId,
  onClose,
}: {
  open: boolean
  currentConversationId: string
  onClose: () => void
}) {
  const [items, setItems] = useState<ConversationHistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!open) return

    const controller = new AbortController()
    setLoading(true)
    setError(false)
    fetch('/api/conversations?limit=24', { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('history request failed')
        return response.json() as Promise<{ items?: ConversationHistoryItem[] }>
      })
      .then(data => setItems(data.items ?? []))
      .catch(fetchError => {
        if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return
        setError(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [open, reloadKey])

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="conversation-history-title">
      <button
        type="button"
        aria-label="关闭历史对话"
        className="absolute inset-0 cursor-default bg-ink/20 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-[26rem] flex-col border-l border-edge bg-paper shadow-2xl">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-edge px-5">
          <div>
            <h2 id="conversation-history-title" className="font-serif text-base font-semibold text-ink">旧日对话</h2>
            <p className="mt-0.5 text-xs text-ink-faint">回到曾经读诗和交谈的地方</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            title="关闭"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-faint outline-none transition-colors hover:bg-paper-block hover:text-ink focus-visible:ring-2 focus-visible:ring-jade/55"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-44 items-center justify-center text-ink-faint" aria-label="正在载入历史对话">
              <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
            </div>
          ) : error ? (
            <div className="flex h-44 flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm text-ink-mid">旧日对话暂时没有展开。</p>
              <button
                type="button"
                onClick={() => setReloadKey(key => key + 1)}
                aria-label="重新载入"
                title="重新载入"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-edge text-ink-mid outline-none transition-colors hover:bg-paper-block hover:text-ink focus-visible:ring-2 focus-visible:ring-jade/55"
              >
                <RotateCw className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-44 items-center justify-center px-8 text-center text-sm leading-6 text-ink-faint">
              第一段对话写下后，会在这里留下书签。
            </div>
          ) : (
            <ul>
              {items.map(item => {
                const { label, Icon } = modeDetails(item.mode)
                const current = item.id === currentConversationId
                const href = current ? '/chat' : withReturnTo(`/session/${item.id}`, '/chat')

                return (
                  <li key={item.id} className="border-b border-edge/80">
                    <Link
                      href={href}
                      onClick={onClose}
                      className="group block px-5 py-4 outline-none transition-colors hover:bg-paper-block/70 focus-visible:bg-paper-block focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-jade/55"
                    >
                      <div className="flex items-center gap-2 text-[11px] text-ink-faint">
                        <Icon className="h-3.5 w-3.5 text-jade" aria-hidden="true" />
                        <span>{label}</span>
                        {item.poemTitle && <span>·《{item.poemTitle}》</span>}
                        <time className="ml-auto shrink-0" dateTime={item.createdAt ?? undefined}>{formatDate(item.createdAt)}</time>
                      </div>
                      <div className="mt-2 flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate font-serif text-sm font-semibold text-ink group-hover:text-jade">{item.title}</h3>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink-mid">{item.preview}</p>
                        </div>
                        {current && (
                          <span className="mt-0.5 shrink-0 border-l-2 border-cinnabar pl-2 text-[11px] text-cinnabar">当前</span>
                        )}
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  )
}
