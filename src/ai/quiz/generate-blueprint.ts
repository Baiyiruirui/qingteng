import { generateText } from 'ai'
import { route } from '@/ai/router'
import { buildBlueprintGenPrompt, BLUEPRINT_GEN_VERSION } from '@/ai/prompts/v1/blueprint-generate'
import { getPoemForQuiz } from '@/db/repositories/poems'
import { db } from '@/db'
import { quizBlueprints } from '@/db/schema'
import type { BlueprintPoint } from '@/db/schema'
import { sql } from 'drizzle-orm'
import { BlueprintSchema, validateBlueprintAgainstPoem } from '@/ai/quiz/blueprint-schema'

export async function draftBlueprintForPoem(
  poemId: string,
  maxAttempts = 3,
): Promise<BlueprintPoint[]> {
  const poem = await getPoemForQuiz(poemId)
  if (!poem) throw new Error(`Poem not found: ${poemId}`)

  const prompt = buildBlueprintGenPrompt(poem)
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await generateText({
        model: route.quizGenerate,
        prompt,
      })

      const jsonMatch = result.text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) throw new Error('LLM returned no JSON array')

      const points = BlueprintSchema.parse(JSON.parse(jsonMatch[0])) as BlueprintPoint[]
      const issues = validateBlueprintAgainstPoem(points, poem)
      if (issues.length > 0) throw new Error(issues.join('; '))

      console.log(
        `[generate-blueprint] Drafted ${points.length} points for ${poemId} (${BLUEPRINT_GEN_VERSION})`,
      )
      return points
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : 'unknown error'
      console.warn(`[generate-blueprint] ${poemId} attempt ${attempt}/${maxAttempts} failed: ${message}`)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Blueprint generation failed: ${poemId}`)
}

export async function saveBlueprintForPoem(poemId: string, points: BlueprintPoint[]) {
  await db
    .insert(quizBlueprints)
    .values({ poemId, points })
    .onConflictDoUpdate({
      target: quizBlueprints.poemId,
      set: { points: sql`excluded.points` },
    })
}

export async function generateBlueprintForPoem(poemId: string): Promise<BlueprintPoint[]> {
  const points = await draftBlueprintForPoem(poemId)
  await saveBlueprintForPoem(poemId, points)
  console.log(`[generate-blueprint] Generated ${points.length} points for ${poemId} (${BLUEPRINT_GEN_VERSION})`)
  return points
}
