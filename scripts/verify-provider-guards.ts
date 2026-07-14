import assert from 'node:assert/strict'
import { embedText } from '@/ai/embedding-core'
import { recognizeSentence, TencentAsrError } from '@/ai/recite/tencent-asr'

const originalFetch = globalThis.fetch
const originalEmbeddingKey = process.env.SILICONFLOW_API_KEY
const originalTencentId = process.env.TENCENT_SECRET_ID
const originalTencentKey = process.env.TENCENT_SECRET_KEY

function mockFetch(handler: () => Promise<Response>) {
  globalThis.fetch = handler as typeof fetch
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

async function verifyEmbeddingGuards() {
  process.env.SILICONFLOW_API_KEY = 'test-key'

  mockFetch(async () => new Response('provider secret detail', { status: 500 }))
  await assert.rejects(embedText('test'), error => {
    assert(error instanceof Error)
    assert.equal(error.message, 'embedding service request failed (500)')
    assert(!error.message.includes('provider secret detail'))
    return true
  })

  mockFetch(async () => Response.json({ data: [] }))
  await assert.rejects(embedText('test'), /invalid response/)
}

async function verifyAsrGuards() {
  process.env.TENCENT_SECRET_ID = 'test-id'
  process.env.TENCENT_SECRET_KEY = 'test-key'

  mockFetch(async () => Response.json({ unexpected: true }))
  await assert.rejects(
    recognizeSentence({ audioBase64: 'AA==', audioBytes: 1, userAudioKey: 'test' }),
    error => error instanceof TencentAsrError && error.code === 'INVALID_RESPONSE',
  )

  mockFetch(async () => Response.json({
    Response: {
      Error: { Code: 'AuthFailure', Message: 'provider secret detail' },
      RequestId: 'request-id',
    },
  }))
  await assert.rejects(
    recognizeSentence({ audioBase64: 'AA==', audioBytes: 1, userAudioKey: 'test' }),
    error => {
      assert(error instanceof TencentAsrError)
      assert.equal(error.code, 'UPSTREAM')
      assert.equal(error.message, 'AuthFailure')
      assert(!error.message.includes('provider secret detail'))
      return true
    },
  )

  mockFetch(async () => {
    const error = new Error('timed out')
    error.name = 'TimeoutError'
    throw error
  })
  await assert.rejects(
    recognizeSentence({ audioBase64: 'AA==', audioBytes: 1, userAudioKey: 'test' }),
    error => error instanceof TencentAsrError && error.code === 'TIMEOUT',
  )
}

async function main() {
  try {
    await verifyEmbeddingGuards()
    await verifyAsrGuards()
    console.log('provider guards: 5/5 checks passed')
  } finally {
    globalThis.fetch = originalFetch
    restoreEnv('SILICONFLOW_API_KEY', originalEmbeddingKey)
    restoreEnv('TENCENT_SECRET_ID', originalTencentId)
    restoreEnv('TENCENT_SECRET_KEY', originalTencentKey)
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
