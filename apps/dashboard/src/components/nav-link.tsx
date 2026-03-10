'use client'

// =============================================
// 네비게이션 링크 컴포넌트
//
// 현재 경로와 href를 비교하여 활성 상태를 표시.
// usePathname()으로 클라이언트 사이드 경로 감지.
// =============================================

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { type ReactNode } from 'react'

interface NavLinkProps {
  href: string
  children: ReactNode
  className?: string
  activeClassName?: string
  inactiveClassName?: string
}

export function NavLink({
  href,
  children,
  inactiveClassName = 'text-gray-600',
  activeClassName = 'text-blue-600 bg-blue-50',
}: NavLinkProps) {
  const pathname = usePathname()
  const isActive = pathname === href || (href !== '/' && pathname.startsWith(href))

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
        isActive ? activeClassName : `${inactiveClassName} hover:text-blue-600 hover:bg-blue-50`
      }`}
    >
      {children}
    </Link>
  )
}
