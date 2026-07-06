/**
 * 山水页眉横幅：真水墨远山画（Owner 生成，public/yijing/mountain-right.webp），
 * multiply 融进宣纸底，底缘烘染渐隐。放在页面顶部（sticky header 之下）。
 */
export function ShanshuiBanner({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none relative h-36 w-full select-none overflow-hidden sm:h-44 ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/yijing/mountain-right.webp"
        alt=""
        className="h-full w-full object-cover opacity-90 mix-blend-multiply"
        style={{
          objectPosition: 'center 62%',
          maskImage:
            'linear-gradient(to bottom, black 0%, black 55%, transparent 96%)',
        }}
      />
    </div>
  )
}
