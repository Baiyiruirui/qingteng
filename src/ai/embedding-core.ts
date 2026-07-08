const BASE_URL = process.env.SILICONFLOW_BASE_URL ?? 'https://api.siliconflow.cn/v1'
const EMBED_URL = `${BASE_URL}/embeddings`
const EMBED_MODEL = 'BAAI/bge-m3'
const EXPECTED_DIM = 1024

export async function embedText(text: string): Promise<number[]> {
  const res = await fetch(EMBED_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.SILICONFLOW_API_KEY}`,
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  })

  if (!res.ok) {
    throw new Error(`embedding failed: ${res.status} ${await res.text()}`)
  }

  const data = await res.json()
  const vector: number[] = data.data[0].embedding

  if (vector.length !== EXPECTED_DIM) {
    throw new Error(`embedding dim mismatch: expected ${EXPECTED_DIM}, got ${vector.length}`)
  }

  return vector
}
