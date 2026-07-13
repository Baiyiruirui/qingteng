'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpenText, ClipboardCheck, MessageCircle, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { Seal } from '@/components/Seal'

const navItems = [
  { href: '/chat', label: '今日案头', icon: MessageCircle },
  { href: '/poems', label: '诗笺地图', icon: BookOpenText },
  { href: '/wrong', label: '待加强', icon: ClipboardCheck },
  { href: '/profile', label: '我的', icon: UserRound },
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
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/chat" className="flex shrink-0 items-center gap-2">
            <Seal char="藤" size={28} />
            <span className="font-kai text-[24px] leading-none text-ink">青藤</span>
          </Link>
          {title && (
            <span className="truncate border-l border-edge pl-3 font-serif text-sm text-ink-mid sm:pl-4 sm:tracking-[0.18em]">
              {title}
            </span>
          )}
        </div>

        <nav className="col-span-2 row-start-2 flex items-center justify-between gap-0.5 overflow-x-auto sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:justify-center sm:gap-1">
          {navItems.map(item => {
            const Icon = item.icon
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={
                  active
                    ? 'flex shrink-0 items-center gap-1.5 rounded-lg bg-ink px-2.5 py-2 text-xs font-medium text-paper-block sm:px-3'
                    : 'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-ink-mid transition-colors hover:bg-paper-block hover:text-ink sm:px-3'
                }
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="col-start-2 row-start-1 flex min-w-0 items-center justify-end gap-3 text-xs text-ink-faint sm:col-start-3 sm:min-w-28">
          {userName && <span className="truncate">你好，{userName}</span>}
          {right}
        </div>
      </div>
    </header>
  )
}
