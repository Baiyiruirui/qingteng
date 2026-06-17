import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth-server'
import { getOrCreateActiveConversation, loadMessages } from '@/db/repositories/conversations'
import ChatClient from './_chat-client'

export default async function ChatPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const conversation = await getOrCreateActiveConversation(user.id)
  const dbMessages = await loadMessages(conversation.id)

  const initialMessages = dbMessages.map(msg => ({
    id: msg.id,
    role: msg.role as 'user' | 'assistant',
    parts: [{ type: 'text' as const, text: msg.content }],
  }))

  return (
    <ChatClient
      userName={user.name}
      conversationId={conversation.id}
      initialMessages={initialMessages}
    />
  )
}
