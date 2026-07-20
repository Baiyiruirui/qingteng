const TRIVIAL_PARTS = [
  '你好',
  '您好',
  '嗨',
  '哈喽',
  'hello',
  'hi',
  '在吗',
  '谢谢',
  '多谢',
  '感谢',
  '好的',
  '好吧',
  '好',
  '行',
  '可以',
  '收到',
  '知道了',
  '我知道了',
  '明白了',
  '我明白了',
  '懂了',
  '没问题',
  'ok',
  'okay',
  '对',
  '是的',
  '嗯',
  '嗯嗯',
  '啊',
  '哦',
  '继续',
  '下一步',
  '再见',
  '拜拜',
  '晚安',
  '早安',
  '结束',
] as const

const OPTIONAL_ADDRESS = /^(?:青藤先生|青藤|老师|先生)[,，:：\s]*/iu
const TRAILING_ADDRESS = /(?:青藤先生|青藤|老师|先生)$/u
const SEPARATORS = /[\s,，。.!！?？、~～]+/gu

function normalizeUtterance(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('zh-CN')
    .replace(OPTIONAL_ADDRESS, '')
    .replace(SEPARATORS, '')
    .replace(TRAILING_ADDRESS, '')
}

const normalizedTrivialParts = [...TRIVIAL_PARTS]
  .map(normalizeUtterance)
  .sort((a, b) => b.length - a.length)

export function shouldSkipMemoryExtraction(userText: string): boolean {
  let remaining = normalizeUtterance(userText)
  if (!remaining) return true

  while (remaining.length > 0) {
    const part = normalizedTrivialParts.find(candidate => remaining.startsWith(candidate))
    if (!part) return false
    remaining = remaining.slice(part.length)
  }

  return true
}

export function userTextFromChatTranscript(transcript: string): string {
  const userSection = transcript.split(/\n青藤\s*[:：]/u, 1)[0] ?? ''
  return userSection.replace(/^[^\n:：]{1,40}\s*[:：]\s*/u, '').trim()
}
