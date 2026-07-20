import { NextResponse } from 'next/server'
import { z } from 'zod'
import { correctManagedMemory, deleteManagedMemory } from '@/ai/memory/manage'
import { getSession } from '@/lib/auth-server'
import { checkRateLimits, rateLimitResponse } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const idSchema = z.string().uuid()
const correctionSchema = z.object({
  content: z.string().trim().min(8).max(120),
})

type RouteContext = { params: Promise<{ id: string }> }

function unauthorized() {
  return NextResponse.json(
    { error: { code: 'UNAUTHORIZED', message: '请先登录' } },
    { status: 401 },
  )
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getSession()
  if (!session) return unauthorized()

  const [params, body] = await Promise.all([
    context.params,
    request.json().catch(() => null),
  ])
  const parsedId = idSchema.safeParse(params.id)
  const parsedBody = correctionSchema.safeParse(body)
  if (!parsedId.success || !parsedBody.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_MEMORY', message: 'Memory 内容需为 8 至 120 个字符' } },
      { status: 400 },
    )
  }

  const rateLimit = await checkRateLimits({
    req: request,
    userId: session.userId,
    policies: [
      { scope: 'memory-edit-user-hour', identity: 'user', limit: 20, windowSeconds: 60 * 60 },
      { scope: 'memory-edit-ip-hour', identity: 'ip', limit: 40, windowSeconds: 60 * 60 },
    ],
  })
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit)

  try {
    const memory = await correctManagedMemory(
      session.userId,
      parsedId.data,
      parsedBody.data.content,
    )
    if (!memory) {
      return NextResponse.json(
        { error: { code: 'MEMORY_NOT_FOUND', message: '这条 Memory 不存在' } },
        { status: 404 },
      )
    }
    return NextResponse.json({ memory })
  } catch (error) {
    const invalidContent = error instanceof Error && error.message === 'INVALID_MEMORY_CONTENT'
    return NextResponse.json(
      {
        error: {
          code: invalidContent ? 'INVALID_MEMORY' : 'MEMORY_UPDATE_FAILED',
          message: invalidContent
            ? 'Memory 内容需为 8 至 120 个字符'
            : 'Memory 暂时无法纠正，请稍后再试',
        },
      },
      { status: invalidContent ? 400 : 503 },
    )
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const session = await getSession()
  if (!session) return unauthorized()

  const parsedId = idSchema.safeParse((await context.params).id)
  if (!parsedId.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_MEMORY_ID', message: 'Memory 标识不合法' } },
      { status: 400 },
    )
  }

  const rateLimit = await checkRateLimits({
    req: request,
    userId: session.userId,
    policies: [
      { scope: 'memory-delete-user-hour', identity: 'user', limit: 30, windowSeconds: 60 * 60 },
      { scope: 'memory-delete-ip-hour', identity: 'ip', limit: 60, windowSeconds: 60 * 60 },
    ],
  })
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit)

  try {
    const deleted = await deleteManagedMemory(session.userId, parsedId.data)
    if (!deleted) {
      return NextResponse.json(
        { error: { code: 'MEMORY_NOT_FOUND', message: '这条 Memory 不存在' } },
        { status: 404 },
      )
    }
    return NextResponse.json({ deleted: true, chatsDeleted: false })
  } catch {
    return NextResponse.json(
      { error: { code: 'MEMORY_DELETE_FAILED', message: 'Memory 暂时无法删除，请稍后再试' } },
      { status: 503 },
    )
  }
}
