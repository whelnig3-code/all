'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6">
      <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center max-w-md">
        <h2 className="text-lg font-bold text-red-800 mb-2">오류가 발생했습니다</h2>
        <p className="text-sm text-red-600 mb-4">
          {error.message || '알 수 없는 오류가 발생했습니다.'}
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors"
        >
          다시 시도
        </button>
      </div>
    </div>
  )
}
