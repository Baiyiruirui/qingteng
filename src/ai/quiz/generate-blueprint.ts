import { generateText } from 'ai'
import { z } from 'zod'
import { route } from '@/ai/router'
import { buildBlueprintGenPrompt, BLUEPRINT_GEN_VERSION } from '@/ai/prompts/v1/blueprint-generate'
import { getPoemForQuiz } from '@/db/repositories/poems'
import { db } from '@/db'
import { quizBlueprints } from '@/db/schema'
import type { BlueprintPoint } from '@/db/schema'
import { sql } from 'drizzle-orm'

const BlueprintPointSchema = z.object({
  id: z.string(),
  type: z.string(),
  ability: z.string(),
  targetLines: z.array(z.string()).min(1),
  prompt_hint: z.string().min(5),
  answerKey: z.string().min(5),
  form: z.enum(['fill', 'appreciate', 'translate', 'mcq']),
})

const BlueprintSchema = z.array(BlueprintPointSchema).min(4).max(10)

export async function generateBlueprintForPoem(poemId: string): Promise<BlueprintPoint[]> {
  const poem = await getPoemForQuiz(poemId)
  if (!poem) throw new Error(`Poem not found: ${poemId}`)

  const prompt = buildBlueprintGenPrompt(poem)

  const result = await generateText({
    model: route.quizGenerate,
    prompt,
  })

  // Extract JSON array from response
  const jsonMatch = result.text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) throw new Error('LLM returned no JSON array')

  const parsed = JSON.parse(jsonMatch[0])
  const points = BlueprintSchema.parse(parsed)

  // Persist to DB (upsert)
  await db
    .insert(quizBlueprints)
    .values({ poemId, points })
    .onConflictDoUpdate({
      target: quizBlueprints.poemId,
      set: { points: sql`excluded.points` },
    })

  console.log(`[generate-blueprint] Generated ${points.length} points for ${poemId} (${BLUEPRINT_GEN_VERSION})`)
  return points as BlueprintPoint[]
}
