import type { PoemLine } from '@/db/schema'

export type ReciteScore = {
  accuracy: number
  matchedChars: number
  totalChars: number
  missingChars: string[]
  extraChars: string[]
  feedback: string
}

const CJK_PATTERN = /[\u3400-\u9fff]/g

export function normalizeChineseText(text: string): string {
  return (text.match(CJK_PATTERN) ?? []).join('')
}

export function poemLinesToText(lines: PoemLine[]): string {
  return lines.map(line => line.content).join('')
}

function lcsMatrix(a: string, b: string): number[][] {
  const dp = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0))
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  return dp
}

function diffByLcs(expected: string, actual: string) {
  const dp = lcsMatrix(expected, actual)
  const matchedExpected = new Set<number>()
  const matchedActual = new Set<number>()
  let i = expected.length
  let j = actual.length

  while (i > 0 && j > 0) {
    if (expected[i - 1] === actual[j - 1]) {
      matchedExpected.add(i - 1)
      matchedActual.add(j - 1)
      i--
      j--
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }

  return {
    matched: dp[expected.length][actual.length],
    missingChars: [...expected].filter((_, index) => !matchedExpected.has(index)).slice(0, 12),
    extraChars: [...actual].filter((_, index) => !matchedActual.has(index)).slice(0, 12),
  }
}

function feedbackFor(accuracy: number, missingChars: string[]): string {
  if (accuracy >= 0.92) return '读得很稳，字句基本都对上了。下一遍可以更留意停顿和气息。'
  if (accuracy >= 0.75) {
    return missingChars.length > 0
      ? `整体已经顺了，留意这几个字：${missingChars.join('、')}。`
      : '整体已经顺了，再慢一点会更清楚。'
  }
  if (accuracy >= 0.5) return '已经读出一半以上了。先放慢速度，把每句末尾读清楚。'
  return '这次识别到的内容还比较少。可以离麦克风近一点，按原诗逐句再读一遍。'
}

export function scoreRecitation({
  expectedText,
  transcript,
}: {
  expectedText: string
  transcript: string
}): ReciteScore {
  const expected = normalizeChineseText(expectedText)
  const actual = normalizeChineseText(transcript)
  if (expected.length === 0) {
    return {
      accuracy: 0,
      matchedChars: 0,
      totalChars: 0,
      missingChars: [],
      extraChars: [],
      feedback: '这首诗缺少可评分的原文。'
    }
  }

  const diff = diffByLcs(expected, actual)
  const accuracy = diff.matched / expected.length

  return {
    accuracy,
    matchedChars: diff.matched,
    totalChars: expected.length,
    missingChars: diff.missingChars,
    extraChars: diff.extraChars,
    feedback: feedbackFor(accuracy, diff.missingChars),
  }
}
