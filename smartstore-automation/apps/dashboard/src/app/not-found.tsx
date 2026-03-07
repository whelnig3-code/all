import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6">
      <div className="text-center max-w-md">
        <h2 className="text-6xl font-bold text-gray-200 mb-4">404</h2>
        <h3 className="text-lg font-bold text-gray-900 mb-2">페이지를 찾을 수 없습니다</h3>
        <p className="text-sm text-gray-500 mb-6">
          요청하신 페이지가 존재하지 않거나 이동되었습니다.
        </p>
        <Link
          href="/"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
        >
          대시보드로 돌아가기
        </Link>
      </div>
    </div>
  )
}
