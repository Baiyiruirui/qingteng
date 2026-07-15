'use client'

import Link from 'next/link'
import { RotateCcw } from 'lucide-react'
import { AppNav } from '@/components/AppNav'
import { SealStamp } from '@/components/SealStamp'

export default function AppError({ reset }: { reset: () => void }) {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <AppNav title="暂未展开" />
      <main className="mx-auto flex min-h-[65vh] max-w-xl flex-col items-center justify-center gap-4 px-4 text-center">
        <SealStamp size={44} tilt />
        <h1 className="font-serif text-2xl text-ink">这一页暂时没有展开</h1>
        <p className="text-sm leading-7 text-ink-mid">可以再试一次，或先回到今日案头。</p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-85"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            重试
          </button>
          <Link href="/chat" className="rounded-lg border border-edge px-4 py-2 text-sm font-medium text-ink-mid hover:bg-paper-block">
            返回今日案头
          </Link>
        </div>
      </main>
    </div>
  )
}
