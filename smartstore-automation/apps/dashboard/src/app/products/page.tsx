'use client'

// =============================================
// 상품 목록 페이지
//
// 기능:
//   - 상태별 필터 (전체/pending/registered/failed)
//   - 페이지네이션
//   - 상품 상세 모달
// =============================================

import { useState, useEffect, useCallback } from 'react'

// =============================================
// 타입 정의
// =============================================

interface Product {
  id: string
  name: string
  source: string
  status: string
  salePrice: number | null
  wholesalePrice: number | null
  naverProductId: string | null
  stockQuantity: number | null
  registeredAt: string | null
  createdAt: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface ProductsResponse {
  data: Product[]
  pagination: Pagination
}

type StatusFilter = '' | 'pending' | 'registered' | 'failed' | 'suspended'

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: '', label: '전체' },
  { value: 'pending', label: '대기' },
  { value: 'registered', label: '등록됨' },
  { value: 'failed', label: '실패' },
  { value: 'suspended', label: '일시정지' },
]

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  registered: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  suspended: 'bg-gray-100 text-gray-600',
}

// =============================================
// 메인 페이지 컴포넌트
// =============================================

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, limit: 20, total: 0, totalPages: 0,
  })
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

  const apiBase = process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:3100'

  const fetchProducts = useCallback(async (page: number, status: StatusFilter) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
      })
      if (status) params.set('status', status)

      const res = await fetch(`${apiBase}/products?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data: ProductsResponse = await res.json()
      setProducts(data.data)
      setPagination(data.pagination)
    } catch (err) {
      setError(err instanceof Error ? err.message : '데이터 로딩 실패')
    } finally {
      setLoading(false)
    }
  }, [apiBase])

  useEffect(() => {
    fetchProducts(pagination.page, statusFilter)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePageChange = (newPage: number) => {
    setPagination(prev => ({ ...prev, page: newPage }))
    fetchProducts(newPage, statusFilter)
  }

  const handleStatusChange = (status: StatusFilter) => {
    setStatusFilter(status)
    fetchProducts(1, status)
  }

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">상품 관리</h1>
        <span className="text-sm text-gray-500">
          총 {pagination.total.toLocaleString()}개
        </span>
      </div>

      {/* 필터 */}
      <div className="flex gap-2">
        {STATUS_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => handleStatusChange(opt.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === opt.value
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 에러 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* 로딩 */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <span className="ml-3 text-gray-500">상품 목록 로딩 중...</span>
        </div>
      ) : (
        <>
          {/* 테이블 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">상품명</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">소스</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">상태</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">도매가</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">판매가</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">재고</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">등록일</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                      상품이 없습니다
                    </td>
                  </tr>
                ) : (
                  products.map(product => (
                    <tr
                      key={product.id}
                      onClick={() => setSelectedProduct(product)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900 line-clamp-1">
                          {product.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {product.source}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                          STATUS_COLORS[product.status] ?? 'bg-gray-100 text-gray-600'
                        }`}>
                          {product.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-600">
                        {product.wholesalePrice?.toLocaleString() ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                        {product.salePrice?.toLocaleString() ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-600">
                        {product.stockQuantity ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {product.registeredAt
                          ? new Date(product.registeredAt).toLocaleDateString('ko-KR')
                          : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="px-3 py-1 rounded border text-sm disabled:opacity-30 hover:bg-gray-50"
              >
                이전
              </button>
              <span className="text-sm text-gray-600">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="px-3 py-1 rounded border text-sm disabled:opacity-30 hover:bg-gray-50"
              >
                다음
              </button>
            </div>
          )}
        </>
      )}

      {/* 상품 상세 모달 */}
      {selectedProduct && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setSelectedProduct(null)}
        >
          <div
            className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">상품 상세</h2>
              <button
                onClick={() => setSelectedProduct(null)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              <DetailRow label="상품명" value={selectedProduct.name} />
              <DetailRow label="소스" value={selectedProduct.source} />
              <DetailRow label="상태" value={selectedProduct.status} />
              <DetailRow label="도매가" value={`${selectedProduct.wholesalePrice?.toLocaleString() ?? '-'}원`} />
              <DetailRow label="판매가" value={`${selectedProduct.salePrice?.toLocaleString() ?? '-'}원`} />
              <DetailRow label="재고" value={`${selectedProduct.stockQuantity ?? '-'}개`} />
              <DetailRow label="네이버 상품ID" value={selectedProduct.naverProductId ?? '-'} />
              <DetailRow
                label="등록일"
                value={selectedProduct.registeredAt
                  ? new Date(selectedProduct.registeredAt).toLocaleString('ko-KR')
                  : '-'}
              />
              <DetailRow
                label="생성일"
                value={new Date(selectedProduct.createdAt).toLocaleString('ko-KR')}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex">
      <span className="w-28 text-sm text-gray-500 flex-shrink-0">{label}</span>
      <span className="text-sm text-gray-900">{value}</span>
    </div>
  )
}
