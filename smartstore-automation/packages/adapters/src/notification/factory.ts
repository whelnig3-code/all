// =============================================
// 알림 어댑터 팩토리 (.env로 어댑터 교체)
// =============================================

import { config, createLogger } from '@smartstore/shared'
import type { NotificationAdapter } from './interface'
import { TelegramNotificationAdapter } from './telegram'

const logger = createLogger('notification-factory')

/**
 * 환경변수 NOTIFICATION_ADAPTER에 따라 어댑터 선택
 * - telegram (기본): 무료
 * - sms: 유료 (SOLAPI 등)
 */
export function createNotificationAdapter(): NotificationAdapter {
  const adapterType = config.notification.adapter

  switch (adapterType) {
    case 'telegram':
      logger.info('알림 어댑터: Telegram (무료)')
      return new TelegramNotificationAdapter()

    case 'sms':
      // TODO: Phase 2+ SMS 어댑터 구현
      // 현재는 텔레그램으로 폴백
      logger.warn('SMS 어댑터 미구현, Telegram으로 폴백')
      return new TelegramNotificationAdapter()

    default:
      logger.warn(`알 수 없는 어댑터 타입: ${adapterType}, Telegram 기본값 사용`)
      return new TelegramNotificationAdapter()
  }
}

// 싱글톤 알림 어댑터
export const notificationAdapter = createNotificationAdapter()
