import { z } from 'zod'
import {
  requestTencentCloudApi,
  TencentCloudApiError,
} from '@/lib/tencent-cloud-api'
import { pinyinFromTencentSubtitles } from '@/ai/recite/pinyin'
import { TTS_TEXT_LIMIT } from '@/ai/recite/target'

const SERVICE = 'tts'
const HOST = 'tts.tencentcloudapi.com'
const VERSION = '2019-08-23'
const ACTION = 'TextToVoice'
const TTS_TIMEOUT_MS = 15_000

const subtitleSchema = z.object({
  BeginIndex: z.number().optional(),
  BeginTime: z.number().optional(),
  EndIndex: z.number().optional(),
  EndTime: z.number().optional(),
  Phoneme: z.string().optional(),
  Text: z.string(),
})

const textToVoiceResponseSchema = z.object({
  Response: z.object({
    Audio: z.string().min(1).max(8_000_000).optional(),
    SessionId: z.string().optional(),
    Subtitles: z.array(subtitleSchema).optional(),
    RequestId: z.string().optional(),
    Error: z.object({
      Code: z.string().optional(),
      Message: z.string().optional(),
    }).optional(),
  }),
})

export type TencentTtsErrorCode = 'CONFIG' | 'TIMEOUT' | 'UPSTREAM' | 'INVALID_RESPONSE'

export class TencentTtsError extends Error {
  constructor(
    public readonly code: TencentTtsErrorCode,
    message: string,
    public readonly requestId: string | null = null,
  ) {
    super(message)
    this.name = 'TencentTtsError'
  }
}

export type TencentTtsResult = {
  audioBase64: string
  codec: 'mp3'
  pinyin: string | null
  requestId: string | null
}

function voiceType(): number | undefined {
  const raw = process.env.TENCENT_TTS_VOICE_TYPE
  if (!raw) return undefined
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function ttsRegion(): string | undefined {
  return process.env.TENCENT_TTS_REGION || process.env.TENCENT_ASR_REGION || undefined
}

export async function synthesizeRecitation({
  text,
  sessionId,
}: {
  text: string
  sessionId: string
}): Promise<TencentTtsResult> {
  if (text.length === 0 || Array.from(text).length > TTS_TEXT_LIMIT) {
    throw new TencentTtsError('UPSTREAM', 'Tencent TTS text length is invalid')
  }

  const configuredVoiceType = voiceType()
  let response: Awaited<ReturnType<typeof requestTencentCloudApi>>
  try {
    response = await requestTencentCloudApi({
      service: SERVICE,
      host: HOST,
      action: ACTION,
      version: VERSION,
      region: ttsRegion(),
      timeoutMs: TTS_TIMEOUT_MS,
      payload: {
        Text: text,
        SessionId: sessionId,
        Volume: 0,
        Speed: -0.5,
        ProjectId: 0,
        ModelType: 1,
        ...(configuredVoiceType ? { VoiceType: configuredVoiceType } : {}),
        PrimaryLanguage: 1,
        SampleRate: 16000,
        Codec: 'mp3',
        EnableSubtitle: true,
      },
    })
  } catch (error) {
    if (error instanceof TencentCloudApiError) {
      throw new TencentTtsError(error.code, error.message)
    }
    throw error
  }

  const parsed = textToVoiceResponseSchema.safeParse(response.data)
  if (!parsed.success) {
    throw new TencentTtsError('INVALID_RESPONSE', 'Tencent TTS returned an invalid response')
  }

  const data = parsed.data.Response
  if (!response.ok || data.Error) {
    throw new TencentTtsError(
      'UPSTREAM',
      data.Error?.Code ?? `Tencent TTS request failed (${response.status})`,
      data.RequestId ?? null,
    )
  }
  if (!data.Audio) {
    throw new TencentTtsError(
      'INVALID_RESPONSE',
      'Tencent TTS response did not include audio',
      data.RequestId ?? null,
    )
  }

  return {
    audioBase64: data.Audio,
    codec: 'mp3',
    pinyin: pinyinFromTencentSubtitles(data.Subtitles ?? [], text),
    requestId: data.RequestId ?? null,
  }
}
