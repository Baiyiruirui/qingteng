import assert from 'node:assert/strict'
import {
  numberedSyllableToToneMark,
  pinyinFromTencentSubtitles,
} from '@/ai/recite/pinyin'
import {
  buildTtsSegments,
  isLongWholeChallenge,
  ReciteTargetError,
  resolveReciteTarget,
} from '@/ai/recite/target'
import type { PoemLine } from '@/db/schema'

function line(lineId: string, content: string): PoemLine {
  return { lineId, content }
}

function verifyPinyin() {
  assert.equal(numberedSyllableToToneMark('ni2'), 'ní')
  assert.equal(numberedSyllableToToneMark('hao3'), 'hǎo')
  assert.equal(numberedSyllableToToneMark('lv4'), 'lǜ')
  assert.equal(numberedSyllableToToneMark('yve4'), 'yuè')
  assert.equal(numberedSyllableToToneMark('jv1'), 'jū')
  assert.equal(numberedSyllableToToneMark('liu2'), 'liú')
  assert.equal(numberedSyllableToToneMark('gui1'), 'guī')
  assert.equal(numberedSyllableToToneMark('ma5'), 'ma')
  assert.equal(numberedSyllableToToneMark('sil'), 'sil')

  assert.equal(
    pinyinFromTencentSubtitles([
      { Text: '你', Phoneme: 'ni2' },
      { Text: '，', Phoneme: 'sil' },
      { Text: '好', Phoneme: 'hao3' },
    ], '你，好。'),
    'ní hǎo',
  )
  assert.equal(
    pinyinFromTencentSubtitles([{ Text: '你', Phoneme: 'ni2' }], '你好'),
    null,
  )
}

function verifyTargets() {
  const lines = [line('L1', '床前明月光'), line('L2', '疑是地上霜')]
  assert.deepEqual(resolveReciteTarget({ lines, mode: 'line', lineIndex: 1 }), {
    mode: 'line',
    lineIndex: 1,
    expectedText: '疑是地上霜',
    chineseCharCount: 5,
  })
  assert.equal(
    resolveReciteTarget({ lines, mode: 'poem', lineIndex: 99 }).expectedText,
    '床前明月光疑是地上霜',
  )
  assert.throws(
    () => resolveReciteTarget({ lines, mode: 'line', lineIndex: 2 }),
    ReciteTargetError,
  )
  const linesWithGap = [line('EMPTY', ''), line('L2', '疑是地上霜')]
  assert.throws(
    () => resolveReciteTarget({ lines: linesWithGap, mode: 'line', lineIndex: 0 }),
    ReciteTargetError,
  )
  assert.equal(
    resolveReciteTarget({ lines: linesWithGap, mode: 'line', lineIndex: 1 }).expectedText,
    '疑是地上霜',
  )

  assert.deepEqual(buildTtsSegments({ lines, mode: 'line', lineIndex: 0 }), ['床前明月光。'])
  const segments = buildTtsSegments({ lines, mode: 'poem', lineIndex: 0, limit: 6 })
  assert.deepEqual(segments, ['床前明月光，', '疑是地上霜。'])
  assert.equal(isLongWholeChallenge(lines), false)
  assert.equal(isLongWholeChallenge([line('LONG', '山'.repeat(121))]), true)
}

verifyPinyin()
verifyTargets()
console.log('recite core: 19/19 checks passed')
