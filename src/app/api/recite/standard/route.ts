import { createHash, randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getPoemForQuiz } from '@/db/repositories/poems'
import { buildTtsSegments, ReciteTargetError } from '@/ai/recite/target'
import { synthesizeRecitation, TencentTtsError } from '@/ai/recite/tencent-tts'
import { getSession } from '@/lib/auth-server'
import { checkRateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { redis } from '@/lib/redis'

export const runtime = 'nodejs'

const CACHE_SECONDS = 7 * 24 * 60 * 60
const memoryCache = new Map<string, { expiresAt: number; value: StandardAudioResponse }>()

const querySchema = z.object({
  poemId: z.string().min(1).max(64),
  mode: z.enum(['line', 'poem']).default('line'),
  lineIndex: z.coerce.number().int().min(0).max(200).default(0),
  partIndex: z.coerce.number().int().min(0).max(20).default(0),
})

const cachedResponseSchema = z.object({
  audioBase64: z.string().min(1).max(8_000_000),
  codec: z.literal('mp3'),
  pinyin: z.string().nullable(),
  text: z.string(),
  partIndex: z.number().int().nonnegative(),
  partCount: z.number().int().positive(),
  source: z.literal('tencent'),
})

type StandardAudioResponse = z.infer<typeof cachedResponseSchema>

function cacheKey(text: string) {
  const voiceType = process.env.TENCENT_TTS_VOICE_TYPE || 'default'
  const digest = createHash('sha256').update(`tts-v2:${voiceType}:-0.5:${text}`).digest('hex')
  return `qt:recite:tts:${digest}`
}

function redisConfigured() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
}

async function readCache(key: string): Promise<StandardAudioResponse | null> {
  const inMemory = memoryCache.get(key)
  if (inMemory && inMemory.expiresAt > Date.now()) return inMemory.value
  if (inMemory) memoryCache.delete(key)

  if (!redisConfigured()) return null
  try {
    const parsed = cachedResponseSchema.safeParse(await redis.get<unknown>(key))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

async function writeCache(key: string, value: StandardAudioResponse) {
  if (memoryCache.size >= 24) {
    const firstKey = memoryCache.keys().next().value
    if (firstKey) memoryCache.delete(firstKey)
  }
  memoryCache.set(key, { expiresAt: Date.now() + CACHE_SECONDS * 1000, value })

  if (!redisConfigured()) return
  try {
    await redis.set(key, value, { ex: CACHE_SECONDS })
  } catch {
    // Browser and process-local caching still keep the feature usable.
  }
}

function audioResponse(value: StandardAudioResponse) {
  return NextResponse.json(value, {
    headers: {
      'Cache-Control': 'private, max-age=86400',
      Vary: 'Cookie',
    },
  })
}

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }
  const rateLimit = await checkRateLimits({
    req,
    userId: session.userId,
    policies: [
      { scope: 'recite-tts-user-minute', identity: 'user', limit: 12, windowSeconds: 60 },
      { scope: 'recite-tts-user-hour', identity: 'user', limit: 80, windowSeconds: 60 * 60 },
      { scope: 'recite-tts-ip-hour', identity: 'ip', limit: 160, windowSeconds: 60 * 60 },
    ],
  })
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit, { errorShape: 'string' })
  }

  const url = new URL(req.url)
  const query = querySchema.safeParse(Object.fromEntries(url.searchParams))
  if (!query.success) {
    return NextResponse.json({ error: '朗读示范参数不完整' }, { status: 400 })
  }

  const poem = await getPoemForQuiz(query.data.poemId)
  if (!poem) return NextResponse.json({ error: '没有找到这首诗' }, { status: 404 })

  try {
    const segments = buildTtsSegments({
      lines: poem.lines,
      mode: query.data.mode,
      lineIndex: query.data.lineIndex,
    })
    const text = segments[query.data.partIndex]
    if (!text) {
      return NextResponse.json({ error: '朗读分段不存在' }, { status: 400 })
    }

    const key = cacheKey(text)
    const cached = await readCache(key)
    if (cached) {
      return audioResponse({
        ...cached,
        partIndex: query.data.partIndex,
        partCount: segments.length,
      })
    }

    const result = await synthesizeRecitation({ text, sessionId: randomUUID() })
    const value: StandardAudioResponse = {
      audioBase64: result.audioBase64,
      codec: result.codec,
      pinyin: result.pinyin,
      text,
      partIndex: query.data.partIndex,
      partCount: segments.length,
      source: 'tencent',
    }
    await writeCache(key, value)
    return audioResponse(value)
  } catch (error) {
    if (error instanceof ReciteTargetError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof TencentTtsError) {
      console.error('[recite-tts] Tencent TTS failed:', {
        code: error.code,
        requestId: error.requestId,
        message: error.message,
      })
      const status = error.code === 'CONFIG' ? 503 : error.code === 'TIMEOUT' ? 504 : 502
      return NextResponse.json(
        { error: '云端示范音暂时不可用，可改用设备朗读' },
        { status },
      )
    }
    console.error('[recite-tts] standard audio failed:', error)
    return NextResponse.json(
      { error: '示范音暂时不可用，可改用设备朗读' },
      { status: 500 },
    )
  }
}
