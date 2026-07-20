export const MEMORY_RETENTION_OPTIONS = [30, 90, 180, 365] as const
export type MemoryRetentionDays = (typeof MEMORY_RETENTION_OPTIONS)[number]

export type MemoryPreferences = {
  memoryEnabled: boolean
  retentionDays: MemoryRetentionDays
}

export const DEFAULT_MEMORY_PREFERENCES: MemoryPreferences = {
  memoryEnabled: true,
  retentionDays: 180,
}

export function isMemoryRetentionDays(value: unknown): value is MemoryRetentionDays {
  return typeof value === 'number'
    && MEMORY_RETENTION_OPTIONS.includes(value as MemoryRetentionDays)
}

export function normalizeMemoryPreferences(value: unknown): MemoryPreferences {
  if (!value || typeof value !== 'object') return DEFAULT_MEMORY_PREFERENCES

  const candidate = value as Partial<MemoryPreferences>
  return {
    memoryEnabled: typeof candidate.memoryEnabled === 'boolean'
      ? candidate.memoryEnabled
      : DEFAULT_MEMORY_PREFERENCES.memoryEnabled,
    retentionDays: isMemoryRetentionDays(candidate.retentionDays)
      ? candidate.retentionDays
      : DEFAULT_MEMORY_PREFERENCES.retentionDays,
  }
}

export function memoryRetentionCutoff(
  retentionDays: MemoryRetentionDays,
  now = new Date(),
): Date {
  return new Date(now.getTime() - retentionDays * 86_400_000)
}
