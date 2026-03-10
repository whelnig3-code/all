// =============================================
// SMS 알림 어댑터 (SOLAPI 기반)
//
// 환경변수:
//   SMS_API_KEY    — SOLAPI API Key
//   SMS_FROM_NUMBER — 발신 번호 (사전 등록 필수)
// =============================================

import axios from 'axios'
import crypto from 'crypto'
import { config, createLogger } from '@smartstore/shared'
import type { Notification } from '@smartstore/shared'
import type { NotificationAdapter } from './interface'

const logger = createLogger('sms-adapter')

const SOLAPI_URL = 'https://api.solapi.com/messages/v4/send'

/** SOLAPI 인증 헤더 생성 (HMAC-SHA256) */
function buildAuthHeader(apiKey: string, apiSecret: string): string {
  const date = new Date().toISOString()
  const salt = crypto.randomBytes(32).toString('hex')
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(`${date}${salt}`)
    .digest('hex')
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`
}

/** 알림 타입 → 짧은 SMS 텍스트 변환 (80byte 이내) */
function formatSmsText(notification: Notification): string {
  const prefix: Record<string, string> = {
    order_received: '[주문]',
    order_shipped: '[배송]',
    price_adjusted: '[가격]',
    stock_low: '[재고]',
    inventory_out: '[품절]',
    system_error: '[오류]',
    order_approval_request: '[승인요청]',
  }

  const tag = prefix[notification.type] ?? '[알림]'
  const text = `${tag} ${notification.title}`

  // SMS 80byte 제한 (한글 2byte 기준 약 40자)
  return text.length > 40 ? text.substring(0, 39) + '…' : text
}

export class SmsNotificationAdapter implements NotificationAdapter {
  private readonly apiKey: string
  private readonly fromNumber: string

  constructor(
    apiKey: string = config.notification.sms.apiKey,
    fromNumber: string = config.notification.sms.fromNumber,
  ) {
    this.apiKey = apiKey
    this.fromNumber = fromNumber
  }

  async send(notification: Notification): Promise<boolean> {
    if (!this.apiKey || !this.fromNumber) {
      logger.warn('SMS 설정 누락 (SMS_API_KEY, SMS_FROM_NUMBER)')
      return false
    }

    // SMS 수신 번호는 notification.data.phone에서 가져오거나 chatId 폴백
    const toNumber = (notification.data as Record<string, string> | undefined)?.phone
      ?? config.notification.telegram.chatId

    if (!toNumber) {
      logger.warn('SMS 수신 번호 없음', { type: notification.type })
      return false
    }

    try {
      const text = formatSmsText(notification)
      const [apiKeyId, apiSecret] = this.apiKey.split(':')

      if (!apiKeyId || !apiSecret) {
        logger.error('SMS_API_KEY 형식 오류 (apiKeyId:apiSecret 형식 필요)')
        return false
      }

      await axios.post(
        SOLAPI_URL,
        {
          message: {
            to: toNumber,
            from: this.fromNumber,
            text,
          },
        },
        {
          headers: {
            Authorization: buildAuthHeader(apiKeyId, apiSecret),
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      )

      logger.info('SMS 전송 완료', { to: toNumber, type: notification.type })
      return true
    } catch (error) {
      logger.error('SMS 전송 실패', { error: error instanceof Error ? error.message : String(error) })
      return false
    }
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) return false
    try {
      // SOLAPI balance check API
      const [apiKeyId, apiSecret] = this.apiKey.split(':')
      if (!apiKeyId || !apiSecret) return false

      const res = await axios.get('https://api.solapi.com/cash/v1/balance', {
        headers: { Authorization: buildAuthHeader(apiKeyId, apiSecret) },
        timeout: 5000,
      })
      return res.status === 200
    } catch {
      return false
    }
  }
}
