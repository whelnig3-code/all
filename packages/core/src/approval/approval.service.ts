// =============================================
// 주문 승인 서비스 (Phase 4.5 — Human Approval Mode)
//
// 비유: 무인 편의점의 "점원 확인" 모드.
// 주문마다 텔레그램 [승인/거부] 버튼이 오고,
// 운영자가 터치해야 돈이 나간다.
//
// 핵심:
//   - 모든 전이(create/approve/reject/timeout)는 Prisma $transaction
//   - approvalToken 검증으로 위조/리플레이 방지
//   - status=pending 검증 후에만 처리 (멱등성)
//   - reservedUntil TTL 설정으로 크래시 복구
// =============================================

import crypto from 'crypto'
import { prisma } from '@smartstore/db'
import { Ok, Err, config } from '@smartstore/shared'
import type { Result } from '@smartstore/shared'
import { sendMessageWithButtons, editMessageText } from '@smartstore/adapters'
import {
  reserveStock,
  releaseStock,
  confirmStockDeduction,
} from '../inventory/stock-reservation.service'
import { APPROVAL_TIMEOUT_MS } from './constants'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueueAddFn = (name: string, data: unknown, opts?: any) => Promise<unknown>

/** 안전 마진 하한선 (15%) */
const MIN_MARGIN_RATE = 0.15

/**
 * 승인 요청 생성
 *
 * Prisma $transaction 내에서:
 *   1. 안전 검증 (margin >= 15%)
 *   2. reserveStock + reservedUntil 설정
 *   3. approvalToken = crypto.randomUUID()
 *   4. OrderApproval 생성 (status=pending, expiresAt=now+5min)
 *   5. ApprovalEvent 기록 (action=created)
 *   6. 텔레그램 인라인 키보드 전송
 *   7. BullMQ delayed job 스케줄
 */
export async function createApprovalRequest(
  orderId: string,
  queueAdd: QueueAddFn,
): Promise<Result<void>> {
  return prisma.$transaction(async (tx) => {
    // 1. 주문 + 상품 조회
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            wholesalePrice: true,
            shippingFee: true,
            naverFeeRate: true,
            cachedStock: true,
            reservedStock: true,
            supplierStock: true,
          },
        },
      },
    })

    if (!order) {
      return Err(new Error(`주문을 찾을 수 없습니다: ${orderId}`))
    }

    const product = order.product

    // 2. 안전 검증 — 마진 15% 미만이면 자동 거부
    const fee = Math.round(order.salePrice * product.naverFeeRate)
    const wholesaleCost = (product.wholesalePrice ?? 0) + (product.shippingFee ?? 0)
    const marginAmount = order.salePrice - wholesaleCost - fee
    const marginRate = order.salePrice > 0 ? marginAmount / order.salePrice : 0

    if (marginRate < MIN_MARGIN_RATE) {
      return Err(new Error(
        `마진율 미달로 자동 거부: ${(marginRate * 100).toFixed(1)}% (최소 ${MIN_MARGIN_RATE * 100}%)`
      ))
    }

    // 3. 재고 예약
    const reserveResult = await reserveStock(product.id, order.quantity)
    if (!reserveResult.ok) {
      return Err(reserveResult.error)
    }

    // 4. reservedUntil 설정 (TTL)
    const expiresAt = new Date(Date.now() + APPROVAL_TIMEOUT_MS)
    await tx.product.update({
      where: { id: product.id },
      data: { reservedUntil: expiresAt },
    })

    // 5. approvalToken 생성 + OrderApproval 생성
    const approvalToken = crypto.randomUUID()
    const approval = await tx.orderApproval.create({
      data: {
        orderId,
        status: 'pending',
        approvalToken,
        expiresAt,
        marginRate,
        supplierStock: product.cachedStock,
      },
    })

    // 6. ApprovalEvent 기록
    await tx.approvalEvent.create({
      data: {
        orderId,
        action: 'created',
        metadata: { marginRate, supplierStock: product.cachedStock },
      },
    })

    // 7. 텔레그램 인라인 키보드 전송
    const chatId = config.notification.telegram.chatId
    const messageText = formatApprovalMessage(order, product, marginRate, marginAmount)
    const buttons = [
      [
        { text: '✅ 승인', callback_data: `approve_${orderId}_${approvalToken}` },
        { text: '❌ 거부', callback_data: `reject_${orderId}_${approvalToken}` },
      ],
    ]

    const messageId = await sendMessageWithButtons(chatId, messageText, buttons)

    // telegramMessageId 저장
    if (messageId) {
      await tx.orderApproval.update({
        where: { id: approval.id },
        data: { telegramMessageId: messageId },
      })
    }

    // 8. BullMQ delayed job (5분 후 check_timeout)
    await queueAdd(
      'check_timeout',
      {
        orderId,
        approvalToken,
        action: 'check_timeout',
      },
      { delay: APPROVAL_TIMEOUT_MS },
    )

    return Ok(undefined)
  })
}

/**
 * 승인 처리
 *
 * Prisma $transaction 내에서:
 *   1. approvalToken 검증
 *   2. status=pending 확인 (이미 처리됨이면 멱등 반환)
 *   3. OrderApproval → approved
 *   4. confirmStockDeduction
 *   5. Product.reservedUntil → null
 *   6. Order.status → 'preparing'
 *   7. ApprovalEvent (action=approved)
 *   8. 텔레그램 메시지 편집
 */
export async function approveOrder(
  orderId: string,
  token: string,
): Promise<Result<void>> {
  return prisma.$transaction(async (tx) => {
    const approval = await tx.orderApproval.findUnique({
      where: { orderId },
      include: {
        order: {
          include: {
            product: { select: { id: true, name: true } },
          },
        },
      },
    })

    if (!approval) {
      return Err(new Error(`승인 요청을 찾을 수 없습니다: ${orderId}`))
    }

    // 토큰 검증
    if (approval.approvalToken !== token) {
      return Err(new Error('유효하지 않은 승인 토큰'))
    }

    // 이미 처리됨 → 멱등 반환
    if (approval.status !== 'pending') {
      return Ok(undefined)
    }

    const order = approval.order
    const productId = order.productId

    // OrderApproval → approved
    await tx.orderApproval.update({
      where: { orderId },
      data: {
        status: 'approved',
        decidedBy: 'operator',
        decidedAt: new Date(),
      },
    })

    // 예약 확정 차감
    await confirmStockDeduction(productId, order.quantity)

    // reservedUntil 초기화
    await tx.product.update({
      where: { id: productId },
      data: { reservedUntil: null },
    })

    // Order status → preparing
    await tx.order.update({
      where: { id: orderId },
      data: { status: 'preparing' },
    })

    // ApprovalEvent 기록
    await tx.approvalEvent.create({
      data: {
        orderId,
        action: 'approved',
      },
    })

    // 텔레그램 메시지 편집
    if (approval.telegramMessageId) {
      const chatId = config.notification.telegram.chatId
      await editMessageText(
        chatId,
        approval.telegramMessageId,
        `✅ <b>승인 완료</b>\n주문: ${order.naverOrderId}\n상품: ${order.product.name}`,
      )
    }

    return Ok(undefined)
  })
}

/**
 * 거부 처리
 *
 * Prisma $transaction 내에서:
 *   1. approvalToken 검증
 *   2. status=pending 확인
 *   3. OrderApproval → rejected
 *   4. releaseStock
 *   5. Product.reservedUntil → null
 *   6. Order.status → 'cancelled'
 *   7. ApprovalEvent (action=rejected)
 *   8. 텔레그램 메시지 편집
 */
export async function rejectOrder(
  orderId: string,
  token: string,
  reason?: string,
): Promise<Result<void>> {
  return prisma.$transaction(async (tx) => {
    const approval = await tx.orderApproval.findUnique({
      where: { orderId },
      include: {
        order: {
          include: {
            product: { select: { id: true, name: true } },
          },
        },
      },
    })

    if (!approval) {
      return Err(new Error(`승인 요청을 찾을 수 없습니다: ${orderId}`))
    }

    // 토큰 검증
    if (approval.approvalToken !== token) {
      return Err(new Error('유효하지 않은 승인 토큰'))
    }

    // 이미 처리됨 → 멱등 반환
    if (approval.status !== 'pending') {
      return Ok(undefined)
    }

    const order = approval.order
    const productId = order.productId

    // OrderApproval → rejected
    await tx.orderApproval.update({
      where: { orderId },
      data: {
        status: 'rejected',
        decidedBy: 'operator',
        decidedAt: new Date(),
        rejectReason: reason,
      },
    })

    // 예약 해제
    await releaseStock(productId, order.quantity)

    // reservedUntil 초기화
    await tx.product.update({
      where: { id: productId },
      data: { reservedUntil: null },
    })

    // Order status → cancelled
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
      },
    })

    // ApprovalEvent 기록
    await tx.approvalEvent.create({
      data: {
        orderId,
        action: 'rejected',
        metadata: { reason: reason ?? null },
      },
    })

    // 텔레그램 메시지 편집
    if (approval.telegramMessageId) {
      const chatId = config.notification.telegram.chatId
      await editMessageText(
        chatId,
        approval.telegramMessageId,
        `❌ <b>거부됨</b>\n주문: ${order.naverOrderId}\n상품: ${order.product.name}${reason ? `\n사유: ${reason}` : ''}`,
      )
    }

    return Ok(undefined)
  })
}

/**
 * 타임아웃 처리 (BullMQ delayed job에서 호출)
 *
 *   1. status=pending 확인 (이미 처리됨이면 무시)
 *   2. OrderApproval → timeout
 *   3. releaseStock
 *   4. Product.reservedUntil → null
 *   5. Order.status → 'cancelled'
 *   6. ApprovalEvent (action=timeout)
 *   7. 텔레그램 메시지 편집 + 알림
 */
export async function handleApprovalTimeout(
  orderId: string,
): Promise<Result<void>> {
  return prisma.$transaction(async (tx) => {
    const approval = await tx.orderApproval.findUnique({
      where: { orderId },
      include: {
        order: {
          include: {
            product: { select: { id: true, name: true } },
          },
        },
      },
    })

    // 승인 요청 없음 → 무시
    if (!approval) {
      return Ok(undefined)
    }

    // 이미 처리됨 → 무시 (승인/거부/타임아웃 모두)
    if (approval.status !== 'pending') {
      return Ok(undefined)
    }

    const order = approval.order
    const productId = order.productId

    // OrderApproval → timeout
    await tx.orderApproval.update({
      where: { orderId },
      data: {
        status: 'timeout',
        decidedBy: 'system_timeout',
        decidedAt: new Date(),
      },
    })

    // 예약 해제
    await releaseStock(productId, order.quantity)

    // reservedUntil 초기화
    await tx.product.update({
      where: { id: productId },
      data: { reservedUntil: null },
    })

    // Order status → cancelled
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
      },
    })

    // ApprovalEvent 기록
    await tx.approvalEvent.create({
      data: {
        orderId,
        action: 'timeout',
      },
    })

    // 텔레그램 메시지 편집
    if (approval.telegramMessageId) {
      const chatId = config.notification.telegram.chatId
      await editMessageText(
        chatId,
        approval.telegramMessageId,
        `⏰ <b>타임아웃</b>\n주문: ${order.naverOrderId}\n상품: ${order.product.name}\n5분 내 응답 없어 자동 취소됨`,
      )
    }

    return Ok(undefined)
  })
}

/**
 * 만료된 예약 정리 (크래시 복구용)
 *
 * reservedUntil < now인 상품의 reservedStock을 0으로 리셋.
 * 스케줄러에서 1분마다 호출.
 */
export async function cleanExpiredReservations(): Promise<number> {
  const now = new Date()

  const expired = await prisma.product.findMany({
    where: {
      reservedUntil: { lt: now },
      reservedStock: { gt: 0 },
    },
    select: { id: true, reservedStock: true },
  })

  if (expired.length === 0) {
    return 0
  }

  // 만료된 상품 일괄 리셋
  const result = await prisma.product.updateMany({
    where: {
      id: { in: expired.map((p) => p.id) },
    },
    data: {
      reservedStock: 0,
      reservedUntil: null,
    },
  })

  return result.count
}

// =============================================
// 내부 헬퍼
// =============================================

interface OrderWithProduct {
  naverOrderId: string
  quantity: number
  salePrice: number
  customerName: string
  product: {
    name: string
    wholesalePrice: number | null
    shippingFee: number | null
    cachedStock: number
  }
}

/** 승인 요청 텔레그램 메시지 포맷 */
function formatApprovalMessage(
  order: OrderWithProduct,
  product: OrderWithProduct['product'],
  marginRate: number,
  marginAmount: number,
): string {
  const wholesalePrice = product.wholesalePrice ?? 0
  return [
    '🔔 <b>주문 승인 요청</b>',
    '',
    `📦 상품: ${product.name}`,
    `💰 판매가: ₩${order.salePrice.toLocaleString('ko-KR')}`,
    `🏭 도매가: ₩${wholesalePrice.toLocaleString('ko-KR')}`,
    `📊 마진: ${(marginRate * 100).toFixed(1)}% (₩${marginAmount.toLocaleString('ko-KR')})`,
    `📦 재고: ${product.cachedStock}개`,
    `👤 고객: ${order.customerName} / ${order.quantity}개`,
    '',
    '⏰ 5분 내 응답 필요',
  ].join('\n')
}
