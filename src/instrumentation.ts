export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const globalForLangfuse = globalThis as typeof globalThis & {
    __qingtengLangfuseRegistered?: boolean
  }

  if (globalForLangfuse.__qingtengLangfuseRegistered) return

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY
  const secretKey = process.env.LANGFUSE_SECRET_KEY
  const baseUrl =
    process.env.LANGFUSE_BASE_URL ??
    process.env.LANGFUSE_BASEURL ??
    process.env.LANGFUSE_HOST ??
    'https://cloud.langfuse.com'

  if (!publicKey || !secretKey) return

  const [{ NodeTracerProvider }, { LangfuseSpanProcessor }] = await Promise.all([
    import('@opentelemetry/sdk-trace-node'),
    import('@langfuse/otel'),
  ])

  const provider = new NodeTracerProvider({
    spanProcessors: [
      new LangfuseSpanProcessor({
        publicKey,
        secretKey,
        baseUrl,
        exportMode: 'immediate',
        environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
        release: process.env.VERCEL_GIT_COMMIT_SHA,
      }),
    ],
  })

  provider.register()
  globalForLangfuse.__qingtengLangfuseRegistered = true
}
