import crypto from 'node:crypto'

const SERVICE = 'asr'
const HOST = 'asr.tencentcloudapi.com'
const ENDPOINT = `https://${HOST}`
const VERSION = '2019-06-14'
const ACTION = 'SentenceRecognition'

type TencentErrorResponse = {
  Response?: {
    Error?: {
      Code?: string
      Message?: string
    }
    RequestId?: string
  }
}

type SentenceRecognitionResponse = TencentErrorResponse & {
  Response?: {
    Result?: string
    AudioDuration?: number
    WordSize?: number
    WordList?: unknown[]
    RequestId?: string
    Error?: {
      Code?: string
      Message?: string
    }
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
  if (!value) throw new Error(`${name} is not configured`)
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
  const res = await fetch(ENDPOINT, {
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
  })
  const data = (await res.json()) as SentenceRecognitionResponse
  const error = data.Response?.Error
  if (!res.ok || error) {
    throw new Error(error?.Message || `Tencent ASR request failed: ${res.status}`)
  }

  return {
    transcript: data.Response?.Result ?? '',
    audioDuration: data.Response?.AudioDuration ?? null,
    requestId: data.Response?.RequestId ?? null,
  }
}
