import { z } from 'zod'

const BASE_URL = process.env.SILICONFLOW_BASE_URL ?? 'https://api.siliconflow.cn/v1'
const EMBED_URL = `${BASE_URL}/embeddings`
const EMBED_MODEL = 'BAAI/bge-m3'
const EXPECTED_DIM = 1024
const EMBED_TIMEOUT_MS = 10_000

const embeddingResponseSchema = z.object({
  data: z.array(z.object({ embedding: z.array(z.number()) })).min(1),
})

export async function embedText(text: string): Promise<number[]> {
  const apiKey = process.env.SILICONFLOW_API_KEY
  if (!apiKey) throw new Error('embedding service is not configured')

  let res: Response
  try {
    res = await fetch(EMBED_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: EMBED_MODEL, input: text }),
      signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
    })
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new Error('embedding service timed out')
    }
    throw new Error('embedding service request failed')
  }

  if (!res.ok) {
    throw new Error(`embedding service request failed (${res.status})`)
  }

  const parsed = embeddingResponseSchema.safeParse(await res.json().catch(() => null))
  if (!parsed.success) throw new Error('embedding service returned an invalid response')

  const vector = parsed.data.data[0].embedding

  if (vector.length !== EXPECTED_DIM) {
    throw new Error(`embedding dim mismatch: expected ${EXPECTED_DIM}, got ${vector.length}`)
  }

  return vector
}
