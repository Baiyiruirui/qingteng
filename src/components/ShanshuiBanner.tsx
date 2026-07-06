/**
 * 山水页眉横幅：一条水墨远山带，放在页面顶部（sticky header 之下）。
 * 清晰可见但克制，底缘烘染融入宣纸，不干扰下方内容。锁定现有水墨 token。
 */
export function ShanshuiBanner({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none relative h-36 w-full overflow-hidden sm:h-44 ${className}`}
    >
      {/* 一抹横向云雾（留白呼吸） */}
      <div
        className="absolute inset-x-0 top-6 h-16 opacity-60 blur-2xl"
        style={{
          background:
            'linear-gradient(180deg, transparent, rgba(247,244,236,0.85) 50%, transparent)',
        }}
      />

      {/* 远山（三层墨色，由山脚向上烘染渐隐） */}
      <svg
        className="absolute inset-x-0 bottom-0 h-full w-full"
        viewBox="0 0 1440 200"
        preserveAspectRatio="xMidYMax slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="ssb-far" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="var(--color-jade)" stopOpacity="0.24" />
            <stop offset="70%" stopColor="var(--color-jade)" stopOpacity="0.08" />
            <stop offset="100%" stopColor="var(--color-jade)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="ssb-mid" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="var(--color-ink-mid)" stopOpacity="0.3" />
            <stop offset="60%" stopColor="var(--color-ink-mid)" stopOpacity="0.1" />
            <stop offset="100%" stopColor="var(--color-ink-mid)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="ssb-near" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="var(--color-ink)" stopOpacity="0.34" />
            <stop offset="55%" stopColor="var(--color-ink)" stopOpacity="0.12" />
            <stop offset="100%" stopColor="var(--color-ink)" stopOpacity="0" />
          </linearGradient>
          {/* 底缘融入宣纸：用一层 paper 渐变盖住山脚硬边 */}
          <linearGradient id="ssb-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-paper)" stopOpacity="0" />
            <stop offset="100%" stopColor="var(--color-paper)" stopOpacity="1" />
          </linearGradient>
        </defs>

        {/* 最远层：淡青，平缓 */}
        <path
          fill="url(#ssb-far)"
          d="M0,150 C180,95 320,115 480,88 C660,58 820,108 1010,82 C1210,54 1330,92 1440,74 L1440,200 L0,200 Z"
        />
        {/* 中景：灰绿，主峰偏左 */}
        <path
          fill="url(#ssb-mid)"
          d="M0,175 C160,120 300,150 430,108 C560,66 700,124 880,112 C1080,98 1240,140 1440,116 L1440,200 L0,200 Z"
        />
        {/* 近景：浓墨，右侧一峰拔起 */}
        <path
          fill="url(#ssb-near)"
          d="M0,190 C220,168 380,178 560,164 C760,148 900,172 1080,150 C1240,132 1330,164 1440,150 L1440,200 L0,200 Z"
        />
        {/* 底缘烘染 */}
        <rect x="0" y="120" width="1440" height="80" fill="url(#ssb-fade)" />
      </svg>
    </div>
  )
}
