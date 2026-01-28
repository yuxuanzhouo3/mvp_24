import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'WebView 套壳登录 Demo',
  description: '微信小程序 WebView 登录示例',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <head>
        <script src="https://res.wx.qq.com/open/js/jweixin-1.6.0.js" async />
      </head>
      <body>{children}</body>
    </html>
  )
}
