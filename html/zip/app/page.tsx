"use client"

import { useEffect, useState } from "react"
import { AuthCard } from "@/components/auth-card"
import { VerticalPoem } from "@/components/vertical-poem"
import { poems, randomPoem, type Poem } from "@/lib/poems"

export default function Page() {
  // 初始用固定第一首避免水合不一致,挂载后随机换
  const [poem, setPoem] = useState<Poem>(poems[0])

  useEffect(() => {
    setPoem(randomPoem())
  }, [])

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-paper">
      {/* 宣纸纤维纹理 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 opacity-60 mix-blend-multiply"
        style={{
          backgroundImage: "url(/paper-texture.png)",
          backgroundSize: "480px 480px",
        }}
      />

      {/* 水墨主视觉 */}
      <div
        aria-hidden="true"
        className="animate-vine-sway pointer-events-none absolute inset-0 z-0 bg-no-repeat opacity-90"
        style={{
          backgroundImage: "url(/ink-scene.png)",
          backgroundSize: "cover",
          backgroundPosition: "left center",
        }}
      />

      {/* 暖月光晕(呼吸) */}
      <div
        aria-hidden="true"
        className="animate-moon-breathe pointer-events-none absolute right-[14%] top-[12%] z-0 h-44 w-44 rounded-full blur-2xl"
        style={{
          background: "radial-gradient(circle, rgba(232,201,160,0.7) 0%, rgba(232,201,160,0) 70%)",
        }}
      />

      {/* 内容层 */}
      <div className="relative z-10 mx-auto flex min-h-dvh max-w-6xl flex-col items-center justify-center gap-12 px-6 py-12 lg:flex-row lg:justify-between lg:gap-8">
        {/* 左侧:竖排诗句(古籍版面) */}
        <div className="animate-ink-rise hidden lg:block" style={{ animationDelay: "0.05s" }}>
          <VerticalPoem poem={poem} />
        </div>

        {/* 右侧:表单卡片 */}
        <AuthCard />
      </div>

      {/* 移动端底部诗句 */}
      <p className="animate-ink-rise absolute bottom-6 left-1/2 z-10 -translate-x-1/2 text-center font-serif text-sm text-ink-faint lg:hidden">
        {poem.lines[0]}，{poem.lines[1]}
      </p>
    </main>
  )
}
