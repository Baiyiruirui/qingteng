type AiGenerationBudget = {
  maxOutputTokens: number
  maxRetries: number
  timeout: {
    totalMs: number
  }
}

export const AI_GENERATION_BUDGETS = {
  chat: {
    maxOutputTokens: 640,
    maxRetries: 1,
    timeout: { totalMs: 45_000 },
  },
  immersion: {
    maxOutputTokens: 520,
    maxRetries: 1,
    timeout: { totalMs: 45_000 },
  },
  opening: {
    maxOutputTokens: 240,
    maxRetries: 1,
    timeout: { totalMs: 25_000 },
  },
  memoryExtraction: {
    maxOutputTokens: 320,
    maxRetries: 1,
    timeout: { totalMs: 30_000 },
  },
  quizGeneration: {
    maxOutputTokens: 900,
    maxRetries: 1,
    timeout: { totalMs: 45_000 },
  },
  quizJudge: {
    maxOutputTokens: 520,
    maxRetries: 1,
    timeout: { totalMs: 35_000 },
  },
  blueprintGeneration: {
    maxOutputTokens: 1_400,
    maxRetries: 1,
    timeout: { totalMs: 60_000 },
  },
} as const satisfies Record<string, AiGenerationBudget>

export function requestAbortSignal(req: Request): AbortSignal {
  return req.signal
}
