import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth-server'
import { getOrCreateActiveConversation, loadMessages } from '@/db/repositories/conversations'
import { db } from '@/db'
import { poems, immersionScripts } from '@/db/schema'
import ChatClient, { type DailyPoem } from './_chat-client'

// 有预生成题库的诗（与诗库页保持一致）
const QUIZ_POEM_IDS = new Set(['TANG_001', 'TANG_023', 'TANG_042'])

/** 今日入诗：从有沉浸脚本的诗里按日轮换，轻量推荐 */
async function getDailyPoem(): Promise<DailyPoem | null> {
  const scripts = await db
    .select({ poemId: immersionScripts.poemId })
    .from(immersionScripts)
  if (scripts.length === 0) return null

  const ids = [...new Set(scripts.map(s => s.poemId))].sort()
  const dayIdx = Math.floor(Date.now() / 86_400_000) % ids.length
  const pid = ids[dayIdx]

  const rows = await db.select().from(poems).where(eq(poems.id, pid)).limit(1)
  const p = rows[0]
  if (!p) return null

  return {
    id: p.id,
    title: p.title,
    author: p.author,
    dynasty: p.dynasty,
    lines: (p.lines ?? []).slice(0, 4).map(l => l.content),
    hasQuiz: QUIZ_POEM_IDS.has(p.id),
  }
}

export default async function ChatPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const [conversation, dailyPoem] = await Promise.all([
    getOrCreateActiveConversation(user.id),
    getDailyPoem(),
  ])
  const dbMessages = await loadMessages(conversation.id)

  const initialMessages = dbMessages.map(msg => ({
    id: msg.id,
    role: msg.role as 'user' | 'assistant',
    parts: [{ type: 'text' as const, text: msg.content }],
  }))

  return (
    <ChatClient
      key={conversation.id}
      userName={user.name}
      conversationId={conversation.id}
      initialMessages={initialMessages}
      dailyPoem={dailyPoem}
    />
  )
}
