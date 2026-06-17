import { createDeepSeek } from '@ai-sdk/deepseek'
import { createAnthropic } from '@ai-sdk/anthropic'

const deepseek = createDeepSeek({ apiKey: process.env.DEEPSEEK_API_KEY! })
const anthropic = process.env.ANTHROPIC_API_KEY
  ? createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null

export const route = {
  characterDialog: anthropic?.('claude-haiku-4-5-20251001') ?? deepseek('deepseek-chat'),
  quizGenerate:    deepseek('deepseek-chat'),
  quizJudge:       deepseek('deepseek-chat'),
} as const
