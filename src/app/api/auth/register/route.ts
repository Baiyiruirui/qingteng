import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { users } from '@/db/schema'
import { hashPassword, signSession, COOKIE_NAME } from '@/lib/auth'

const schema = z.object({
  name: z.string().min(1).max(20),
  password: z.string().min(6),
})

const SESSION_MAX_AGE = 60 * 60 * 24 * 7

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: '用户名 1-20 字符,密码至少 6 位' } },
      { status: 400 },
    )
  }

  const { name, password } = parsed.data

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.name, name))
    .limit(1)

  if (existing.length > 0) {
    return NextResponse.json(
      { error: { code: 'NAME_TAKEN', message: '用户名已被使用' } },
      { status: 409 },
    )
  }

  const passwordHash = await hashPassword(password)
  const [user] = await db
    .insert(users)
    .values({ name, passwordHash })
    .returning({ id: users.id, name: users.name })

  const token = await signSession(user.id)
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  })

  return NextResponse.json({ userId: user.id, name: user.name })
}
