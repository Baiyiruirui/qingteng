import { z } from 'zod'
import {
  requestTencentCloudApi,
  TencentCloudApiError,
} from '@/lib/tencent-cloud-api'

const SERVICE = 'asr'
const HOST = 'asr.tencentcloudapi.com'
const VERSION = '2019-06-14'
const ACTION = 'SentenceRecognition'
const ASR_TIMEOUT_MS = 15_000

const sentenceRecognitionResponseSchema = z.object({
  Response: z.object({
    Result: z.string().optional(),
    AudioDuration: z.number().optional(),
    RequestId: z.string().optional(),
    Error: z.object({
      Code: z.string().optional(),
      Message: z.string().optional(),
    }).optional(),
  }),
})

export type TencentAsrErrorCode = 'CONFIG' | 'TIMEOUT' | 'UPSTREAM' | 'INVALID_RESPONSE'

export class TencentAsrError extends Error {
  constructor(
    public readonly code: TencentAsrErrorCode,
    message: string,
    public readonly requestId: string | null = null,
  ) {
    super(message)
    this.name = 'TencentAsrError'
  }
}

export type TencentAsrResult = {
  transcript: string
  audioDuration: number | null
  requestId: string | null
}

function asrRegion(): string {
  return process.env.TENCENT_ASR_REGION || 'ap-guangzhou'
}

export async function recognizeSentence({
  audioBase64,
  audioBytes,
  voiceFormat = 'wav',
  userAudioKey,
}: {
  audioBase64: string
  audioBytes: number
  voiceFormat?: string
  userAudioKey: string
}): Promise<TencentAsrResult> {
  const body = {
    ProjectId: 0,
    SubServiceType: 2,
    EngSerViceType: '16k_zh',
    SourceType: 1,
    VoiceFormat: voiceFormat,
    UsrAudioKey: userAudioKey,
    Data: audioBase64,
    DataLen: audioBytes,
    WordInfo: 0,
    FilterDirty: 0,
    FilterModal: 0,
    FilterPunc: 0,
    ConvertNumMode: 1,
    HotwordId: '',
    CustomizationId: '',
    ReinforceHotword: 0,
  }
  let response: Awaited<ReturnType<typeof requestTencentCloudApi>>
  try {
    response = await requestTencentCloudApi({
      service: SERVICE,
      host: HOST,
      action: ACTION,
      version: VERSION,
      region: asrRegion(),
      payload: body,
      timeoutMs: ASR_TIMEOUT_MS,
    })
  } catch (error) {
    if (error instanceof TencentCloudApiError) {
      throw new TencentAsrError(error.code, error.message)
    }
    throw error
  }

  const parsed = sentenceRecognitionResponseSchema.safeParse(response.data)
  if (!parsed.success) {
    throw new TencentAsrError('INVALID_RESPONSE', 'Tencent ASR returned an invalid response')
  }

  const data = parsed.data
  const error = data.Response.Error
  if (!response.ok || error) {
    throw new TencentAsrError(
      'UPSTREAM',
      error?.Code ?? `Tencent ASR request failed (${response.status})`,
      data.Response.RequestId ?? null,
    )
  }

  return {
    transcript: data.Response.Result ?? '',
    audioDuration: data.Response.AudioDuration ?? null,
    requestId: data.Response.RequestId ?? null,
  }
}
