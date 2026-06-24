type Props = {
  size?: number
  className?: string
  tilt?: boolean
}

export function SealStamp({ size = 56, className = '', tilt = false }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      fill="none"
      className={className}
      style={tilt ? { transform: 'rotate(-6deg)' } : undefined}
      aria-hidden="true"
    >
      {/* 外框 */}
      <rect x="2" y="2" width="52" height="52" stroke="#C0623F" strokeWidth="2.5" />
      {/* 内框 */}
      <rect x="7" y="7" width="42" height="42" stroke="#C0623F" strokeWidth="0.8" />
      {/* 淡底色 */}
      <rect x="2" y="2" width="52" height="52" fill="#C0623F" fillOpacity="0.05" />
      {/* 青 */}
      <text
        x="28"
        y="22"
        textAnchor="middle"
        fill="#C0623F"
        fontSize="14"
        fontFamily="serif"
        fontWeight="500"
        letterSpacing="1"
      >
        青
      </text>
      {/* 藤 */}
      <text
        x="28"
        y="40"
        textAnchor="middle"
        fill="#C0623F"
        fontSize="14"
        fontFamily="serif"
        fontWeight="500"
        letterSpacing="1"
      >
        藤
      </text>
    </svg>
  )
}
