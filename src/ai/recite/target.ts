import type { PoemLine } from '@/db/schema'
import { normalizeChineseText, poemLinesToText } from '@/ai/recite/score'

export const TTS_TEXT_LIMIT = 150
export const WHOLE_CHALLENGE_MAX_CHARS = 120
export const LINE_RECORDING_SECONDS = 20
export const POEM_RECORDING_SECONDS = 60

export type ReciteMode = 'line' | 'poem'

export class ReciteTargetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReciteTargetError'
  }
}

export type ReciteTarget = {
  mode: ReciteMode
  lineIndex: number | null
  expectedText: string
  chineseCharCount: number
}

function nonEmptyLines(lines: PoemLine[]): PoemLine[] {
  return lines.filter(line => normalizeChineseText(line.content).length > 0)
}

export function resolveReciteTarget({
  lines,
  mode,
  lineIndex,
}: {
  lines: PoemLine[]
  mode: ReciteMode
  lineIndex: number
}): ReciteTarget {
  const availableLines = nonEmptyLines(lines)
  if (availableLines.length === 0) {
    throw new ReciteTargetError('这首诗缺少可练习的原文')
  }

  if (mode === 'line') {
    const selected = lines[lineIndex]
    if (!selected || normalizeChineseText(selected.content).length === 0) {
      throw new ReciteTargetError('朗读句子不存在')
    }
    return {
      mode,
      lineIndex,
      expectedText: selected.content,
      chineseCharCount: normalizeChineseText(selected.content).length,
    }
  }

  const expectedText = poemLinesToText(availableLines)
  return {
    mode,
    lineIndex: null,
    expectedText,
    chineseCharCount: normalizeChineseText(expectedText).length,
  }
}

function lineForSpeech(content: string, index: number, total: number) {
  const punctuation = index === total - 1 || index % 2 === 1 ? '。' : '，'
  return `${content}${punctuation}`
}

function splitLongText(text: string, limit: number): string[] {
  const chars = Array.from(text)
  const parts: string[] = []
  for (let index = 0; index < chars.length; index += limit) {
    parts.push(chars.slice(index, index + limit).join(''))
  }
  return parts
}

export function buildTtsSegments({
  lines,
  mode,
  lineIndex,
  limit = TTS_TEXT_LIMIT,
}: {
  lines: PoemLine[]
  mode: ReciteMode
  lineIndex: number
  limit?: number
}): string[] {
  if (limit < 1) throw new ReciteTargetError('朗读分段长度无效')
  const availableLines = nonEmptyLines(lines)
  const target = resolveReciteTarget({ lines, mode, lineIndex })

  if (mode === 'line') {
    return splitLongText(`${target.expectedText}。`, limit)
  }

  const spokenLines = availableLines.map((line, index) =>
    lineForSpeech(line.content, index, availableLines.length))
  const segments: string[] = []
  let current = ''

  for (const spokenLine of spokenLines) {
    if (Array.from(spokenLine).length > limit) {
      if (current) segments.push(current)
      segments.push(...splitLongText(spokenLine, limit))
      current = ''
      continue
    }
    if (Array.from(current + spokenLine).length > limit) {
      if (current) segments.push(current)
      current = spokenLine
    } else {
      current += spokenLine
    }
  }
  if (current) segments.push(current)
  return segments
}

export function isLongWholeChallenge(lines: PoemLine[]): boolean {
  return normalizeChineseText(poemLinesToText(lines)).length > WHOLE_CHALLENGE_MAX_CHARS
}
