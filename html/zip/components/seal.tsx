interface SealProps {
  char?: string
  size?: number
  className?: string
}

// 朱砂方形篆刻印章:双边框 + 做旧斑驳
export function Seal({ char = "藤", size = 40, className = "" }: SealProps) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center select-none ${className}`}
      style={{ width: size, height: size }}
    >
      {/* 外框 */}
      <span
        className="absolute inset-0 rounded-[7px]"
        style={{
          backgroundColor: "#C0623F",
          // 做旧斑驳:叠加不规则的浅色斑点,模拟印泥不匀
          backgroundImage:
            "radial-gradient(circle at 28% 32%, rgba(247,244,236,0.22) 0 1.2px, transparent 1.6px)," +
            "radial-gradient(circle at 68% 22%, rgba(247,244,236,0.18) 0 1px, transparent 1.4px)," +
            "radial-gradient(circle at 78% 72%, rgba(247,244,236,0.2) 0 1.3px, transparent 1.7px)," +
            "radial-gradient(circle at 35% 78%, rgba(247,244,236,0.16) 0 1px, transparent 1.4px)",
          boxShadow: "0 1px 3px rgba(192,98,63,0.4)",
        }}
      />
      {/* 内描边 */}
      <span
        className="absolute rounded-[4px]"
        style={{
          inset: size * 0.13,
          border: "1px solid rgba(247,244,236,0.55)",
        }}
      />
      <span
        className="relative font-serif font-medium"
        style={{
          color: "#F7F4EC",
          fontSize: size * 0.46,
          lineHeight: 1,
        }}
      >
        {char}
      </span>
    </span>
  )
}

// 回纹 / 竹节角标:用于卡片四角装饰
export function CornerMark({
  position,
  className = "",
}: {
  position: "tl" | "tr" | "bl" | "br"
  className?: string
}) {
  const rotate = { tl: 0, tr: 90, br: 180, bl: 270 }[position]
  const pos = {
    tl: "left-0 top-0",
    tr: "right-0 top-0",
    bl: "left-0 bottom-0",
    br: "right-0 bottom-0",
  }[position]
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute ${pos} ${className}`}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path
          d="M2 11 L2 2 L11 2"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <path
          d="M6 11 L6 6 L11 6"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.6"
        />
      </svg>
    </span>
  )
}
