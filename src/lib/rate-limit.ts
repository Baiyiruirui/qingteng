import 'server-only'

import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { redis } from '@/lib/redis'

export type RateLimitPolicy = {
  scope: string
  identity: 'user' | 'ip'
  limit: number
  windowSeconds: number
}

type PolicyDecision = {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
  retryAfterSeconds: number
  scope: string
}

export type RateLimitDecision = PolicyDecision & {
  unavailable?: boolean
}

export const PUBLIC_AI_BUDGET_POLICIES: RateLimitPolicy[] = [
  { scope: 'ai-user-hour', identity: 'user', limit: 60, windowSeconds: 60 * 60 },
  { scope: 'ai-ip-hour', identity: 'ip', limit: 120, windowSeconds: 60 * 60 },
]

let didWarnUnavailable = false

function isEnabled() {
  return process.env.NODE_ENV === 'production' || process.env.QT_RATE_LIMIT_ENABLED === 'true'
}

function clientIp(req: Request) {
  const forwarded =
    req.headers.get('x-vercel-forwarded-for') ??
    req.headers.get('x-forwarded-for') ??
    req.headers.get('x-real-ip')
  const ip = forwarded?.split(',')[0]?.trim()
  return (ip || 'unknown').slice(0, 128)
}

function hashIdentity(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 24)
}

function safeScope(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9:_-]/g, '_').slice(0, 64)
}

async function consumePolicy(
  policy: RateLimitPolicy,
  identifier: string,
  nowSeconds: number,
): Promise<PolicyDecision> {
  const bucket = Math.floor(nowSeconds / policy.windowSeconds)
  const resetAt = (bucket + 1) * policy.windowSeconds
  const key = `qt:rl:${safeScope(policy.scope)}:${hashIdentity(identifier)}:${bucket}`
  const count = await redis.incr(key)

  if (count === 1) {
    await redis.expire(key, policy.windowSeconds * 2)
  }

  return {
    allowed: count <= policy.limit,
    limit: policy.limit,
    remaining: Math.max(policy.limit - count, 0),
    resetAt,
    retryAfterSeconds: Math.max(resetAt - nowSeconds, 1),
    scope: policy.scope,
  }
}

export async function checkRateLimits({
  req,
  userId,
  policies,
}: {
  req: Request
  userId?: string
  policies: RateLimitPolicy[]
}): Promise<RateLimitDecision> {
  const nowSeconds = Math.floor(Date.now() / 1000)
  const fallback: RateLimitDecision = {
    allowed: true,
    limit: 0,
    remaining: 0,
    resetAt: nowSeconds,
    retryAfterSeconds: 0,
    scope: 'disabled',
  }

  if (!isEnabled() || policies.length === 0) return fallback

  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return {
      ...fallback,
      allowed: false,
      unavailable: true,
      retryAfterSeconds: 30,
      scope: 'redis-configuration',
    }
  }

  const ip = clientIp(req)

  try {
    const decisions = await Promise.all(
      policies.map(policy => {
        const identifier = policy.identity === 'user' && userId
          ? `user:${userId}`
          : `ip:${ip}`
        return consumePolicy(policy, identifier, nowSeconds)
      }),
    )

    return decisions.find(decision => !decision.allowed) ?? decisions[0] ?? fallback
  } catch {
    if (!didWarnUnavailable) {
      didWarnUnavailable = true
      console.error('[rate-limit] Redis unavailable; protected request denied')
    }
    return {
      ...fallback,
      allowed: false,
      unavailable: true,
      retryAfterSeconds: 30,
      scope: 'redis-unavailable',
    }
  }
}

export function rateLimitResponse(
  decision: RateLimitDecision,
  options: {
    message?: string
    errorShape?: 'object' | 'string'
  } = {},
) {
  const status = decision.unavailable ? 503 : 429
  const message = decision.unavailable
    ? '服务保护暂时不可用，请稍后再试'
    : options.message ?? '今天的访问有些频繁，请稍后再试'
  const code = decision.unavailable ? 'RATE_LIMIT_UNAVAILABLE' : 'RATE_LIMITED'
  const error = options.errorShape === 'string' ? message : { code, message }

  return NextResponse.json(
    { error, code, retryAfterSeconds: decision.retryAfterSeconds },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'Retry-After': String(decision.retryAfterSeconds),
        'X-RateLimit-Limit': String(decision.limit),
        'X-RateLimit-Remaining': String(decision.remaining),
        'X-RateLimit-Reset': String(decision.resetAt),
      },
    },
  )
}
