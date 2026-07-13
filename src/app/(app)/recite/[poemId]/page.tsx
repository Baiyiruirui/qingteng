import { redirect } from 'next/navigation'
import { AppNav } from '@/components/AppNav'
import { getPoemForQuiz } from '@/db/repositories/poems'
import { getCurrentUser } from '@/lib/auth-server'
import { getPoemImage } from '@/lib/poem-images'
import ReciteClient from './_recite-client'

export default async function RecitePage({
  params,
}: {
  params: Promise<{ poemId: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { poemId } = await params
  const poem = await getPoemForQuiz(poemId)
  if (!poem) redirect('/poems')

  return (
    <div className="min-h-screen bg-paper text-ink">
      <AppNav title="青藤朗读" userName={user.name} />
      <ReciteClient
        imageSrc={getPoemImage(poem.id)}
        poem={{
          id: poem.id,
          title: poem.title,
          author: poem.author,
          dynasty: poem.dynasty,
          lines: poem.lines.map(line => line.content),
        }}
      />
    </div>
  )
}
