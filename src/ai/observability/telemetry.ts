import type { TelemetrySettings } from 'ai'

type TelemetryMetadata = Record<string, string | number | boolean | null | undefined>

function cleanMetadata(metadata: TelemetryMetadata): NonNullable<TelemetrySettings['metadata']> {
  return Object.fromEntries(
    Object.entries(metadata).filter((entry): entry is [string, string | number | boolean] => {
      const value = entry[1]
      return value !== null && value !== undefined
    }),
  )
}

export function telemetry(
  functionId: string,
  metadata: TelemetryMetadata = {},
): TelemetrySettings {
  const hasLangfuseKey = !!process.env.LANGFUSE_PUBLIC_KEY && !!process.env.LANGFUSE_SECRET_KEY

  return {
    isEnabled: hasLangfuseKey,
    functionId,
    metadata: {
      app: 'qingteng',
      ...cleanMetadata(metadata),
    },
  }
}
