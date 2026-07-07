import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getPoemForQuiz } from '@/db/repositories/poems'
import { recordEvent } from '@/db/repositories/events'
import { poemLinesToText, scoreRecitation } from '@/ai/recite/score'
import { recognizeSentence } from '@/ai/recite/tencent-asr'

export const runtime = 'nodejs'

const MAX_AUDIO_BYTES = 2_500_000

export async function POST(req: Request) {
  const session = await requireAuth()
  const body = (await req.json()) as {
    poemId?: string
    audioBase64?: string
    audioBytes?: number
    voiceFormat?: string
  }

  if (!body.poemId || !body.audioBase64 || !body.audioBytes) {
    return NextResponse.json({ error: 'Missing poemId or audio data' }, { status: 400 })
  }
  if (body.audioBytes > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: 'Audio is too large; please keep it under 20 seconds' }, { status: 413 })
  }

  const poem = await getPoemForQuiz(body.poemId)
  if (!poem) {
    return NextResponse.json({ error: 'Poem not found' }, { status: 404 })
  }

  try {
    const asr = await recognizeSentence({
      audioBase64: body.audioBase64,
      audioBytes: body.audioBytes,
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
