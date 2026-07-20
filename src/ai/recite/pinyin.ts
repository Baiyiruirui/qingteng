export type TencentSubtitle = {
  Text: string
  Phoneme?: string
}

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'ü'])
const TONE_MARKS: Record<string, string[]> = {
  a: ['a', 'ā', 'á', 'ǎ', 'à'],
  e: ['e', 'ē', 'é', 'ě', 'è'],
  i: ['i', 'ī', 'í', 'ǐ', 'ì'],
  o: ['o', 'ō', 'ó', 'ǒ', 'ò'],
  u: ['u', 'ū', 'ú', 'ǔ', 'ù'],
  ü: ['ü', 'ǖ', 'ǘ', 'ǚ', 'ǜ'],
}

function toneIndex(syllable: string): number {
  const a = syllable.indexOf('a')
  if (a >= 0) return a
  const e = syllable.indexOf('e')
  if (e >= 0) return e
  const ou = syllable.indexOf('ou')
  if (ou >= 0) return ou

  for (let index = syllable.length - 1; index >= 0; index--) {
    if (VOWELS.has(syllable[index])) return index
  }
  return -1
}

export function numberedSyllableToToneMark(input: string): string | null {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/u:|v/g, 'ü')
    .replace(/^([jqxy])ü/, '$1u')
  const match = normalized.match(/^([a-zü]+)([0-5])?$/)
  if (!match) return null
  const syllable = match[1]
  const tone = Number(match[2] ?? 0)
  const index = toneIndex(syllable)
  if (index < 0) return null
  if (tone === 0 || tone === 5) return syllable

  const vowel = syllable[index]
  const marked = TONE_MARKS[vowel]?.[tone]
  if (!marked) return null
  return `${syllable.slice(0, index)}${marked}${syllable.slice(index + 1)}`
}

function phonemeSyllables(phoneme: string): string[] {
  const tokens = phoneme.match(/[a-zA-ZüÜvV:]+[0-5]?/g) ?? []
  return tokens
    .map(numberedSyllableToToneMark)
    .filter((value): value is string => value !== null)
}

export function pinyinFromTencentSubtitles(
  subtitles: TencentSubtitle[],
  expectedText: string,
): string | null {
  const expectedCount = (expectedText.match(/[\u3400-\u9fff]/g) ?? []).length
  if (expectedCount === 0 || subtitles.length === 0) return null

  const syllables = subtitles
    .filter(subtitle => /[\u3400-\u9fff]/.test(subtitle.Text))
    .flatMap(subtitle =>
    subtitle.Phoneme ? phonemeSyllables(subtitle.Phoneme) : [])
  if (syllables.length !== expectedCount) return null
  return syllables.join(' ')
}
