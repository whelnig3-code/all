import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/common/ToastProvider";
import { ThemeProvider } from "@/context/ThemeContext";

export const metadata: Metadata = {
  title: "JM Agent Team",
  description: "AI 에이전트 팀 대시보드",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* highlight.js — 코드 신택스 하이라이팅 (CDN) */}
        <link
          id="hljs-theme"
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css"
        />
        <script
          src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"
          async
        />
      </head>
      <body>
        <ThemeProvider>
          {children}
          {/* 전역 에러 토스트 — showErrorToast() 호출 시 우상단에 표시 */}
          <ToastProvider />
        </ThemeProvider>
      </body>
    </html>
  );
}
