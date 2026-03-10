'use client'

// =============================================
// 매출 리포트 페이지
//
// 섹션:
//   1. 요약 카드 (총매출 / 총순익 / 총주문수 / 평균마진율)
//   2. 계정별 매출 테이블
//   3. 상위 10개 상품
//   4. Competitor fallback 비율
//
// 기간 선택: 7일 / 30일 / 90일
// =============================================

import { useState, useEffect, useCallback } from 'react'
import {
  apiCall,
  fetchCategoryPerformance,
  fetchRejectionAnalysis,
  type CategoryPerformanceResponse,
  type RejectionAnalysisResponse,
} from '../../lib/api'

// =============================================
// 타입 정의
// =============================================

interface RevenueByAccount {
  accountId: string
  totalRevenue: number
  totalMargin: number
  orderCount: number
  avgMarginRate: number | null
}

interface TopProduct {
  productId: string
  name: string
  category: string
  totalAmount: number
  orderCount: number
  totalQuantity: number
}

interface ReportSummary {
  totalRevenue: number
  totalMargin: number
  totalOrders: number
  avgMarginRate: number | null
}

interface CompetitorFallback {
  count: number
  total: number
  ratio: number
}

interface RevenueReport {
  period: { since: string; until: string }
  revenueByAccount: RevenueByAccount[]
  topProducts: TopProduct[]
  summary: ReportSummary
  competitorFallback: CompetitorFallback
}

// =============================================
// 포맷 헬퍼
// =============================================

function won(n: number): string {
  return `₩${n.toLocaleString('ko-KR')}`
}

function pct(n: number | null): string {
  if (n === null) return '-'
  return `${n.toFixed(1)}%`
}

// =============================================
// API 호출
// =============================================

async function fetchReport(days: number): Promise<RevenueReport | null> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  try {
    return await apiCall<RevenueReport>(`/report/revenue?since=${encodeURIComponent(since)}`)
  } catch {
    return null
  }
}

// =============================================
// 컴포넌트
// =============================================

export default function ReportPage() {
  const [days, setDays] = useState(30)
  const [report, setReport] = useState<RevenueReport | null>(null)
  const [categoryPerf, setCategoryPerf] = useState<CategoryPerformanceResponse | null>(null)
  const [rejections, setRejections] = useState<RejectionAnalysisResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [revenueData, catData, rejData] = await Promise.all([
      fetchReport(days),
      fetchCategoryPerformance(days).catch(() => null),
      fetchRejectionAnalysis(days).catch(() => null),
    ])

    if (revenueData) {
      setReport(revenueData)
    } else {
      setError('리포트 데이터를 불러오지 못했습니다.')
    }
    setCategoryPerf(catData)
    setRejections(rejData)
    setLoading(false)
  }, [days])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      {/* 헤더 */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">매출 리포트</h1>
          <p className="text-sm text-gray-500 mt-1">
            {report
              ? `${new Date(report.period.since).toLocaleDateString('ko-KR')} ~ ${new Date(report.period.until).toLocaleDateString('ko-KR')}`
              : '데이터 로딩 중...'}
          </p>
        </div>
        {/* 기간 선택 */}
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                days === d
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {d}일
            </button>
          ))}
          <button
            onClick={() => void load()}
            className="px-4 py-2 rounded text-sm bg-gray-200 text-gray-700 hover:bg-gray-300"
          >
            새로고침
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-gray-400">로딩 중...</div>
      ) : report ? (
        <>
          {/* 1. 요약 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <SummaryCard label="총 매출" value={won(report.summary.totalRevenue)} color="blue" />
            <SummaryCard label="총 순익" value={won(report.summary.totalMargin)} color="green" />
            <SummaryCard label="총 주문수" value={`${report.summary.totalOrders.toLocaleString()}건`} color="purple" />
            <SummaryCard
              label="평균 마진율"
              value={pct(report.summary.avgMarginRate)}
              color={
                report.summary.avgMarginRate !== null && report.summary.avgMarginRate >= 20
                  ? 'green'
                  : 'red'
              }
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* 2. 계정별 매출 */}
            <div className="bg-white rounded-lg shadow p-5">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">계정별 매출</h2>
              {report.revenueByAccount.length === 0 ? (
                <p className="text-gray-400 text-sm">데이터 없음</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-gray-500">
                      <th className="text-left py-2">계정</th>
                      <th className="text-right py-2">매출</th>
                      <th className="text-right py-2">순익</th>
                      <th className="text-right py-2">마진율</th>
                      <th className="text-right py-2">주문수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.revenueByAccount.map((row) => (
                      <tr key={row.accountId} className="border-b hover:bg-gray-50">
                        <td className="py-2 font-medium text-gray-700">{row.accountId}</td>
                        <td className="py-2 text-right">{won(row.totalRevenue)}</td>
                        <td className="py-2 text-right text-green-600">{won(row.totalMargin)}</td>
                        <td className={`py-2 text-right font-medium ${
                          row.avgMarginRate !== null && row.avgMarginRate >= 20
                            ? 'text-green-600'
                            : 'text-red-500'
                        }`}>
                          {pct(row.avgMarginRate)}
                        </td>
                        <td className="py-2 text-right text-gray-500">{row.orderCount}건</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* 4. Competitor fallback */}
            <div className="bg-white rounded-lg shadow p-5">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Competitor Fallback 현황</h2>
              <div className="flex items-end gap-4">
                <div>
                  <p className="text-4xl font-bold text-orange-500">
                    {report.competitorFallback.ratio}%
                  </p>
                  <p className="text-sm text-gray-500 mt-1">가격 조정 중 경쟁사 기준</p>
                </div>
                <div className="text-sm text-gray-500">
                  <p>{report.competitorFallback.count}건 / 총 {report.competitorFallback.total}건</p>
                </div>
              </div>
              {report.competitorFallback.ratio > 50 && (
                <div className="mt-3 p-2 bg-orange-50 border border-orange-200 rounded text-orange-700 text-xs">
                  ⚠️ Fallback 비율이 50%를 초과했습니다. 도매 API 상태를 점검하세요.
                </div>
              )}
            </div>
          </div>

          {/* 3. 상위 10개 상품 */}
          <div className="bg-white rounded-lg shadow p-5">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">상위 10개 상품 (판매액 기준)</h2>
            {report.topProducts.length === 0 ? (
              <p className="text-gray-400 text-sm">데이터 없음</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="text-left py-2 w-8">#</th>
                    <th className="text-left py-2">상품명</th>
                    <th className="text-left py-2 hidden md:table-cell">카테고리</th>
                    <th className="text-right py-2">판매액</th>
                    <th className="text-right py-2">주문수</th>
                    <th className="text-right py-2 hidden md:table-cell">수량</th>
                  </tr>
                </thead>
                <tbody>
                  {report.topProducts.map((p, idx) => (
                    <tr key={p.productId} className="border-b hover:bg-gray-50">
                      <td className="py-2 text-gray-400 font-medium">{idx + 1}</td>
                      <td className="py-2 text-gray-800 font-medium max-w-xs truncate">
                        {p.name}
                      </td>
                      <td className="py-2 text-gray-400 hidden md:table-cell">{p.category}</td>
                      <td className="py-2 text-right font-medium text-blue-600">
                        {won(p.totalAmount)}
                      </td>
                      <td className="py-2 text-right text-gray-600">{p.orderCount}건</td>
                      <td className="py-2 text-right text-gray-400 hidden md:table-cell">
                        {p.totalQuantity}개
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {/* 5. 카테고리 성과 + 거절 분석 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            {/* 카테고리 성과 */}
            <div className="bg-white rounded-lg shadow p-5">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">카테고리별 성과</h2>
              {!categoryPerf || categoryPerf.categories.length === 0 ? (
                <p className="text-gray-400 text-sm">데이터 없음</p>
              ) : (
                <>
                  <div className="flex gap-4 mb-3 text-xs text-gray-500">
                    <span>총 {categoryPerf.summary.totalCategories}개 카테고리</span>
                    <span>1위: {categoryPerf.summary.topCategory}</span>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-gray-500">
                        <th className="text-left py-2">카테고리</th>
                        <th className="text-right py-2">상품수</th>
                        <th className="text-right py-2">매출</th>
                        <th className="text-right py-2">주문수</th>
                        <th className="text-right py-2 hidden md:table-cell">상품당 매출</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryPerf.categories.map((cat) => (
                        <tr key={cat.category} className="border-b hover:bg-gray-50">
                          <td className="py-2 font-medium text-gray-700">{cat.category}</td>
                          <td className="py-2 text-right text-gray-500">{cat.productCount}개</td>
                          <td className="py-2 text-right text-blue-600 font-medium">{won(cat.totalRevenue)}</td>
                          <td className="py-2 text-right text-gray-500">{cat.totalOrders}건</td>
                          <td className="py-2 text-right text-gray-400 hidden md:table-cell">{won(cat.revenuePerProduct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>

            {/* 거절 분석 */}
            <div className="bg-white rounded-lg shadow p-5">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">등록 거절 분석</h2>
              {!rejections || rejections.totalRejections === 0 ? (
                <p className="text-gray-400 text-sm">거절 내역 없음</p>
              ) : (
                <>
                  <div className="flex gap-4 mb-3">
                    <div className="bg-red-50 border border-red-200 rounded px-3 py-2">
                      <p className="text-xs text-red-500">총 거절</p>
                      <p className="text-lg font-bold text-red-600">{rejections.totalRejections}건</p>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded px-3 py-2">
                      <p className="text-xs text-green-500">재시도 성공률</p>
                      <p className="text-lg font-bold text-green-600">{rejections.retrySuccessRate}%</p>
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-gray-500">
                        <th className="text-left py-2">거절 사유</th>
                        <th className="text-right py-2">건수</th>
                        <th className="text-right py-2">비율</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rejections.reasons.map((r) => (
                        <tr key={r.reason} className="border-b hover:bg-gray-50">
                          <td className="py-2 text-gray-700">{r.reason}</td>
                          <td className="py-2 text-right text-gray-600">{r.count}건</td>
                          <td className="py-2 text-right">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                              r.percentage > 30
                                ? 'bg-red-100 text-red-700'
                                : r.percentage > 15
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-gray-100 text-gray-600'
                            }`}>
                              {r.percentage.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </div>
        </>
      ) : null}
    </main>
  )
}

// =============================================
// 요약 카드 컴포넌트
// =============================================

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color: 'blue' | 'green' | 'purple' | 'red'
}) {
  const colors = {
    blue: 'border-blue-400 text-blue-700',
    green: 'border-green-400 text-green-700',
    purple: 'border-purple-400 text-purple-700',
    red: 'border-red-400 text-red-600',
  }

  return (
    <div className={`bg-white rounded-lg shadow p-4 border-l-4 ${colors[color]}`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${colors[color]}`}>{value}</p>
    </div>
  )
}
