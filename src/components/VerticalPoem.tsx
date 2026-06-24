'use client'

import type { Poem } from '@/lib/poems'

export function VerticalPoem({ poem }: { poem: Poem }) {
  return (
    <div className="flex flex-row-reverse items-start justify-center gap-6 select-none">
      {poem.lines.map((line, i) => (
        <ol
          key={i}
          className="flex flex-col items-center gap-2 list-none animate-ink-rise"
          style={{ animationDelay: `${300 + i * 140}ms` }}
        >
          {line.split('').map((ch, j) => (
            <li key={j} className="font-serif text-3xl leading-none text-ink" style={{ letterSpacing: 0 }}>
              {ch}
            </li>
          ))}
        </ol>
      ))}

      <ol className="ml-2 flex flex-col items-center gap-2 list-none self-start pt-1 animate-ink-rise" style={{ animationDelay: '700ms' }}>
        {poem.title.split('').map((ch, j) => (
          <li key={`t-${j}`} className="font-serif text-xl leading-none text-ink-mid">{ch}</li>
        ))}
        <li aria-hidden className="my-1 h-4 w-px bg-edge" />
        {`${poem.dynasty}·${poem.author}`.split('').map((ch, j) => (
          <li key={`a-${j}`} className="font-serif text-base leading-none text-ink-faint">{ch}</li>
        ))}
      </ol>
    </div>
  )
}
