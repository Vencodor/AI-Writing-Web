import type { Metadata } from 'next'
import './globals.css'
import { useEffect } from "react";

export const metadata: Metadata = {
  title: 'Ai Writer',
  description: 'AI 기반 글쓰기 도구',
  generator: 'DooSeong',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Only run on client
    if (typeof window !== "undefined") {
      import('js-cookie').then(mod => {
        const Cookies = mod.default;
        let clientId = Cookies.get('clientId');
        if (!clientId) {
          clientId = crypto.randomUUID();
          Cookies.set('clientId', clientId, { path: '/', sameSite: 'lax', expires: 365 });
        }
      });
    }
  }, []);
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
