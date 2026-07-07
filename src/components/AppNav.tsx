'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpenText, ClipboardCheck, MessageCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Seal } from '@/components/Seal'

const navItems = [
  { href: '/chat', label: '今日案头', icon: MessageCircle },
  { href: '/poems', label: '诗笺地图', icon: BookOpenText },
  { href: '/wrong', label: '待加强', icon: ClipboardCheck },
]

export function AppNav({
  title,
  userName,
  right,
}: {
  title?: string
  userName?: string
  right?: ReactNode
}) {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-30 border-b border-edge bg-paper/85 px-4 py-3 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between gap-4">
          <Link href="/chat" className="flex items-center gap-2">
            <Seal char="藤" size={28} />
            <span className="font-kai text-[24px] leading-none text-ink">青藤</span>
          </Link>
          {title && (
            <span className="hidden border-l border-edge pl-4 font-serif text-sm tracking-[0.18em] text-ink-mid sm:inline">
              {title}
            </span>
          )}
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto">
          {navItems.map(item => {
            const Icon = item.icon
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  active
                    ? 'flex shrink-0 items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-xs font-medium text-paper-block'
                    : 'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-ink-mid transition-colors hover:bg-paper-block hover:text-ink'
                }
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center justify-between gap-3 text-xs text-ink-faint sm:min-w-28 sm:justify-end">
          {userName && <span className="truncate">你好，{userName}</span>}
          {right}
        </div>
      </div>
    </header>
  )
}
