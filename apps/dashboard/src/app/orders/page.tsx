'use client'

// =============================================
// 주문 목록 페이지
//
// 기능:
//   - 상태별 필터
//   - 날짜 범위 선택
//   - 배송 처리 버튼
//   - 주문 통계 요약
// =============================================

import { useState, useEffect, useCallback } from 'react'
import { apiCall } from '@/lib/api'

// =============================================
// 타입 정의
// =============================================

interface Order {
  id: string
  naverOrderId: string
  status: string
  customerName: string
  customerAddress: string
  quantity: number
  salePrice: number
  totalAmount: number
  trackingNumber: string | null
  courier: string | null
  orderedAt: string
  paidAt: string | null
  shippedAt: string | null
  product?: {
    name: string
  }
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface OrdersResponse {
  data: Order[]
  pagination: Pagination
}

type StatusFilter = '' | 'paid' | 'shipped' | 'delivered' | 'cancelled' | 'return_requested'

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: '', label: '전체' },
  { value: 'paid', label: '결제완료' },
  { value: 'shipped', label: '배송중' },
  { value: 'delivered', label: '배송완료' },
  { value: 'cancelled', label: '취소' },
  { value: 'return_requested', label: '반품요청' },
]

const STATUS_COLORS: Record<string, string> = {
  payment_waiting: 'bg-gray-100 text-gray-600',
  paid: 'bg-blue-100 text-blue-800',
  shipped: 'bg-indigo-100 text-indigo-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  return_requested: 'bg-amber-100 text-amber-800',
  returned: 'bg-gray-100 text-gray-600',
}

const STATUS_LABELS: Record<string, string> = {
  payment_waiting: '결제대기',
  paid: '결제완료',
  shipped: '배송중',
  delivered: '배송완료',
  cancelled: '취소',
  return_requested: '반품요청',
  returned: '반품완료',
}

// =============================================
// 메인 페이지 컴포넌트
// =============================================

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, limit: 20, total: 0, totalPages: 0,
  })
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [shippingModal, setShippingModal] = useState<Order | null>(null)
  const [trackingInput, setTrackingInput] = useState('')
  const [courierInput, setCourierInput] = useState('CJ대한통운')
  const [shippingLoading, setShippingLoading] = useState(false)

  const fetchOrders = useCallback(async (page: number, status: StatusFilter) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
      })
      if (status) params.set('status', status)

      const data = await apiCall<OrdersResponse>(`/orders?${params}`)
      setOrders(data.data)
      setPagination(data.pagination)
    } catch (err) {
      setError(err instanceof Error ? err.message : '데이터 로딩 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrders(pagination.page, statusFilter)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePageChange = (newPage: number) => {
    setPagination(prev => ({ ...prev, page: newPage }))
    fetchOrders(newPage, statusFilter)
  }

  const handleStatusChange = (status: StatusFilter) => {
    setStatusFilter(status)
    fetchOrders(1, status)
  }

  const handleShipOrder = async () => {
    if (!shippingModal || !trackingInput.trim()) return

    setShippingLoading(true)
    try {
      await apiCall(`/orders/${shippingModal.id}/ship`, 'POST', {
        trackingNumber: trackingInput.trim(),
        courier: courierInput,
      })

      setShippingModal(null)
      setTrackingInput('')
      fetchOrders(pagination.page, statusFilter)
    } catch (err) {
      setError(err instanceof Error ? err.message : '배송 처리 실패')
    } finally {
      setShippingLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">주문 관리</h1>
        <span className="text-sm text-gray-500">
          총 {pagination.total.toLocaleString()}건
        </span>
      </div>

      {/* 필터 */}
      <div className="flex gap-2 flex-wrap">
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
          <span className="ml-3 text-gray-500">주문 목록 로딩 중...</span>
        </div>
      ) : (
        <>
          {/* 테이블 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">주문번호</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">상품</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">고객</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">상태</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">금액</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">주문일</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                      주문이 없습니다
                    </td>
                  </tr>
                ) : (
                  orders.map(order => (
                    <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="text-sm font-mono text-gray-700">
                          {order.naverOrderId.slice(-8)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-900 line-clamp-1">
                          {order.product?.name ?? '-'}
                        </span>
                        <span className="text-xs text-gray-400 block">
                          {order.quantity}개
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {order.customerName || '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                          STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600'
                        }`}>
                          {STATUS_LABELS[order.status] ?? order.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                        {order.totalAmount.toLocaleString()}원
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(order.orderedAt).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {order.status === 'paid' && (
                          <button
                            onClick={() => setShippingModal(order)}
                            className="px-3 py-1 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            배송처리
                          </button>
                        )}
                        {order.trackingNumber && (
                          <span className="text-xs text-gray-400 block mt-1">
                            {order.courier} {order.trackingNumber}
                          </span>
                        )}
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

      {/* 배송 처리 모달 */}
      {shippingModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setShippingModal(null)}
        >
          <div
            className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-gray-900 mb-4">배송 처리</h2>
            <p className="text-sm text-gray-500 mb-4">
              주문번호: {shippingModal.naverOrderId.slice(-8)}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  택배사
                </label>
                <select
                  value={courierInput}
                  onChange={e => setCourierInput(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="CJ대한통운">CJ대한통운</option>
                  <option value="롯데택배">롯데택배</option>
                  <option value="한진택배">한진택배</option>
                  <option value="우체국택배">우체국택배</option>
                  <option value="로젠택배">로젠택배</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  운송장 번호
                </label>
                <input
                  type="text"
                  value={trackingInput}
                  onChange={e => setTrackingInput(e.target.value)}
                  placeholder="운송장 번호 입력"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShippingModal(null)}
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  onClick={handleShipOrder}
                  disabled={!trackingInput.trim() || shippingLoading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {shippingLoading ? '처리 중...' : '발송 처리'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
