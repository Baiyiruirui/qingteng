export type RecalledMemoryForContext = {
  content: string
  source: string | null
  similarity?: number
}

export function renderMemoryContext(recalled: RecalledMemoryForContext[]): string {
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
