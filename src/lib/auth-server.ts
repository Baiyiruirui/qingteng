import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { verifySession, COOKIE_NAME } from './auth'

export async function getSession(): Promise<{ userId: string } | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifySession(token)
}

export async function requireAuth(): Promise<{ userId: string }> {
  const session = await getSession()
  if (!session) redirect('/login')
  return session
}

export async function getCurrentUser() {
  const session = await getSession()
  if (!session) return null
  const [user] = await db
    .select({ id: users.id, name: users.name, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1)
  return user ?? null
}
