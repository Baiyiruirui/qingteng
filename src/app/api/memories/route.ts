import { NextResponse } from 'next/server'
import { z } from 'zod'
import { clearShortTerm } from '@/ai/memory/short-term'
import { cleanupExpiredMemories } from '@/ai/memory/long-term'
import { clearManagedMemories, listManagedMemories } from '@/ai/memory/manage'
import {
  MEMORY_RETENTION_OPTIONS,
  type MemoryPreferences,
  type MemoryRetentionDays,
} from '@/ai/memory/preferences-policy'
import { getSession } from '@/lib/auth-server'
import { getMemoryPreferences, setMemoryPreferences } from '@/lib/memory-preferences'

export const runtime = 'nodejs'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(40).default(12),
  offset: z.coerce.number().int().min(0).max(5_000).default(0),
})

const preferencesSchema = z
  .object({
    memoryEnabled: z.boolean().optional(),
    retentionDays: z
      .number()
      .int()
      .refine(
        value => MEMORY_RETENTION_OPTIONS.includes(
          value as (typeof MEMORY_RETENTION_OPTIONS)[number],
        ),
        '不支持的保留期',
      )
      .optional(),
  })
  .refine(
    value => value.memoryEnabled !== undefined || value.retentionDays !== undefined,
    '至少需要更新一项设置',
  )

function unauthorized() {
  return NextResponse.json(
    { error: { code: 'UNAUTHORIZED', message: '请先登录' } },
    { status: 401 },
  )
}

function serverError() {
  return NextResponse.json(
    { error: { code: 'SERVER_ERROR', message: 'Memory 服务暂时不可用，请稍后再试' } },
    { status: 500 },
  )
}

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return unauthorized()

  const parsedQuery = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  )
  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: '分页参数不正确' } },
      { status: 400 },
    )
  }

  try {
    const preferences = await getMemoryPreferences(session.userId)
    const result = await listManagedMemories(session.userId, {
      ...parsedQuery.data,
      retentionDays: preferences.retentionDays,
    })
    return NextResponse.json({
      items: result.items,
      preferences,
      pagination: {
        limit: parsedQuery.data.limit,
        offset: parsedQuery.data.offset,
        total: result.total,
        hasMore: parsedQuery.data.offset + result.items.length < result.total,
      },
      retentionOptions: MEMORY_RETENTION_OPTIONS,
    })
  } catch (error) {
    console.error('[memories] list failed:', error)
    return serverError()
  }
}

export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session) return unauthorized()

  const parsedBody = preferencesSchema.safeParse(await request.json().catch(() => null))
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Memory 设置不正确' } },
      { status: 400 },
    )
  }

  try {
    const current = await getMemoryPreferences(session.userId)
    const next: MemoryPreferences = {
      memoryEnabled: parsedBody.data.memoryEnabled ?? current.memoryEnabled,
      retentionDays: (parsedBody.data.retentionDays
        ?? current.retentionDays) as MemoryRetentionDays,
    }
    const preferences = await setMemoryPreferences(session.userId, next)
    if (!preferences.memoryEnabled) {
      await clearShortTerm(session.userId)
    }
    const deletedExpired = await cleanupExpiredMemories(
      session.userId,
      preferences.retentionDays,
    )
    return NextResponse.json({ preferences, deletedExpired })
  } catch (error) {
    console.error('[memories] preferences update failed:', error)
    return serverError()
  }
}

export async function DELETE() {
  const session = await getSession()
  if (!session) return unauthorized()

  try {
    const deleted = await clearManagedMemories(session.userId)
    return NextResponse.json({ deleted, chatsDeleted: false })
  } catch (error) {
    console.error('[memories] clear failed:', error)
    return serverError()
  }
}
