import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth-server'
import { db } from '@/db'
import { poems } from '@/db/schema'
import { getConversationById, loadMessages } from '@/db/repositories/conversations'
import ChatClient from '../../chat/_chat-client'

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

  // Get poem title if this is a poem-linked conversation
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
