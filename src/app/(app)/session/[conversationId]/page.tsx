import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth-server'
import { db } from '@/db'
import { poems } from '@/db/schema'
import type { PoemLine } from '@/db/schema'
import { getConversationById, loadMessages, getImmersionScript } from '@/db/repositories/conversations'
import ChatClient from '../../chat/_chat-client'
import ImmersionClient from './_immersion-client'

type Props = { params: Promise<{ conversationId: string }> }

export default async function SessionPage({ params }: Props) {
  const { conversationId } = await params

  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const conversation = await getConversationById(conversationId, user.id)
  if (!conversation) redirect('/chat')

  const dbMessages = await loadMessages(conversationId)

  const initialMessages = dbMessages.map(msg => ({
    id: msg.id,
    role: msg.role as 'user' | 'assistant',
    parts: [{ type: 'text' as const, text: msg.content }],
  }))

  // Roleplay mode: load full poem data + immersion script
  if (conversation.mode === 'roleplay' && conversation.poemId) {
    const [poemRow, script] = await Promise.all([
      db
        .select({ title: poems.title, author: poems.author, lines: poems.lines })
        .from(poems)
        .where(eq(poems.id, conversation.poemId))
        .limit(1)
        .then(rows => rows[0] ?? null),
      getImmersionScript(conversation.poemId),
    ])

    if (!poemRow || !script) redirect('/poems')

    const poemLines = (poemRow.lines as PoemLine[]).map(l => l.content)

    return (
      <ImmersionClient
        key={conversation.id}
        userName={user.name}
        conversationId={conversation.id}
        initialMessages={initialMessages}
        poemId={conversation.poemId}
        poemTitle={poemRow.title}
        poemAuthor={poemRow.author}
        poemLines={poemLines}
        role={script.role}
      />
    )
  }

  // chat / creative mode: use standard ChatClient
  let poemTitle: string | undefined
  if (conversation.poemId) {
    const [poem] = await db
      .select({ title: poems.title })
      .from(poems)
      .where(eq(poems.id, conversation.poemId))
      .limit(1)
    poemTitle = poem?.title
  }

  return (
    <ChatClient
      key={conversation.id}
      userName={user.name}
      conversationId={conversation.id}
      initialMessages={initialMessages}
      sessionMode={conversation.mode as 'chat' | 'roleplay' | 'creative'}
      sessionPoemTitle={poemTitle}
    />
  )
}
