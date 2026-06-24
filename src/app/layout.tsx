import type { Metadata } from 'next'
import { Geist, Geist_Mono, Noto_Serif_SC } from 'next/font/google'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

const notoSerifSC = Noto_Serif_SC({
  variable: '--font-noto-serif-sc',
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  preload: false,
})

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
      className={`${geistSans.variable} ${geistMono.variable} ${notoSerifSC.variable} h-full antialiased`}
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
