import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { COOKIE_NAME } from '@/lib/auth'
import { getSession } from '@/lib/auth-server'
import { clearShortTerm } from '@/ai/memory/short-term'

export async function POST() {
  // Get userId before clearing the cookie
  const session = await getSession()
  if (session) {
    clearShortTerm(session.userId).catch(e =>
      console.error('[logout] clearShortTerm failed:', e),
    )
  }

  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
  return NextResponse.json({ ok: true })
}
