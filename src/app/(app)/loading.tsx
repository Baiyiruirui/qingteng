import { AppNav } from '@/components/AppNav'

export default function AppLoading() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <AppNav />
      <main className="mx-auto max-w-6xl space-y-5 px-4 py-8" aria-busy="true" aria-label="页面加载中">
        <div className="h-7 w-36 animate-pulse rounded-lg bg-paper-block" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-44 animate-pulse rounded-xl border border-edge bg-white/45" />
          <div className="h-44 animate-pulse rounded-xl border border-edge bg-white/45" />
          <div className="h-44 animate-pulse rounded-xl border border-edge bg-white/45" />
        </div>
      </main>
    </div>
  )
}
