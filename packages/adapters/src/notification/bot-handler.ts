// =============================================
// Telegram 봇 커맨드 핸들러 (양방향 제어)
//
// 기능:
//   - Long-polling으로 커맨드 수신
//   - Admin API HTTP 호출로 Kill Switch 제어 (직접 DB 수정 금지)
//   - 자동 알림 함수 (fallback 임계치, 크래시, DB 실패)
//
// 지원 커맨드:
//   /status   — 시스템 상태 조회 (GET /admin/system)
//   /report   — 오늘 실적 조회 (GET /admin/metrics)
//   /pause price|order|shipping  — 자동화 일시정지
//   /resume price|order|shipping — 자동화 재개
//
// 보안: TELEGRAM_CHAT_ID와 일치하는 채팅방만 응답
// =============================================

import axios from 'axios'
import { config, createLogger } from '@smartstore/shared'
import { answerCallbackQuery } from './telegram'

const logger = createLogger('telegram-bot-handler')

// =============================================
// 환경변수 / 설정
// =============================================

const TOKEN = config.notification.telegram.botToken
const CHAT_ID = config.notification.telegram.chatId
const TG_API = `https://api.telegram.org/bot${TOKEN}`

/** Admin API 기본 URL */
const API_SERVER_URL = process.env['API_SERVER_URL'] ?? 'http://localhost:3000'
/** Admin API Basic Auth 자격증명 */
const ADMIN_USER = process.env['ADMIN_USER'] ?? 'admin'
const ADMIN_PASS = process.env['ADMIN_PASS'] ?? 'changeme'

// =============================================
// 내부 타입 정의
// =============================================

interface SystemStatus {
  workerAlive: boolean
  dbConnected: boolean
  redisConnected: boolean
  memory: { heapUsedMB: number; rssMB: number; heapTotalMB: number }
  competitorQueueDepth: number
  timestamp: string
}

interface Metrics {
  totalRevenue: number
  totalMargin: number
  orderCount: number
  fallbackCount: number
  failedJobCount: number
  date: string
}

interface TelegramMessage {
  chat: { id: number }
  text?: string
}

interface TelegramCallbackQuery {
  id: string
  from: { id: number }
  message?: { chat: { id: number }; message_id: number }
  data?: string  // "approve_{orderId}_{token}" | "reject_{orderId}_{token}"
}

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  callback_query?: TelegramCallbackQuery
}

// =============================================
// Polling 상태
// =============================================

let polling = false
let lastUpdateId = 0

// =============================================
// Admin API 호출 헬퍼
// =============================================

/** Admin API 인증 헤더 생성 */
function adminAuthHeader(): string {
  return 'Basic ' + Buffer.from(`${ADMIN_USER}:${ADMIN_PASS}`).toString('base64')
}

async function adminGet<T>(path: string): Promise<T> {
  const response = await axios.get<T>(`${API_SERVER_URL}${path}`, {
    headers: { Authorization: adminAuthHeader() },
    timeout: 10_000,
  })
  return response.data
}

async function adminPost<T>(path: string, body: unknown): Promise<T> {
  const response = await axios.post<T>(`${API_SERVER_URL}${path}`, body, {
    headers: { Authorization: adminAuthHeader() },
    timeout: 10_000,
  })
  return response.data
}

// =============================================
// Telegram 메시지 전송
// =============================================

/**
 * 지정 chat_id로 텍스트 메시지 전송 (HTML 파싱 모드)
 */
async function sendMessage(chatId: string | number, text: string): Promise<void> {
  if (!TOKEN) {
    logger.warn('TELEGRAM_BOT_TOKEN 미설정 — 메시지 전송 생략')
    return
  }
  try {
    await axios.post(`${TG_API}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    })
  } catch (error) {
    logger.error('Telegram 메시지 전송 실패', { chatId, error })
  }
}

// =============================================
// 메시지 포맷터
// =============================================

/** /status → 시스템 상태 메시지 포맷 */
function formatStatus(s: SystemStatus): string {
  const ok = (v: boolean): string => (v ? '✅ 정상' : '❌ 오류')
  const time = new Date(s.timestamp).toLocaleTimeString('ko-KR')
  return [
    '🖥️ <b>시스템 상태</b>',
    `Worker: ${ok(s.workerAlive)}`,
    `DB: ${ok(s.dbConnected)}`,
    `Redis: ${ok(s.redisConnected)}`,
    `메모리: ${s.memory.heapUsedMB}MB / ${s.memory.heapTotalMB}MB`,
    `큐 심도: ${s.competitorQueueDepth}`,
    `갱신: ${time}`,
  ].join('\n')
}

/** /report → 실적 메시지 포맷 */
function formatMetrics(m: Metrics): string {
  const won = (n: number): string => `₩${n.toLocaleString('ko-KR')}`
  return [
    `📊 <b>오늘의 실적 (${m.date})</b>`,
    `매출: ${won(m.totalRevenue)}`,
    `순익: ${won(m.totalMargin)}`,
    `주문: ${m.orderCount}건`,
    `실패 Job: ${m.failedJobCount}건`,
    `Fallback: ${m.fallbackCount}회`,
  ].join('\n')
}

// =============================================
// 커맨드 처리
// =============================================

/** Kill Switch 키 매핑 */
const KEY_MAP: Record<string, string> = {
  price: 'AUTO_PRICE_ENABLED',
  order: 'AUTO_ORDER_ENABLED',
  shipping: 'AUTO_SHIPPING_ENABLED',
  inventory: 'AUTO_INVENTORY_SYNC_ENABLED',
  approval: 'ORDER_APPROVAL_MODE',
}

/** Kill Switch 레이블 매핑 */
const LABEL_MAP: Record<string, string> = {
  price: '가격 자동화',
  order: '주문 자동화',
  shipping: '배송 자동화',
  inventory: '재고 동기화',
  approval: '주문 승인 모드',
}

/**
 * 텍스트 커맨드를 처리하고 응답 메시지 반환
 * 허용되지 않은 chat_id → 빈 문자열 반환 (응답 생략)
 */
export async function handleBotCommand(text: string, chatId: string | number): Promise<string> {
  // 보안: 허용된 채팅방만 응답 (환경변수 TELEGRAM_CHAT_ID와 일치 확인)
  if (String(chatId) !== String(CHAT_ID)) {
    logger.warn('봇 커맨드 — 허용되지 않은 chat_id, 무시', { chatId, allowed: CHAT_ID })
    return ''
  }

  const parts = text.trim().split(/\s+/)
  const cmd = (parts[0] ?? '').toLowerCase()
  const arg = (parts[1] ?? '').toLowerCase()

  try {
    // /status — 시스템 상태 조회
    if (cmd === '/status') {
      const status = await adminGet<SystemStatus>('/admin/system')
      return formatStatus(status)
    }

    // /report — 오늘 실적 조회
    if (cmd === '/report') {
      const metrics = await adminGet<Metrics>('/admin/metrics')
      return formatMetrics(metrics)
    }

    // /pause [price|order|shipping] — Kill Switch 비활성화
    if (cmd === '/pause') {
      const key = KEY_MAP[arg]
      const label = LABEL_MAP[arg]
      if (!key || !label) {
        return '❓ 대상을 지정하세요: /pause price|order|shipping|inventory|approval'
      }
      await adminPost('/admin/control', { key, value: 'false' })
      return `⏸️ <b>${label}</b> 일시정지됨`
    }

    // /resume [price|order|shipping] — Kill Switch 활성화
    if (cmd === '/resume') {
      const key = KEY_MAP[arg]
      const label = LABEL_MAP[arg]
      if (!key || !label) {
        return '❓ 대상을 지정하세요: /resume price|order|shipping|inventory|approval'
      }
      await adminPost('/admin/control', { key, value: 'true' })
      return `▶️ <b>${label}</b> 재개됨`
    }

    // /pending — 대기 중 승인 요청 목록
    if (cmd === '/pending') {
      const data = await adminGet<{ items: Array<{ orderId: string; product: string; expiresAt: string }> }>('/orders/pending-approvals')
      if (data.items.length === 0) {
        return '✅ 대기 중인 승인 요청 없음'
      }
      const lines = data.items.map((item, i) =>
        `${i + 1}. ${item.product} (주문: ${item.orderId})\n   만료: ${new Date(item.expiresAt).toLocaleTimeString('ko-KR')}`
      )
      return `🔔 <b>대기 중 승인 요청 (${data.items.length}건)</b>\n\n${lines.join('\n\n')}`
    }

    // 알 수 없는 커맨드
    return '❓ 알 수 없는 명령어. 사용 가능:\n/status /report /pending\n/pause [price|order|shipping|inventory|approval]\n/resume [price|order|shipping|inventory|approval]'
  } catch (error) {
    logger.error('봇 커맨드 처리 실패', { cmd, arg, error })
    const msg = error instanceof Error ? error.message : '알 수 없는 오류'
    return `❌ 오류 발생: ${msg}`
  }
}

// =============================================
// 승인 콜백 핸들러 (Phase 4.5)
// =============================================

/**
 * Telegram 인라인 키보드 콜백 처리
 *
 * callback_data 형식: "approve_{orderId}_{token}" or "reject_{orderId}_{token}"
 * 1. chat_id 보안 확인
 * 2. callback_data 파싱
 * 3. answerCallbackQuery (스피너 해제)
 * 4. Admin API 호출 (POST /orders/{orderId}/approve or /reject)
 */
async function handleApprovalCallback(query: TelegramCallbackQuery): Promise<void> {
  const chatId = query.message?.chat.id
  if (!chatId || String(chatId) !== String(CHAT_ID)) {
    logger.warn('콜백 — 허용되지 않은 chat_id, 무시', { chatId })
    return
  }

  const data = query.data
  if (!data) return

  // callback_data 파싱: "approve_{orderId}_{token}" or "reject_{orderId}_{token}"
  const parts = data.split('_')
  if (parts.length < 3) {
    await answerCallbackQuery(query.id, '❌ 잘못된 콜백')
    return
  }

  const action = parts[0]  // 'approve' or 'reject'
  const orderId = parts[1]
  const token = parts.slice(2).join('_')  // token에 _ 포함 가능

  if (action !== 'approve' && action !== 'reject') {
    await answerCallbackQuery(query.id, '❌ 알 수 없는 액션')
    return
  }

  // 스피너 해제
  await answerCallbackQuery(query.id, action === 'approve' ? '✅ 승인 처리 중...' : '❌ 거부 처리 중...')

  try {
    const endpoint = action === 'approve'
      ? `/orders/${orderId}/approve`
      : `/orders/${orderId}/reject`

    await adminPost(endpoint, {
      approvalToken: token,
    })

    logger.info('승인 콜백 처리 완료', { action, orderId })
  } catch (error) {
    logger.error('승인 콜백 API 호출 실패', { action, orderId, error })
    // 실패 시 사용자에게 알림
    if (chatId) {
      await sendMessage(chatId, `❌ ${action === 'approve' ? '승인' : '거부'} 처리 실패: ${orderId}`)
    }
  }
}

// =============================================
// Long-polling
// =============================================

/**
 * Telegram Bot API long-polling 시작
 * - getUpdates API로 메시지를 실시간 수신
 * - 오류 발생 시 5초 대기 후 재시도 (서버 종료 방지)
 */
export async function startBotPolling(): Promise<void> {
  if (!TOKEN || !CHAT_ID) {
    logger.warn('TELEGRAM_BOT_TOKEN 또는 TELEGRAM_CHAT_ID 미설정 — 봇 polling 비활성화')
    return
  }

  polling = true
  logger.info('Telegram 봇 polling 시작', { chatId: CHAT_ID })

  // polling 루프: 오류 발생해도 재시도
  while (polling) {
    try {
      // long-polling: 최대 30초 대기
      const url = `${TG_API}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`
      const response = await axios.get<{ ok: boolean; result: TelegramUpdate[] }>(url, {
        timeout: 35_000, // polling timeout(30s) + 여유 5s
      })

      if (!response.data.ok) {
        await sleep(5_000)
        continue
      }

      // 수신한 업데이트 처리
      for (const update of response.data.result) {
        lastUpdateId = update.update_id

        // 텍스트 메시지 처리 (기존)
        const msgText = update.message?.text
        const msgChatId = update.message?.chat.id

        if (msgText && msgChatId) {
          const responseText = await handleBotCommand(msgText, msgChatId)
          if (responseText) {
            await sendMessage(msgChatId, responseText)
          }
        }

        // 인라인 키보드 콜백 처리 (Phase 4.5)
        if (update.callback_query?.data) {
          await handleApprovalCallback(update.callback_query)
        }
      }
    } catch (error) {
      // 네트워크 오류, Telegram API 오류 등 → 재시도
      logger.warn('Telegram polling 오류 — 5초 후 재시도', { error })
      await sleep(5_000)
    }
  }
}

/** polling 중단 (테스트 / 서버 종료 시 호출) */
export function stopBotPolling(): void {
  polling = false
  logger.info('Telegram 봇 polling 중단')
}

// =============================================
// 자동 알림 함수
// (외부에서 조건 충족 시 직접 호출)
// =============================================

/**
 * Fallback 임계치 초과 알림
 * @param count 연속 Fallback 발생 횟수
 */
export async function alertFallbackThreshold(count: number): Promise<void> {
  if (!CHAT_ID) return
  logger.warn('Fallback 임계치 초과 — 텔레그램 알림 전송', { count })
  await sendMessage(CHAT_ID, `⚠️ <b>Fallback 임계치 초과</b>\n연속 ${count}회 발생\n경쟁사 조회 실패가 반복되고 있습니다.`)
}

/**
 * 워커 크래시 알림
 * @param error 크래시 원인 오류
 */
export async function alertWorkerCrash(error: Error): Promise<void> {
  if (!CHAT_ID) return
  logger.error('워커 크래시 알림 전송', { error: error.message })
  await sendMessage(CHAT_ID, `🚨 <b>워커 크래시 발생</b>\n${error.message}\n즉시 확인이 필요합니다.`)
}

/**
 * DB 연결 실패 알림
 * @param error DB 연결 오류
 */
export async function alertDbFailure(error: Error): Promise<void> {
  if (!CHAT_ID) return
  logger.error('DB 연결 실패 알림 전송', { error: error.message })
  await sendMessage(CHAT_ID, `🚨 <b>DB 연결 실패</b>\n${error.message}\n데이터베이스 상태를 확인하세요.`)
}

// =============================================
// 유틸
// =============================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
