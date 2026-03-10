'use client'

// =============================================
// 현황 카드 컴포넌트
//
// 라벨, 값, 부가 텍스트를 표시하는 카드.
// 색상별로 border/배경이 달라진다.
// =============================================

interface StatCardProps {
  label: string
  value: string
  sub?: string
  color?: 'blue' | 'green' | 'red' | 'amber'
}

const COLOR_MAP = {
  blue: 'border-blue-500 bg-blue-50',
  green: 'border-green-500 bg-green-50',
  red: 'border-red-500 bg-red-50',
  amber: 'border-amber-500 bg-amber-50',
} as const

const TEXT_MAP = {
  blue: 'text-blue-700',
  green: 'text-green-700',
  red: 'text-red-700',
  amber: 'text-amber-700',
} as const

export function StatCard({ label, value, sub, color = 'blue' }: StatCardProps) {
  return (
    <div className={`bg-white rounded-xl border-l-4 ${COLOR_MAP[color]} shadow-sm p-5`}>
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${TEXT_MAP[color]}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}
