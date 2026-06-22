import * as fs from 'fs'
import * as path from 'path'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { immersionScripts } from '../src/db/schema'

const client = postgres(process.env.DATABASE_URL!, { max: 1 })
const db = drizzle(client)

type ScriptEntry = {
  poemId: string
  difficulty: string
  role: string
  scene: string
  teachingGoals: string[]
  openingMove: string
  keyBeats: string[]
  exitCondition: string
  [key: string]: unknown
}

async function main() {
  const filePath = path.join(process.cwd(), 'data', 'immersion-scripts.json')
  const raw = fs.readFileSync(filePath, 'utf-8')
  const data = JSON.parse(raw) as { scripts: ScriptEntry[] }

  const scripts = data.scripts.filter(s => !s.poemId.startsWith('_'))

  console.log(`importing ${scripts.length} immersion scripts…`)

  for (const s of scripts) {
    await db
      .insert(immersionScripts)
      .values({
        poemId: s.poemId,
        difficulty: s.difficulty,
        role: s.role,
        scene: s.scene,
        teachingGoals: s.teachingGoals,
        openingMove: s.openingMove,
        keyBeats: s.keyBeats,
        exitCondition: s.exitCondition,
      })
      .onConflictDoUpdate({
        target: immersionScripts.poemId,
        set: {
          difficulty: s.difficulty,
          role: s.role,
          scene: s.scene,
          teachingGoals: s.teachingGoals,
          openingMove: s.openingMove,
          keyBeats: s.keyBeats,
          exitCondition: s.exitCondition,
        },
      })
    console.log(`  ✓ ${s.poemId}`)
  }

  await client.end()
  console.log('done.')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
