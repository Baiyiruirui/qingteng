import 'server-only'
import { getProfile } from './mid-term'
import type { RecalledMemory } from './long-term'

export async function buildSystemContext(userId: string, userName: string): Promise<string> {
  const profile = await getProfile(userId)
  if (!profile) return ''

  const hasData =
    profile.recentPoems.length > 0 ||
    profile.recentThemes.length > 0 ||
    profile.totalConversations > 1

  if (!hasData) return ''

  console.log(
    `[mid-term] context | user:${userId.slice(0, 8)} | poems:[${profile.recentPoems.join(', ')}] | themes:[${profile.recentThemes.join(', ')}] | days7:${profile.activeDays7}`,
  )

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

export function renderMemoryContext(recalled: RecalledMemory[]): string {
  if (recalled.length === 0) return ''

  const byKind = {
    preference: recalled.filter(m => m.source === 'preference'),
    emotion: recalled.filter(m => m.source === 'emotion'),
    confusion: recalled.filter(m => m.source === 'confusion'),
    personal: recalled.filter(m => m.source === 'personal'),
    other: recalled.filter(
      m => !['preference', 'emotion', 'confusion', 'personal'].includes(m.source ?? ''),
    ),
  }

  const lines: string[] = [
    '---',
    '【你对这位学生的长期记忆】',
    '',
    '⚠️ 严格规则:',
    '- 绝对不得编造你们"上次聊过"但以下记忆里并未记录的具体事件',
    '- 绝对不得把抽象印象(如"他喜欢李白")演绎成虚构的具体经历(如"上次聊李白折菊")',
    '- 你只能引用以下记忆中确实存在的内容。记忆只说"他喜欢李白",你就只知道这五个字,不知道任何具体故事',
    '',
  ]

  if (byKind.preference.length > 0) {
    lines.push('他的长期偏好(选择诗歌时务必尊重,这是硬约束):')
    byKind.preference.forEach(m => lines.push(`- ${m.content}`))
    lines.push('')
  }

  if (byKind.emotion.length > 0) {
    lines.push('他近期的情绪状态(影响你的语气,不影响选诗偏好):')
    byKind.emotion.forEach(m => lines.push(`- ${m.content}`))
    lines.push('')
  }

  if (byKind.confusion.length > 0) {
    lines.push('他遇到过的困惑:')
    byKind.confusion.forEach(m => lines.push(`- ${m.content}`))
    lines.push('')
  }

  if (byKind.personal.length > 0) {
    lines.push('他分享过的个人片段:')
    byKind.personal.forEach(m => lines.push(`- ${m.content}`))
    lines.push('')
  }

  if (byKind.other.length > 0) {
    byKind.other.forEach(m => lines.push(`- ${m.content}`))
    lines.push('')
  }

  lines.push('推荐诗歌时,既要照顾他的情绪,也不要违背他的明确偏好。')
  lines.push('---')

  return '\n\n' + lines.join('\n')
}
