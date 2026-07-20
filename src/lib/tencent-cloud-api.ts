import crypto from 'node:crypto'

export type TencentCloudApiErrorCode = 'CONFIG' | 'TIMEOUT' | 'UPSTREAM'

export class TencentCloudApiError extends Error {
  constructor(
    public readonly code: TencentCloudApiErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'TencentCloudApiError'
  }
}

type TencentCloudRequest = {
  service: string
  host: string
  action: string
  version: string
  region?: string
  payload: Record<string, unknown>
  timeoutMs?: number
}

type TencentCloudResponse = {
  ok: boolean
  status: number
  data: unknown
}

function sha256(message: string): string {
  return crypto.createHash('sha256').update(message, 'utf8').digest('hex')
}

function hmacSha256(key: crypto.BinaryLike, message: string): Buffer {
  return crypto.createHmac('sha256', key).update(message, 'utf8').digest()
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new TencentCloudApiError('CONFIG', `${name} is not configured`)
  return value
}

function createAuthorization({
  secretId,
  secretKey,
  service,
  host,
  timestamp,
  payload,
}: {
  secretId: string
  secretKey: string
  service: string
  host: string
  timestamp: number
  payload: string
}) {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const algorithm = 'TC3-HMAC-SHA256'
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`
  const signedHeaders = 'content-type;host'
  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeaders,
    signedHeaders,
    sha256(payload),
  ].join('\n')
  const credentialScope = `${date}/${service}/tc3_request`
  const stringToSign = [
    algorithm,
    timestamp.toString(),
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n')
  const secretDate = hmacSha256(`TC3${secretKey}`, date)
  const secretService = hmacSha256(secretDate, service)
  const secretSigning = hmacSha256(secretService, 'tc3_request')
  const signature = crypto
    .createHmac('sha256', secretSigning)
    .update(stringToSign, 'utf8')
    .digest('hex')

  return `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
}

export async function requestTencentCloudApi({
  service,
  host,
  action,
  version,
  region,
  payload,
  timeoutMs = 15_000,
}: TencentCloudRequest): Promise<TencentCloudResponse> {
  const secretId = requiredEnv('TENCENT_SECRET_ID')
  const secretKey = requiredEnv('TENCENT_SECRET_KEY')
  const body = JSON.stringify(payload)
  const timestamp = Math.floor(Date.now() / 1000)

  let response: Response
  try {
    response = await fetch(`https://${host}`, {
      method: 'POST',
      headers: {
        Authorization: createAuthorization({
          secretId,
          secretKey,
          service,
          host,
          timestamp,
          payload: body,
        }),
        'Content-Type': 'application/json; charset=utf-8',
        Host: host,
        'X-TC-Action': action,
        'X-TC-Timestamp': timestamp.toString(),
        'X-TC-Version': version,
        ...(region ? { 'X-TC-Region': region } : {}),
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new TencentCloudApiError('TIMEOUT', 'Tencent Cloud request timed out')
    }
    throw new TencentCloudApiError('UPSTREAM', 'Tencent Cloud request failed')
  }

  return {
    ok: response.ok,
    status: response.status,
    data: await response.json().catch(() => null),
  }
}
