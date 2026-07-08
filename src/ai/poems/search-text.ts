import type { PoemLine } from '@/db/schema'

export type PoemSearchSource = {
  title: string
  author: string
  dynasty: string | null
  grade?: string | null
  textType?: string | null
  themes?: string[] | null
  imagery?: string[] | null
  rhetoric?: string[] | null
  lines: PoemLine[]
}

function compactJoin(parts: Array<string | null | undefined>, separator = ' '): string {
  return parts
    .map(part => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(separator)
}

function unique(values: unknown[]): string[] {
  return [
    ...new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .map(value => value.trim())
        .filter(Boolean),
    ),
  ]
}

export function buildPoemSearchText(poem: PoemSearchSource): string {
  const lineContents = poem.lines.map(line => line.content).join(' ')
  const translations = poem.lines.map(line => line.translation ?? '').join(' ')
  const explanations = poem.lines.map(line => line.explanation ?? '').join(' ')
  const lineImagery = poem.lines.flatMap(line => line.imagery ?? [])
  const lineEmotion = poem.lines.flatMap(line => line.emotion ?? [])
  const translationKeywords = poem.lines.flatMap(line => line.translationKeywords ?? [])
  const tags = unique([
    ...(poem.themes ?? []),
    ...(poem.imagery ?? []),
    ...(poem.rhetoric ?? []),
    ...lineImagery,
    ...lineEmotion,
    ...translationKeywords,
  ])

  return compactJoin([
    `标题:${poem.title}`,
    `作者:${poem.author}`,
    poem.dynasty ? `朝代:${poem.dynasty}` : null,
    poem.grade ? `学段:${poem.grade}` : null,
    poem.textType ? `体裁:${poem.textType}` : null,
    tags.length > 0 ? `标签:${tags.join('、')}` : null,
    `原文:${lineContents}`,
    translations ? `译文:${translations}` : null,
    explanations ? `释义:${explanations}` : null,
  ])
}
