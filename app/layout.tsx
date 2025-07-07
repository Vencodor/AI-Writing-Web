import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Ai Writer',
  description: 'AI 기반 글쓰기 도구',
  generator: 'DooSeong',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
