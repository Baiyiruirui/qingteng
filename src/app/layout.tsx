import type { Metadata } from 'next'
import 'lxgw-wenkai-webfont/style.css'
import './globals.css'

export const metadata: Metadata = {
  title: '青藤',
  description: '有记忆、会陪你长大的 AI 诗友',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
    >
      {/* 宣纸纹理层：极淡 SVG 噪点，fixed 最底层 */}
      <body className="min-h-full flex flex-col">
        <svg
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: -1,
            width: '100%',
            height: '100%',
            opacity: 0.04,
            pointerEvents: 'none',
          }}
        >
          <filter id="paper-noise">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" />
          </filter>
          <rect width="100%" height="100%" filter="url(#paper-noise)" />
        </svg>
        {children}
      </body>
    </html>
  )
}
