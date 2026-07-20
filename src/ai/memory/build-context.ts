import 'server-only'
import { isMemoryEnabled } from '@/lib/memory-preferences'
import { getProfile } from './mid-term'
export { renderMemoryContext } from './render-context'

export async function buildSystemContext(userId: string, userName: string): Promise<string> {
  if (!(await isMemoryEnabled(userId))) return ''

  const profile = await getProfile(userId)
  if (!profile || !(await isMemoryEnabled(userId))) return ''

  const hasData =
    profile.recentPoems.length > 0 ||
    profile.recentThemes.length > 0 ||
    profile.totalConversations > 1

  if (!hasData) return ''

  const lines: string[] = [
    '---',
    '【关于这位学生的背景,仅供你参考,不要主动罗列给他听】',
    `他叫 ${userName},到目前和你聊过 ${profile.totalConversations} 次。`,
  ]

  if (profile.recentPoems.length > 0) {
    lines.push(`最近他接触过这些诗:${profile.recentPoems.join('、')}。`)
  }

  if (profile.recentThemes.length > 0) {
    lines.push(`触及的主题:${profile.recentThemes.join('、')}。`)
  }

  if (profile.activeDays7 > 0) {
    lines.push(`近 7 天有 ${profile.activeDays7} 天来找过你。`)
  }

  if (profile.emotionalNotes.length > 0) {
    lines.push(`他最近流露过这样的情绪:${profile.emotionalNotes.join('、')}。`)
  }

  lines.push(
    '',
    '请把这些当作你"本来就认识他"的自然记忆。只在话题相关时自然带出,',
    '不要一开口就汇报这些信息,也不要因此增加提问的密度。',
    '---',
  )

  return '\n\n' + lines.join('\n')
}
