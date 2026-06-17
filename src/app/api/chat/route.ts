import { streamText } from 'ai'
import { route } from '@/ai/router'
import { CHARACTER_SYSTEM_PROMPT } from '@/ai/prompts/v1/character'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const { messages } = await req.json()
    const result = streamText({
      model: route.characterDialog,
      system: CHARACTER_SYSTEM_PROMPT,
      messages,
    })
    return result.toUIMessageStreamResponse()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
