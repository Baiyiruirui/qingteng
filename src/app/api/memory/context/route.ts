import { desc, eq } from 'drizzle-orm'
import { getSession } from '@/lib/auth-server'
import { db } from '@/db'
import { memories } from '@/db/schema'
import { getProfile } from '@/ai/memory/mid-term'

export const runtime = 'nodejs'

const MEMORY_LIMIT = 6

// 只读：把青藤对该用户的「画像 + 长期记忆」暴露给前端做可视化（「青藤记得你」卡片）
export async function GET() {
  const session = await getSession()
  if (!session) {
    return Response.json(
      { error: { code: 'UNAUTHORIZED', message: '请先登录' } },
      { status: 401 },
    )
  }

  try {
    const [profile, memRows] = await Promise.all([
      getProfile(session.userId),
      db
        .select({ content: memories.content, source: memories.source })
        .from(memories)
        .where(eq(memories.userId, session.userId))
        .orderBy(desc(memories.weight), desc(memories.createdAt))
        .limit(MEMORY_LIMIT),
    ])

    return Response.json({
      profile: profile
        ? {
            totalConversations: profile.totalConversations,
            recentPoems: profile.recentPoems,
            recentThemes: profile.recentThemes,
            activeDays7: profile.activeDays7,
            emotionalNotes: profile.emotionalNotes,
          }
        : null,
      memories: memRows,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: { code: 'SERVER_ERROR', message } }, { status: 500 })
  }
}
