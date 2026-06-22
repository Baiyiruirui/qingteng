import { redirect } from 'next/navigation'
import { asc } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth-server'
import { db } from '@/db'
import { poems, immersionScripts } from '@/db/schema'
import PoemsClient from './_poems-client'

export default async function PoemsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const [allPoems, scripts] = await Promise.all([
    db
      .select({
        id: poems.id,
        title: poems.title,
        author: poems.author,
        dynasty: poems.dynasty,
        grade: poems.grade,
      })
      .from(poems)
      .orderBy(asc(poems.id)),
    db.select({ poemId: immersionScripts.poemId }).from(immersionScripts),
  ])

  const scriptPoemIds = new Set(scripts.map(s => s.poemId))

  return (
    <PoemsClient
      userName={user.name}
      poems={allPoems.map(p => ({
        ...p,
        hasScript: scriptPoemIds.has(p.id),
      }))}
    />
  )
}
