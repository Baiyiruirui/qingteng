"use client"

import type React from "react"
import { useState } from "react"
import { Seal, CornerMark } from "./seal"

export function AuthCard() {
  const [mode, setMode] = useState<"login" | "register">("login")
  const isLogin = mode === "login"

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // 表单提交逻辑占位
  }

  return (
    <div className="animate-ink-rise relative w-full max-w-[380px]" style={{ animationDelay: "0.25s" }}>
      {/* 无边框信笺:像画上裱的一方信笺,弱投影 + 极淡内描边 */}
      <div
        className="relative px-9 py-10"
        style={{
          backgroundColor: "rgba(249, 245, 236, 0.94)",
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.6) inset, 0 0 0 1px rgba(216,207,188,0.45), 0 18px 50px -24px rgba(46,58,52,0.30)",
        }}
      >
        {/* 顶部裱边淡线 */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(192,98,63,0.35) 20%, rgba(192,98,63,0.35) 80%, transparent)",
          }}
        />

        {/* 四角回纹 */}
        <CornerMark position="tl" className="m-3 text-jade/45" />
        <CornerMark position="tr" className="m-3 text-jade/45" />
        <CornerMark position="bl" className="m-3 text-jade/45" />
        <CornerMark position="br" className="m-3 text-jade/45" />

        {/* 品牌 */}
        <div className="mb-7 flex items-center gap-3">
          <Seal char="藤" size={42} />
          <div>
            <h1 className="font-serif text-[30px] font-semibold leading-none text-ink">青藤</h1>
            <p className="mt-1.5 font-serif text-xs tracking-[0.2em] text-ink-mid">
              与一位 AI 诗友，一起读诗
            </p>
          </div>
        </div>

        {/* 标题 */}
        <div className="mb-6">
          <h2 className="font-serif text-[22px] text-ink">{isLogin ? "回来了" : "青藤认识你"}</h2>
          <p className="mt-1 font-serif text-sm text-ink-faint">
            {isLogin ? "青藤在这里等你" : "起个名字吧"}
          </p>
        </div>

        {/* 表单 */}
        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          {!isLogin && <InkField label="名字" placeholder="如何称呼你" />}
          <InkField label="用户名" placeholder="你的用户名" />
          <InkField label="密码" type="password" placeholder="你的密码" />

          <button
            type="submit"
            className="mt-2 w-full rounded-[8px] border border-ink/15 bg-primary py-3 font-serif text-[15px] tracking-[3px] text-primary-foreground transition-all hover:brightness-110 hover:shadow-md active:scale-[0.99]"
          >
            {isLogin ? "进来" : "开始"}
          </button>
        </form>

        {/* 切换 */}
        <p className="mt-6 text-center font-serif text-sm text-ink-mid">
          {isLogin ? "第一次来？ " : "已经有账号了？ "}
          <button
            type="button"
            onClick={() => setMode(isLogin ? "register" : "login")}
            className="font-medium text-cinnabar underline-offset-4 transition-colors hover:underline"
          >
            {isLogin ? "注册" : "登录"}
          </button>
        </p>
      </div>
    </div>
  )
}

// 毛笔起笔下划线输入框
function InkField({
  label,
  type = "text",
  placeholder,
}: {
  label: string
  type?: string
  placeholder?: string
}) {
  return (
    <label className="group flex flex-col gap-1.5">
      <span className="font-serif text-xs tracking-wider text-ink-mid">{label}</span>
      <div className="relative">
        <input
          type={type}
          placeholder={placeholder}
          className="w-full rounded-[8px] border border-edge bg-paper/60 px-3.5 py-2.5 font-sans text-sm text-ink outline-none transition-colors placeholder:text-ink-faint/70 focus:border-jade focus:bg-paper"
        />
        {/* 焦点时毛笔起笔下划线 */}
        <span className="pointer-events-none absolute -bottom-px left-1/2 h-px w-0 -translate-x-1/2 bg-jade transition-all duration-300 group-focus-within:w-[calc(100%-12px)]" />
      </div>
    </label>
  )
}
