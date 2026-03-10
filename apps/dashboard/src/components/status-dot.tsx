'use client'

// =============================================
// 상태 점 컴포넌트
//
// 시스템 서비스의 정상/비정상 상태를 표시.
// 정상이면 초록 점, 비정상이면 빨간 점(깜빡임).
// =============================================

interface StatusDotProps {
  ok: boolean
  label: string
}

export function StatusDot({ ok, label }: StatusDotProps) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-2.5 h-2.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
      <span className={`text-sm ${ok ? 'text-gray-600' : 'text-red-600 font-medium'}`}>{label}</span>
    </div>
  )
}
