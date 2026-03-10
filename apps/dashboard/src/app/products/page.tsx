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
// 블로그 타입
// =============================================

interface BlogSection {
  heading: string
  content: string
}

interface BlogData {
  productId: string
  title: string
  body: string
  tags: string[]
  sections: BlogSection[]
  plainText: string
  generatedAt: string
  source: string
}

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
  const [blogData, setBlogData] = useState<BlogData | null>(null)
  const [blogLoading, setBlogLoading] = useState(false)

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

            {/* 블로그 글 보기 버튼 */}
            <button
              onClick={async () => {
                setBlogLoading(true)
                try {
                  const res = await fetch(`${apiBase}/products/${selectedProduct.id}/blog`)
                  if (res.ok) {
                    const data: BlogData = await res.json()
                    setBlogData(data)
                    setSelectedProduct(null)
                  }
                } catch { /* ignore */ }
                setBlogLoading(false)
              }}
              disabled={blogLoading}
              className="mt-4 w-full py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {blogLoading ? '블로그 글 생성 중...' : '블로그 글 보기 / 복사'}
            </button>
          </div>
        </div>
      )}

      {/* 블로그 복사 모달 */}
      {blogData && (
        <BlogCopyModal
          data={blogData}
          onClose={() => setBlogData(null)}
        />
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

// =============================================
// 블로그 복사 모달
// =============================================

function BlogCopyModal({ data, onClose }: { data: BlogData; onClose: () => void }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 1500)
    } catch {
      // fallback
      const textarea = document.createElement('textarea')
      textarea.value = text
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 1500)
    }
  }

  const CopyButton = ({ text, label, copyKey }: { text: string; label: string; copyKey: string }) => (
    <button
      onClick={() => copyToClipboard(text, copyKey)}
      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
        copiedKey === copyKey
          ? 'bg-green-100 text-green-700'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {copiedKey === copyKey ? '복사됨!' : label}
    </button>
  )

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 shadow-xl max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">블로그 글 복사</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">
              {data.source === 'cached' ? '캐시됨' : '새로 생성'}
            </span>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl"
            >
              ×
            </button>
          </div>
        </div>

        {/* 제목 */}
        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-blue-600 uppercase">제목</span>
            <CopyButton text={data.title} label="복사" copyKey="title" />
          </div>
          <p className="text-sm font-medium text-gray-900">{data.title}</p>
        </div>

        {/* 꼭지 (섹션별) */}
        <div className="space-y-3 mb-4">
          {data.sections.map((section, idx) => (
            <div key={idx} className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-gray-500">
                  꼭지 {idx + 1}
                </span>
                <CopyButton
                  text={`${section.heading}\n\n${section.content.replace(/<[^>]*>/g, '').replace(/\n\s*\n/g, '\n').trim()}`}
                  label="복사"
                  copyKey={`section-${idx}`}
                />
              </div>
              <p className="text-sm font-bold text-gray-800 mb-1">{section.heading}</p>
              <div
                className="text-sm text-gray-600 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: section.content }}
              />
            </div>
          ))}
        </div>

        {/* 태그 */}
        <div className="mb-4 p-3 bg-amber-50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-amber-600 uppercase">태그</span>
            <CopyButton
              text={data.tags.map(t => `#${t}`).join(' ')}
              label="복사"
              copyKey="tags"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.tags.map((tag, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs"
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>

        {/* 전체 복사 */}
        <button
          onClick={() => copyToClipboard(
            `${data.title}\n\n${data.plainText}\n\n${data.tags.map(t => `#${t}`).join(' ')}`,
            'all'
          )}
          className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors ${
            copiedKey === 'all'
              ? 'bg-green-600 text-white'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {copiedKey === 'all' ? '전체 복사 완료!' : '전체 복사 (제목 + 본문 + 태그)'}
        </button>
      </div>
    </div>
  )
}
