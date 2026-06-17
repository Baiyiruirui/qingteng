import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { users } from '@/db/schema'
import { verifyPassword, signSession, COOKIE_NAME } from '@/lib/auth'

const schema = z.object({
  name: z.string().min(1),
  password: z.string().min(1),
})

const SESSION_MAX_AGE = 60 * 60 * 24 * 7

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: '请填写用户名和密码' } },
      { status: 400 },
    )
  }

  const { name, password } = parsed.data

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.name, name))
    .limit(1)

  const ok = user ? await verifyPassword(password, user.passwordHash) : false
  if (!ok) {
    return NextResponse.json(
      { error: { code: 'INVALID_CREDENTIALS', message: '用户名或密码错误' } },
      { status: 401 },
    )
  }

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
