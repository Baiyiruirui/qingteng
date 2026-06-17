import { getCurrentUser } from '@/lib/auth-server'
import ChatClient from './_chat-client'
import { redirect } from 'next/navigation'

export default async function ChatPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return <ChatClient name={user.name} />
}
