import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth-server'
import { getPoemForQuiz } from '@/db/repositories/poems'
import { recordEvent } from '@/db/repositories/events'
import { poemLinesToText, scoreRecitation } from '@/ai/recite/score'
import { recognizeSentence } from '@/ai/recite/tencent-asr'
import { checkRateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { estimateBase64Bytes } from '@/lib/request-limits'

export const runtime = 'nodejs'

const MAX_AUDIO_BYTES = 2_500_000
const MAX_BASE64_CHARS = Math.ceil((MAX_AUDIO_BYTES * 4) / 3) + 4

const requestSchema = z.object({
  poemId: z.string().min(1).max(64),
  audioBase64: z.string().min(1).max(MAX_BASE64_CHARS),
  audioBytes: z.number().int().positive().max(MAX_AUDIO_BYTES),
  voiceFormat: z.enum(['wav']).optional(),
})

export async function POST(req: Request) {
  const session = await requireAuth()

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
    return NextResponse.json({ error: 'Missing poemId or audio data' }, { status: 400 })
  }
  const body = parsedBody.data
  const actualAudioBytes = estimateBase64Bytes(body.audioBase64)
  if (actualAudioBytes <= 0 || actualAudioBytes > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: 'Audio is too large; please keep it under 20 seconds' }, { status: 413 })
  }

  const poem = await getPoemForQuiz(body.poemId)
  if (!poem) {
    return NextResponse.json({ error: 'Poem not found' }, { status: 404 })
  }

  try {
    const asr = await recognizeSentence({
      audioBase64: body.audioBase64,
      audioBytes: actualAudioBytes,
      voiceFormat: body.voiceFormat ?? 'wav',
      userAudioKey: `${session.userId}-${body.poemId}-${randomUUID()}`,
    })
    const expectedText = poemLinesToText(poem.lines)
    const score = scoreRecitation({ expectedText, transcript: asr.transcript })

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
    const message = error instanceof Error ? error.message : 'Recite judge failed'
    const status = message.includes('TENCENT_SECRET') || message.includes('configured') ? 503 : 502
    return NextResponse.json({ error: message }, { status })
  }
}
