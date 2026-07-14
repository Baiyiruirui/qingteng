import crypto from 'node:crypto'
import { z } from 'zod'

const SERVICE = 'asr'
const HOST = 'asr.tencentcloudapi.com'
const ENDPOINT = `https://${HOST}`
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

function sha256(message: string): string {
  return crypto.createHash('sha256').update(message, 'utf8').digest('hex')
}

function hmacSha256(key: crypto.BinaryLike, message: string): Buffer {
  return crypto.createHmac('sha256', key).update(message, 'utf8').digest()
}

function getAuthorization({
  secretId,
  secretKey,
  timestamp,
  payload,
}: {
  secretId: string
  secretKey: string
  timestamp: number
  payload: string
}) {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const algorithm = 'TC3-HMAC-SHA256'
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${HOST}\n`
  const signedHeaders = 'content-type;host'
  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeaders,
    signedHeaders,
    sha256(payload),
  ].join('\n')
  const credentialScope = `${date}/${SERVICE}/tc3_request`
  const stringToSign = [
    algorithm,
    timestamp.toString(),
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n')
  const secretDate = hmacSha256(`TC3${secretKey}`, date)
  const secretService = hmacSha256(secretDate, SERVICE)
  const secretSigning = hmacSha256(secretService, 'tc3_request')
  const signature = crypto
    .createHmac('sha256', secretSigning)
    .update(stringToSign, 'utf8')
    .digest('hex')

  return `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new TencentAsrError('CONFIG', `${name} is not configured`)
  return value
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
  const secretId = requiredEnv('TENCENT_SECRET_ID')
  const secretKey = requiredEnv('TENCENT_SECRET_KEY')

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
  const payload = JSON.stringify(body)
  const timestamp = Math.floor(Date.now() / 1000)
  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: getAuthorization({ secretId, secretKey, timestamp, payload }),
        'Content-Type': 'application/json; charset=utf-8',
        Host: HOST,
        'X-TC-Action': ACTION,
        'X-TC-Timestamp': timestamp.toString(),
        'X-TC-Version': VERSION,
        'X-TC-Region': asrRegion(),
      },
      body: payload,
      signal: AbortSignal.timeout(ASR_TIMEOUT_MS),
    })
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new TencentAsrError('TIMEOUT', 'Tencent ASR request timed out')
    }
    throw new TencentAsrError('UPSTREAM', 'Tencent ASR request failed')
  }

  const parsed = sentenceRecognitionResponseSchema.safeParse(await res.json().catch(() => null))
  if (!parsed.success) {
    throw new TencentAsrError('INVALID_RESPONSE', 'Tencent ASR returned an invalid response')
  }

  const data = parsed.data
  const error = data.Response.Error
  if (!res.ok || error) {
    throw new TencentAsrError(
      'UPSTREAM',
      error?.Code ?? `Tencent ASR request failed (${res.status})`,
      data.Response.RequestId ?? null,
    )
  }

  return {
    transcript: data.Response.Result ?? '',
    audioDuration: data.Response.AudioDuration ?? null,
    requestId: data.Response.RequestId ?? null,
  }
}
