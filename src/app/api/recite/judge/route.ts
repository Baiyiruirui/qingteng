import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth-server'
import { getPoemForQuiz } from '@/db/repositories/poems'
import { recordEvent } from '@/db/repositories/events'
import { scoreRecitation } from '@/ai/recite/score'
import { ReciteTargetError, resolveReciteTarget } from '@/ai/recite/target'
import { recognizeSentence, TencentAsrError } from '@/ai/recite/tencent-asr'
import { checkRateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { estimateBase64Bytes } from '@/lib/request-limits'

export const runtime = 'nodejs'

const MAX_AUDIO_BYTES = 2_500_000
const MAX_BASE64_CHARS = Math.ceil((MAX_AUDIO_BYTES * 4) / 3) + 4

const requestSchema = z.object({
  poemId: z.string().min(1).max(64),
  mode: z.enum(['line', 'poem']).default('line'),
  lineIndex: z.number().int().min(0).max(200).default(0),
  audioBase64: z.string().min(1).max(MAX_BASE64_CHARS),
  audioBytes: z.number().int().positive().max(MAX_AUDIO_BYTES),
  voiceFormat: z.enum(['wav']).optional(),
})

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }

  const rateLimit = await checkRateLimits({
    req,
    userId: session.userId,
    policies: [
      { scope: 'recite-user-minute', identity: 'user', limit: 4, windowSeconds: 60 },
      { scope: 'recite-user-hour', identity: 'user', limit: 20, windowSeconds: 60 * 60 },
      { scope: 'recite-ip-hour', identity: 'ip', limit: 40, windowSeconds: 60 * 60 },
    ],
  })
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit, { errorShape: 'string' })
  }

  const parsedBody = requestSchema.safeParse(await req.json().catch(() => null))
  if (!parsedBody.success) {
    return NextResponse.json({ error: '朗读参数或录音数据不完整' }, { status: 400 })
  }
  const body = parsedBody.data
  const actualAudioBytes = estimateBase64Bytes(body.audioBase64)
  if (actualAudioBytes <= 0 || actualAudioBytes > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: '录音太长，请缩短后再试' }, { status: 413 })
  }

  const poem = await getPoemForQuiz(body.poemId)
  if (!poem) {
    return NextResponse.json({ error: 'Poem not found' }, { status: 404 })
  }

  try {
    const target = resolveReciteTarget({
      lines: poem.lines,
      mode: body.mode,
      lineIndex: body.lineIndex,
    })
    const asr = await recognizeSentence({
      audioBase64: body.audioBase64,
      audioBytes: actualAudioBytes,
      voiceFormat: body.voiceFormat ?? 'wav',
      userAudioKey: `${session.userId}-${body.poemId}-${randomUUID()}`,
    })
    const score = scoreRecitation({ expectedText: target.expectedText, transcript: asr.transcript })

    await recordEvent({
      userId: session.userId,
      type: 'recite',
      poemId: poem.id,
      score: score.accuracy,
      meta: {
        provider: 'tencent-asr',
        transcript: asr.transcript,
        matchedChars: score.matchedChars,
        totalChars: score.totalChars,
        audioDuration: asr.audioDuration,
        requestId: asr.requestId,
        mode: target.mode,
        lineIndex: target.lineIndex,
      },
    })

    return NextResponse.json({
      transcript: asr.transcript,
      audioDuration: asr.audioDuration,
      accuracy: score.accuracy,
      matchedChars: score.matchedChars,
      totalChars: score.totalChars,
      missingChars: score.missingChars,
      extraChars: score.extraChars,
      feedback: score.feedback,
    })
  } catch (error) {
    if (error instanceof ReciteTargetError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof TencentAsrError) {
      console.error('[recite] Tencent ASR failed:', {
        code: error.code,
        requestId: error.requestId,
        message: error.message,
      })
      const status = error.code === 'CONFIG' ? 503 : error.code === 'TIMEOUT' ? 504 : 502
      return NextResponse.json({ error: '朗读服务暂时不可用，请稍后再试' }, { status })
    }

    console.error('[recite] judge failed:', error)
    return NextResponse.json({ error: '朗读评分暂时失败，请稍后再试' }, { status: 500 })
  }
}
