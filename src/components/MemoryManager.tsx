'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Brain,
  Check,
  ChevronDown,
  LoaderCircle,
  PauseCircle,
  Pencil,
  PlayCircle,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import type {
  MemoryPreferences,
  MemoryRetentionDays,
} from '@/ai/memory/preferences-policy'

type MemoryItem = {
  id: string
  content: string
  source: string | null
  weight: number | null
  createdAt: string | null
}

type MemoryListResponse = {
  items: MemoryItem[]
  preferences: MemoryPreferences
  pagination: {
    limit: number
    offset: number
    total: number
    hasMore: boolean
  }
  retentionOptions: MemoryRetentionDays[]
}

const RETENTION_LABELS: Record<MemoryRetentionDays, string> = {
  30: '最近 30 天',
  90: '最近 90 天',
  180: '最近半年',
  365: '最近一年',
}

const SOURCE_LABELS: Record<string, string> = {
  preference: '偏好',
  emotion: '情绪',
  confusion: '困惑',
  personal: '个人片段',
}

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null) as T & {
    error?: { message?: string }
  }
  if (!response.ok) {
    throw new Error(data?.error?.message ?? '操作没有完成，请稍后再试')
  }
  return data
}

function formatMemoryDate(value: string | null): string {
  if (!value) return '时间未知'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间未知'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

export function MemoryManager() {
  const [items, setItems] = useState<MemoryItem[]>([])
  const [preferences, setPreferences] = useState<MemoryPreferences | null>(null)
  const [retentionOptions, setRetentionOptions] = useState<MemoryRetentionDays[]>([30, 90, 180, 365])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [settingsPending, setSettingsPending] = useState(false)

  const loadMemories = useCallback(async (offset = 0) => {
    offset === 0 ? setLoading(true) : setLoadingMore(true)
    setError(null)
    try {
      const data = await readJson<MemoryListResponse>(
        await fetch(`/api/memories?limit=40&offset=${offset}`, { cache: 'no-store' }),
      )
      setItems(current => offset === 0 ? data.items : [...current, ...data.items])
      setPreferences(data.preferences)
      setRetentionOptions(data.retentionOptions)
      setTotal(data.pagination.total)
      setHasMore(data.pagination.hasMore)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Memory 暂时无法读取')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    void loadMemories()
  }, [loadMemories])

  async function updatePreferences(patch: Partial<MemoryPreferences>) {
    if (!preferences || settingsPending) return
    setSettingsPending(true)
    setError(null)
    setNotice(null)
    try {
      const data = await readJson<{ preferences: MemoryPreferences }>(
        await fetch('/api/memories', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        }),
      )
      setPreferences(data.preferences)
      setNotice(data.preferences.memoryEnabled
        ? '青藤会继续使用新的对话形成 Memory。'
        : 'Memory 已暂停，已有内容仍可查看和管理。')
      if (patch.retentionDays) await loadMemories()
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Memory 设置没有保存')
    } finally {
      setSettingsPending(false)
    }
  }

  async function handleRetentionChange(next: MemoryRetentionDays) {
    if (!preferences || next === preferences.retentionDays) return
    if (next < preferences.retentionDays) {
      const confirmed = window.confirm(
        `改为“${RETENTION_LABELS[next]}”后，更早的长期 Memory 会立即删除，原聊天不会删除。是否继续？`,
      )
      if (!confirmed) return
    }
    await updatePreferences({ retentionDays: next })
  }

  function startEditing(item: MemoryItem) {
    setEditingId(item.id)
    setEditingContent(item.content)
    setConfirmDeleteId(null)
    setNotice(null)
  }

  async function saveCorrection(memoryId: string) {
    const content = editingContent.trim()
    if (content.length < 8 || content.length > 120) {
      setError('Memory 内容需为 8 至 120 个字符')
      return
    }

    setPendingId(memoryId)
    setError(null)
    try {
      const data = await readJson<{ memory: MemoryItem }>(
        await fetch(`/api/memories/${memoryId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        }),
      )
      setItems(current => current.map(item => item.id === memoryId ? data.memory : item))
      setEditingId(null)
      setEditingContent('')
      setNotice('这条 Memory 已纠正，语义索引也已更新。')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Memory 没有保存')
    } finally {
      setPendingId(null)
    }
  }

  async function deleteMemory(memoryId: string) {
    setPendingId(memoryId)
    setError(null)
    try {
      await readJson<{ deleted: true }>(
        await fetch(`/api/memories/${memoryId}`, { method: 'DELETE' }),
      )
      setItems(current => current.filter(item => item.id !== memoryId))
      setTotal(current => Math.max(0, current - 1))
      setConfirmDeleteId(null)
      setNotice('这条长期 Memory 已删除，原聊天仍然保留。')
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Memory 没有删除')
    } finally {
      setPendingId(null)
    }
  }

  async function clearAllMemories() {
    setSettingsPending(true)
    setError(null)
    try {
      const data = await readJson<{ deleted: number; chatsDeleted: false }>(
        await fetch('/api/memories', { method: 'DELETE' }),
      )
      setItems([])
      setTotal(0)
      setHasMore(false)
      setConfirmClear(false)
      setNotice(`已清空 ${data.deleted} 条长期 Memory，原聊天和学习记录没有删除。`)
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : '长期 Memory 没有清空')
    } finally {
      setSettingsPending(false)
    }
  }

  return (
    <section className="border-y border-edge bg-paper-block/45 py-6 sm:px-6">
      <div className="px-4 sm:px-0">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-jade" aria-hidden="true" />
              <p className="text-xs tracking-[0.2em] text-cinnabar">MEMORY CONTROL</p>
            </div>
            <h2 className="mt-2 font-serif text-2xl text-ink">青藤记得的我</h2>
            <p className="mt-2 text-sm leading-7 text-ink-mid">
              这些是从相处中提炼出的长期 Memory，不是原聊天。纠正、删除或清空这里的内容，
              都不会删除你的对话和学习记录。
            </p>
          </div>

          {preferences && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="inline-flex min-h-10 items-center gap-3 border border-edge bg-paper px-3 text-sm text-ink">
                {preferences.memoryEnabled
                  ? <PlayCircle className="h-4 w-4 text-jade" aria-hidden="true" />
                  : <PauseCircle className="h-4 w-4 text-cinnabar" aria-hidden="true" />}
                <span>{preferences.memoryEnabled ? 'Memory 已开启' : 'Memory 已暂停'}</span>
                <input
                  type="checkbox"
                  checked={preferences.memoryEnabled}
                  disabled={settingsPending}
                  onChange={event => void updatePreferences({ memoryEnabled: event.target.checked })}
                  className="h-4 w-4 accent-jade"
                  aria-label="允许青藤使用和形成 Memory"
                />
              </label>

              <label className="relative inline-flex min-h-10 items-center gap-2 border border-edge bg-paper px-3 text-sm text-ink">
                <span className="text-ink-faint">保留</span>
                <select
                  value={preferences.retentionDays}
                  disabled={settingsPending}
                  onChange={event => void handleRetentionChange(Number(event.target.value) as MemoryRetentionDays)}
                  className="appearance-none bg-transparent pr-6 outline-none"
                  aria-label="Memory 保留期限"
                >
                  {retentionOptions.map(days => (
                    <option key={days} value={days}>{RETENTION_LABELS[days]}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 h-4 w-4 text-ink-faint" aria-hidden="true" />
              </label>
            </div>
          )}
        </div>

        {(error || notice) && (
          <div
            role="status"
            className={`mt-4 border px-3 py-2 text-sm ${
              error
                ? 'border-cinnabar/35 bg-cinnabar/5 text-cinnabar'
                : 'border-jade/35 bg-jade/5 text-ink-mid'
            }`}
          >
            {error ?? notice}
          </div>
        )}

        {preferences && !preferences.memoryEnabled && (
          <div className="mt-4 border-y border-cinnabar/20 bg-cinnabar/5 px-3 py-3 text-sm leading-6 text-ink-mid">
            暂停期间，青藤不会读取、注入或新增任何长短期 Memory。重新开启后，现有长期 Memory 会继续保留到设定期限。
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-4 border-b border-edge pb-3">
          <p className="text-sm text-ink-mid">
            长期 Memory <span className="font-medium text-ink">{total}</span> 条
          </p>
          {total > 0 && !confirmClear && (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="inline-flex items-center gap-2 text-sm text-cinnabar transition-opacity hover:opacity-70"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              清空长期 Memory
            </button>
          )}
          {confirmClear && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="text-xs text-cinnabar">原聊天保留，长期 Memory 将全部删除</span>
              <button
                type="button"
                disabled={settingsPending}
                onClick={() => void clearAllMemories()}
                className="inline-flex h-8 items-center gap-1 bg-cinnabar px-3 text-xs text-paper disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                确认清空
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="inline-flex h-8 items-center gap-1 border border-edge px-3 text-xs text-ink-mid"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                取消
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-ink-faint">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            正在翻阅 Memory
          </div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center">
            <p className="font-serif text-lg text-ink">这里还没有长期 Memory</p>
            <p className="mt-2 text-sm text-ink-faint">
              {preferences?.memoryEnabled
                ? '继续和青藤聊诗，值得留下的偏好与感受会慢慢出现。'
                : 'Memory 目前暂停；重新开启后，青藤才会继续形成新的记忆。'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-edge">
            {items.map(item => (
              <article key={item.id} className="py-4">
                {editingId === item.id ? (
                  <div className="space-y-3">
                    <textarea
                      value={editingContent}
                      onChange={event => setEditingContent(event.target.value)}
                      maxLength={120}
                      rows={3}
                      className="w-full resize-y border border-edge bg-paper px-3 py-2 text-sm leading-7 text-ink outline-none focus:border-jade"
                      aria-label="纠正 Memory 内容"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-xs text-ink-faint">{editingContent.trim().length}/120 · 保存时会更新语义索引</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={pendingId === item.id}
                          onClick={() => void saveCorrection(item.id)}
                          className="inline-flex h-8 items-center gap-1 bg-ink px-3 text-xs text-paper disabled:opacity-50"
                        >
                          {pendingId === item.id
                            ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            : <Save className="h-3.5 w-3.5" aria-hidden="true" />}
                          保存纠正
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="inline-flex h-8 items-center gap-1 border border-edge px-3 text-xs text-ink-mid"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                          取消
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                        <span className="border border-edge bg-paper px-2 py-0.5 text-ink-mid">
                          {SOURCE_LABELS[item.source ?? ''] ?? '相处片段'}
                        </span>
                        <time dateTime={item.createdAt ?? undefined}>{formatMemoryDate(item.createdAt)}</time>
                      </div>
                      <p className="mt-2 text-sm leading-7 text-ink">{item.content}</p>
                    </div>

                    {confirmDeleteId === item.id ? (
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          disabled={pendingId === item.id}
                          onClick={() => void deleteMemory(item.id)}
                          className="inline-flex h-8 items-center gap-1 bg-cinnabar px-3 text-xs text-paper disabled:opacity-50"
                        >
                          {pendingId === item.id
                            ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                          确认删除
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="inline-flex h-8 items-center border border-edge px-2 text-ink-mid"
                          aria-label="取消删除"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => startEditing(item)}
                          className="inline-flex h-8 w-8 items-center justify-center text-ink-mid transition-colors hover:bg-paper hover:text-ink"
                          title="纠正这条 Memory"
                          aria-label="纠正这条 Memory"
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(item.id)}
                          className="inline-flex h-8 w-8 items-center justify-center text-ink-faint transition-colors hover:bg-cinnabar/5 hover:text-cinnabar"
                          title="删除这条 Memory"
                          aria-label="删除这条 Memory"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        {hasMore && (
          <div className="border-t border-edge pt-4 text-center">
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void loadMemories(items.length)}
              className="inline-flex h-9 items-center gap-2 border border-edge bg-paper px-4 text-sm text-ink-mid transition-colors hover:text-ink disabled:opacity-50"
            >
              {loadingMore && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
              继续展开
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
