import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const COOKIE_NAME = 'qt_session'

function getSecret() {
  const s = process.env.JWT_SECRET
  if (!s) return null
  return new TextEncoder().encode(s)
}

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value
  const secret = getSecret()

  if (!token || !secret) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  try {
    const { payload } = await jwtVerify(token, secret)
    const userId = payload.userId as string
    const response = NextResponse.next()
    response.headers.set('x-user-id', userId)
    return response
  } catch {
    return NextResponse.redirect(new URL('/login', request.url))
  }
}

export const config = {
  matcher: ['/chat', '/chat/:path*'],
}
