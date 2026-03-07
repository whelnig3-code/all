import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "재배 리포트 생성기",
  description: "숙주 재배 모니터링 리포트 생성기",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="bg-gray-100 min-h-screen">
        {/* 최상단 보안 바 */}
        <div className="bg-red-700 text-white text-xs text-center py-1.5 font-medium tracking-wide">
          ⚠️ 본 프로그램 및 생성 데이터는 농업회사법인 재우의 자산입니다 — 무단 반출 · 도용 · 배포 금지
        </div>

        <header className="bg-white shadow-sm">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
            <span className="text-2xl">🌱</span>
            <div>
              <h1 className="text-base font-bold text-gray-800">재배 리포트 생성기</h1>
              <p className="text-xs text-gray-400">센서 데이터 → 자동 분석 → Excel 리포트</p>
            </div>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>

        {/* 보안 문구 푸터 */}
        <footer className="border-t border-gray-200 bg-white mt-8">
          <div className="max-w-4xl mx-auto px-4 py-3 text-center">
            <p className="text-xs text-gray-400">
              ⚠️ 본 프로그램 및 데이터는{" "}
              <span className="font-semibold text-gray-500">농업회사법인 재우</span>의 자산입니다.
              &nbsp;무단 반출 · 도용 · 배포를 금지합니다.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
