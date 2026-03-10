// =============================================
// 판매 중지/재개 서비스
// - 재고 부족 시 네이버 상품 판매 중지
// - 재고 복구 시 판매 재개
// =============================================

import { prisma } from '@smartstore/db'
import { Ok, Err } from '@smartstore/shared'
import type { Result } from '@smartstore/shared'

/**
 * 판매 중지: 재고 부족 시 호출
 *   1. DB: listingPaused=true, status='suspended', listingPausedAt=now
 *   2. InventoryEvent 기록 (type: 'pause')
 *
 * 네이버 API 호출은 워커에서 별도 처리 (이 서비스는 DB 상태만 관리)
 */
export async function pauseListing(productId: string, reason?: string): Promise<Result<void>> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, cachedStock: true, listingPaused: true },
  })

  if (!product) {
    return Err(new Error(`상품을 찾을 수 없습니다: ${productId}`))
  }

  if (product.listingPaused) {
    return Ok(undefined) // 이미 중지됨 — 멱등성
  }

  await prisma.product.update({
    where: { id: productId },
    data: {
      listingPaused: true,
      listingPausedAt: new Date(),
      status: 'suspended',
    },
  })

  await prisma.inventoryEvent.create({
    data: {
      productId,
      type: 'pause',
      previousStock: product.cachedStock,
      newStock: product.cachedStock,
      reason: reason ?? '재고 부족으로 판매 중지',
    },
  })

  return Ok(undefined)
}

/**
 * 판매 재개: 재고 복구 시 호출
 *   1. DB: listingPaused=false, status='active', listingPausedAt=null
 *   2. InventoryEvent 기록 (type: 'resume')
 */
export async function resumeListing(productId: string, reason?: string): Promise<Result<void>> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, cachedStock: true, listingPaused: true },
  })

  if (!product) {
    return Err(new Error(`상품을 찾을 수 없습니다: ${productId}`))
  }

  if (!product.listingPaused) {
    return Ok(undefined) // 이미 판매 중 — 멱등성
  }

  await prisma.product.update({
    where: { id: productId },
    data: {
      listingPaused: false,
      listingPausedAt: null,
      status: 'active',
    },
  })

  await prisma.inventoryEvent.create({
    data: {
      productId,
      type: 'resume',
      previousStock: product.cachedStock,
      newStock: product.cachedStock,
      reason: reason ?? '재고 복구로 판매 재개',
    },
  })

  return Ok(undefined)
}
