import { streamText, convertToModelMessages } from 'ai'
import { route } from '@/ai/router'
import { CHARACTER_SYSTEM_PROMPT } from '@/ai/prompts/v1/character'
import { getSession } from '@/lib/auth-server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: { code: 'UNAUTHORIZED', message: '请先登录' } }, { status: 401 })
  }

  try {
    const { messages } = await req.json()
    const result = streamText({
      model: route.characterDialog,
      system: CHARACTER_SYSTEM_PROMPT,
      messages: await convertToModelMessages(messages),
    })
    return result.toUIMessageStreamResponse()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: { code: 'SERVER_ERROR', message } }, { status: 500 })
  }
}
