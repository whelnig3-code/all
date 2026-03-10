'use client'

// =============================================
// 메인 대시보드 — 셀러센터 스타일
//
// 섹션:
//   1. 오늘의 현황 카드 (매출 / 주문 / 순익)
//   2. 자동화 제어 (ON/OFF 토글)
//   3. 시스템 상태 (간략)
//   4. 최근 알림 (플레이스홀더)
//
// 자동 갱신: 30초마다
// =============================================

import { useState, useEffect, useCallback } from 'react'
import {
  fetchSystemStatus,
  fetchMetrics,
  fetchAlerts,
  updateControl,
  fetchCredentialStatuses,
  type SystemStatus,
  type DailyMetrics,
  type ControlKey,
  type ServiceStatusInfo,
  type AlertItem,
} from '../lib/api'
import { StatCard, StatusDot } from '../components'

// =============================================
// Kill Switch 상태 타입
// =============================================

interface KillSwitchState {
  AUTO_PRICE_ENABLED: boolean
  AUTO_ORDER_ENABLED: boolean
  AUTO_SHIPPING_ENABLED: boolean
}

// =============================================
// 포맷 헬퍼
// =============================================

function won(n: number): string {
  return `₩${n.toLocaleString('ko-KR')}`
}

// =============================================
// 자동화 토글 행
// =============================================

function AutomationToggle({
  label,
  description,
  controlKey,
  enabled,
  loading,
  onToggle,
}: {
  label: string
  description: string
  controlKey: ControlKey
  enabled: boolean
  loading: boolean
  onToggle: (key: ControlKey, next: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="text-xs text-gray-400">{description}</p>
      </div>
      <button
        onClick={() => onToggle(controlKey, !enabled)}
        disabled={loading}
        className={`
          relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full
          border-2 border-transparent transition-colors duration-200 ease-in-out
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
          disabled:opacity-50 disabled:cursor-not-allowed
          ${enabled ? 'bg-blue-600' : 'bg-gray-300'}
        `}
        aria-pressed={enabled}
        aria-label={`${label} ${enabled ? '끄기' : '켜기'}`}
      >
        <span
          className={`
            pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow
            ring-0 transition duration-200 ease-in-out
            ${enabled ? 'translate-x-5' : 'translate-x-0'}
          `}
        />
      </button>
    </div>
  )
}

// =============================================
// 메인 페이지
// =============================================

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DailyMetrics | null>(null)
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [killSwitch, setKillSwitch] = useState<KillSwitchState>({
    AUTO_PRICE_ENABLED: true,
    AUTO_ORDER_ENABLED: true,
    AUTO_SHIPPING_ENABLED: true,
  })
  const [toggleLoading, setToggleLoading] = useState<Record<ControlKey, boolean>>({
    AUTO_PRICE_ENABLED: false,
    AUTO_ORDER_ENABLED: false,
    AUTO_SHIPPING_ENABLED: false,
    SELLER_TYPE: false,
  })
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [credentialStatuses, setCredentialStatuses] = useState<ServiceStatusInfo[]>([])

  const fetchAll = useCallback(async () => {
    try {
      const [m, s] = await Promise.all([fetchMetrics(), fetchSystemStatus()])

      try {
        const creds = await fetchCredentialStatuses()
        setCredentialStatuses(creds.services)
      } catch {
        // 자격증명 API 실패 — 무시
      }

      try {
        const alertsData = await fetchAlerts()
        setAlerts(alertsData.alerts)
      } catch {
        // 알림 API 실패 — 무시 (빈 상태 유지)
      }

      setMetrics(m)
      setStatus(s)
      setKillSwitch({
        AUTO_PRICE_ENABLED: s.settings.AUTO_PRICE_ENABLED !== 'false',
        AUTO_ORDER_ENABLED: s.settings.AUTO_ORDER_ENABLED !== 'false',
        AUTO_SHIPPING_ENABLED: s.settings.AUTO_SHIPPING_ENABLED !== 'false',
      })
      setError(null)
      setLastRefreshed(new Date())
    } catch (err) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류'
      setError(`데이터 로드 실패: ${msg}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchAll()
    const timer = setInterval(() => void fetchAll(), 30_000)
    return () => clearInterval(timer)
  }, [fetchAll])

  const handleToggle = async (key: ControlKey, next: boolean) => {
    if (!next) {
      const label =
        key === 'AUTO_PRICE_ENABLED'
          ? '가격 자동 조정'
          : key === 'AUTO_ORDER_ENABLED'
            ? '주문 자동 처리'
            : '배송 자동 알림'
      const confirmed = window.confirm(
        `${label}을 일시정지하시겠습니까?\n워커가 해당 기능을 즉시 중단합니다.`
      )
      if (!confirmed) return
    }

    setToggleLoading((prev) => ({ ...prev, [key]: true }))
    try {
      await updateControl(key, next ? 'true' : 'false')
      setKillSwitch((prev) => ({ ...prev, [key]: next }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류'
      window.alert(`제어 실패: ${msg}`)
    } finally {
      setToggleLoading((prev) => ({ ...prev, [key]: false }))
    }
  }

  // =============================================
  // 렌더링
  // =============================================

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-sm">데이터를 불러오는 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">오늘의 현황</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {metrics?.date ?? '—'} · 30초마다 자동 갱신
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <span className="text-xs text-gray-400">
              {lastRefreshed.toLocaleTimeString('ko-KR')}
            </span>
          )}
          <button
            onClick={() => void fetchAll()}
            className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
          >
            새로고침
          </button>
        </div>
      </div>

      {/* 에러 배너 */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* 자격증명 게이트 배너 */}
      {credentialStatuses.length > 0 && (() => {
        const requiredServices = ['naver_commerce', 'domaegguk', 'ownerclan']
        const missing = credentialStatuses
          .filter((s) => requiredServices.includes(s.service) && s.status !== 'configured')
          .map((s) => s.service)
        if (missing.length === 0) return null
        return (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-amber-800 text-sm flex items-center justify-between">
            <span>
              필수 서비스 미설정: <strong>{missing.join(', ')}</strong> — 자동화가 차단됩니다.
            </span>
            <a
              href="/settings"
              className="ml-4 px-3 py-1 bg-amber-100 hover:bg-amber-200 rounded text-amber-700 text-sm font-medium whitespace-nowrap transition-colors"
            >
              설정하기
            </a>
          </div>
        )
      })()}

      {/* 현황 카드 */}
      {metrics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="오늘 매출"
            value={won(metrics.totalRevenue)}
            color="blue"
          />
          <StatCard
            label="주문"
            value={`${metrics.orderCount}건`}
            color="blue"
          />
          <StatCard
            label="순익"
            value={won(metrics.totalMargin)}
            sub={
              metrics.totalRevenue > 0
                ? `마진율 ${Math.round((metrics.totalMargin / metrics.totalRevenue) * 100)}%`
                : undefined
            }
            color="green"
          />
          <StatCard
            label="실패/Fallback"
            value={`${metrics.failedJobCount}건 / ${metrics.fallbackCount}회`}
            color={metrics.failedJobCount > 0 ? 'red' : 'amber'}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 자동화 제어 */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-base font-bold text-gray-800 mb-4">자동화 제어</h2>
            <div>
              <AutomationToggle
                label="가격 자동 조정"
                description="경쟁가 모니터링 + 자동 가격 변경"
                controlKey="AUTO_PRICE_ENABLED"
                enabled={killSwitch.AUTO_PRICE_ENABLED}
                loading={toggleLoading.AUTO_PRICE_ENABLED}
                onToggle={(key, next) => void handleToggle(key, next)}
              />
              <AutomationToggle
                label="주문 자동 처리"
                description="새 주문 수집 + 도매처 자동 발주"
                controlKey="AUTO_ORDER_ENABLED"
                enabled={killSwitch.AUTO_ORDER_ENABLED}
                loading={toggleLoading.AUTO_ORDER_ENABLED}
                onToggle={(key, next) => void handleToggle(key, next)}
              />
              <AutomationToggle
                label="배송 자동 알림"
                description="배송 상태 업데이트 + 고객 알림"
                controlKey="AUTO_SHIPPING_ENABLED"
                enabled={killSwitch.AUTO_SHIPPING_ENABLED}
                loading={toggleLoading.AUTO_SHIPPING_ENABLED}
                onToggle={(key, next) => void handleToggle(key, next)}
              />
            </div>
            <p className="text-[11px] text-gray-400 mt-3">
              변경사항은 즉시 반영됩니다.
            </p>
          </div>
        </div>

        {/* 시스템 상태 + 최근 알림 */}
        <div className="lg:col-span-2 space-y-6">
          {/* 시스템 상태 */}
          {status && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <h2 className="text-base font-bold text-gray-800 mb-4">시스템 상태</h2>
              <div className="flex flex-wrap gap-6">
                <StatusDot ok={status.workerAlive} label="워커" />
                <StatusDot ok={status.dbConnected} label="데이터베이스" />
                <StatusDot ok={status.redisConnected} label="Redis" />
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-300" />
                  <span className="text-sm text-gray-500">
                    메모리 {status.memory.heapUsedMB}MB / {status.memory.heapTotalMB}MB
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 최근 알림 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-base font-bold text-gray-800 mb-4">최근 알림</h2>
            {alerts.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <svg className="w-10 h-10 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <p className="text-sm">알림 내역이 없습니다</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {alerts.map((alert) => (
                  <li key={alert.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    {/* 상태별 아이콘 */}
                    <span className="mt-0.5 flex-shrink-0">
                      {alert.status === 'failed' ? (
                        <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </span>
                    {/* 알림 내용 */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium mr-1.5 ${
                          alert.status === 'failed'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {alert.jobType}
                        </span>
                        {alert.message}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(alert.createdAt).toLocaleString('ko-KR')}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* 푸터 */}
      <footer className="text-center text-xs text-gray-400 py-4">
        스마트스토어 자동화 · 2026
      </footer>
    </div>
  )
}
