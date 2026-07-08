export const MEMORY_DECAY_BASE = 0.9
export const MEMORY_CAP_PER_USER = 80
export const MEMORY_DUPLICATE_WEIGHT_BONUS = 0.2
export const MEMORY_MAX_WEIGHT = 2

const ALLOWED_MEMORY_KINDS = new Set(['emotion', 'preference', 'confusion', 'personal'])

export function normalizeMemoryKind(kind: unknown): string {
  return typeof kind === 'string' && ALLOWED_MEMORY_KINDS.has(kind) ? kind : 'personal'
}

export function normalizeMemoryContent(content: unknown): string | null {
  if (typeof content !== 'string') return null

  const normalized = content
    .replace(/\s+/g, ' ')
    .replace(/[。.!！?？]+$/g, '。')
    .trim()

  if (normalized.length < 8) return null
  return normalized.length > 120 ? `${normalized.slice(0, 120)}。` : normalized
}

export function memoryAgeDays(createdAt: Date, now = new Date()): number {
  const elapsedMs = now.getTime() - createdAt.getTime()
  return Math.max(0, elapsedMs / 86_400_000)
}

export function memoryDecayMultiplier(createdAt: Date, now = new Date()): number {
  return MEMORY_DECAY_BASE ** memoryAgeDays(createdAt, now)
}

export function effectiveMemoryScore(input: {
  similarity: number
  weight?: number | null
  createdAt: Date
  now?: Date
}): number {
  return input.similarity * (input.weight ?? 1) * memoryDecayMultiplier(input.createdAt, input.now)
}
