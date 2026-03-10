import type { Metadata } from 'next'
import './globals.css'
import { Sidebar, NotificationBell } from '../components'

export const metadata: Metadata = {
  title: '스마트스토어 자동화',
  description: '스마트스토어 위탁판매 자동화 관리',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body className="bg-gray-50 text-gray-900">
        <div className="flex h-screen">
          {/* 사이드바 */}
          <Sidebar />

          {/* 메인 영역 */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* 상단 헤더 */}
            <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
              <div />
              <div className="flex items-center gap-4">
                {/* 알림 벨 */}
                <NotificationBell />
                {/* 사용자 */}
                <div className="flex items-center gap-2 pl-4 border-l border-gray-200">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-sm font-bold text-blue-600">JM</span>
                  </div>
                  <span className="text-sm font-medium text-gray-700">정민</span>
                </div>
              </div>
            </header>

            {/* 콘텐츠 영역 */}
            <main className="flex-1 overflow-y-auto bg-gray-50">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  )
}
