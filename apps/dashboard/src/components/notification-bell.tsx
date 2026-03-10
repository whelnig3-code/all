'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiCall } from '../lib/api'

interface Alert {
  id: string
  type: string
  severity: 'error' | 'warning'
  message: string
  timestamp: string
}

interface AlertsResponse {
  alerts: Alert[]
  total: number
}

export function NotificationBell() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [open, setOpen] = useState(false)
  const [lastChecked, setLastChecked] = useState<string | null>(null)

  const fetchAlerts = useCallback(async () => {
    try {
      const data = await apiCall<AlertsResponse>('/monitoring/alerts')
      setAlerts(data.alerts)
    } catch {
      // fail silently
    }
  }, [])

  useEffect(() => {
    fetchAlerts()
    const interval = setInterval(fetchAlerts, 60_000) // 1분마다 폴링
    return () => clearInterval(interval)
  }, [fetchAlerts])

  const unreadCount = lastChecked
    ? alerts.filter(a => a.timestamp > lastChecked).length
    : alerts.length

  const handleOpen = () => {
    setOpen(prev => !prev)
    if (!open) {
      setLastChecked(new Date().toISOString())
    }
  }

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        className="relative p-2 text-gray-400 hover:text-gray-600 transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 overflow-y-auto">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">알림</h3>
            <span className="text-xs text-gray-400">{alerts.length}건</span>
          </div>
          {alerts.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">
              알림이 없습니다
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {alerts.slice(0, 15).map(alert => (
                <div key={alert.id} className="px-4 py-3 hover:bg-gray-50">
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                      alert.severity === 'error' ? 'bg-red-500' : 'bg-yellow-500'
                    }`} />
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800">{alert.message}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(alert.timestamp).toLocaleString('ko-KR')}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
