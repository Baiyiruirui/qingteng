import 'server-only'
import { getSession } from '@/lib/auth-server'

export async function canUseInternalTools() {
  if (process.env.NODE_ENV !== 'production') return true

  const session = await getSession()
  if (!session) return false

  const adminIds = (process.env.QT_ADMIN_USER_IDS ?? '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean)

  return adminIds.includes(session.userId)
}
