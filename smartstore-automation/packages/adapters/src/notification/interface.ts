// =============================================
// 알림 어댑터 인터페이스 (무료/유료 교체 가능)
// =============================================

import type { Notification } from '@smartstore/shared'

/** 모든 알림 어댑터가 구현해야 하는 인터페이스 */
export interface NotificationAdapter {
  /** 알림 전송 */
  send(notification: Notification): Promise<boolean>
  /** 연결 테스트 */
  healthCheck(): Promise<boolean>
}
