// =============================================
// 텔레그램 알림 어댑터 (무료 기본 어댑터)
// =============================================

import axios from 'axios'
import { config, createLogger } from '@smartstore/shared'
import type { Notification } from '@smartstore/shared'
import type { NotificationAdapter } from './interface'

const logger = createLogger('telegram-adapter')

/** 텔레그램 메시지 포맷터 */
function formatMessage(notification: Notification): string {
  const emoji: Record<string, string> = {
    order_received: '🛒',
    order_shipped: '📦',
    price_adjusted: '💰',
    stock_low: '⚠️',
    inventory_low: '⚠️',
    inventory_out: '🚫',
    inventory_recovered: '✅',
    order_approval_request: '🔔',
    order_approved: '✅',
    order_rejected: '❌',
    order_approval_timeout: '⏰',
    system_error: '🚨',
  }

  const icon = emoji[notification.type] ?? '📢'

  let message = `${icon} *${escapeMarkdown(notification.title)}*\n\n${escapeMarkdown(notification.message)}`

  // 추가 데이터가 있으면 코드 블록으로 표시
  if (notification.data) {
    const dataStr = JSON.stringify(notification.data, null, 2)
    message += `\n\n\`\`\`\n${dataStr}\n\`\`\``
  }

  return message
}

/** MarkdownV2 특수문자 이스케이프 */
function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&')
}

// =============================================
// Telegram 인라인 키보드 함수 (Phase 4.5 — Human Approval)
// =============================================

/** 인라인 키보드 버튼 */
interface InlineButton {
  text: string
  callback_data: string
}

/**
 * 인라인 키보드 버튼이 포함된 메시지 전송
 * @returns message_id (편집용) 또는 null
 */
export async function sendMessageWithButtons(
  chatId: string | number,
  text: string,
  buttons: InlineButton[][],
): Promise<number | null> {
  const botToken = config.notification.telegram.botToken
  if (!botToken) {
    logger.warn('TELEGRAM_BOT_TOKEN 미설정 — 버튼 메시지 전송 생략')
    return null
  }

  try {
    const apiUrl = `https://api.telegram.org/bot${botToken}`
    const response = await axios.post(`${apiUrl}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: buttons,
      },
    })

    const messageId = response.data?.result?.message_id ?? null
    logger.info('인라인 키보드 메시지 전송 완료', { chatId, messageId })
    return messageId
  } catch (error) {
    logger.error('인라인 키보드 메시지 전송 실패', { chatId, error })
    return null
  }
}

/**
 * 기존 메시지 텍스트 편집 (버튼 제거 + 텍스트 변경)
 */
export async function editMessageText(
  chatId: string | number,
  messageId: number,
  text: string,
): Promise<void> {
  const botToken = config.notification.telegram.botToken
  if (!botToken) return

  try {
    const apiUrl = `https://api.telegram.org/bot${botToken}`
    await axios.post(`${apiUrl}/editMessageText`, {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
    })
    logger.info('메시지 편집 완료', { chatId, messageId })
  } catch (error) {
    logger.error('메시지 편집 실패', { chatId, messageId, error })
  }
}

/**
 * 콜백 쿼리 응답 (텔레그램 로딩 스피너 해제)
 */
export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  const botToken = config.notification.telegram.botToken
  if (!botToken) return

  try {
    const apiUrl = `https://api.telegram.org/bot${botToken}`
    await axios.post(`${apiUrl}/answerCallbackQuery`, {
      callback_query_id: callbackQueryId,
      text,
    })
  } catch (error) {
    logger.error('answerCallbackQuery 실패', { callbackQueryId, error })
  }
}

/** 텔레그램 알림 어댑터 */
export class TelegramNotificationAdapter implements NotificationAdapter {
  private readonly apiUrl: string

  constructor(
    private readonly botToken: string = config.notification.telegram.botToken,
    private readonly chatId: string = config.notification.telegram.chatId,
  ) {
    this.apiUrl = `https://api.telegram.org/bot${this.botToken}`
  }

  async send(notification: Notification): Promise<boolean> {
    if (!this.botToken || !this.chatId) {
      logger.warn('텔레그램 설정 누락 (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)')
      return false
    }

    try {
      const message = formatMessage(notification)

      await axios.post(`${this.apiUrl}/sendMessage`, {
        chat_id: this.chatId,
        text: message,
        parse_mode: 'MarkdownV2',
      })

      logger.info('텔레그램 알림 전송 완료', { type: notification.type })
      return true
    } catch (error) {
      logger.error('텔레그램 알림 전송 실패', error)
      return false
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.apiUrl}/getMe`)
      return response.data.ok === true
    } catch {
      return false
    }
  }
}
