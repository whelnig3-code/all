// =============================================
// 재고 예약 서비스 — 동시성 보호 + 원자적 예약/해제
// Prisma $transaction + SELECT FOR UPDATE
// =============================================

import { prisma } from '@smartstore/db'
import { Ok, Err } from '@smartstore/shared'
import type { Result, ReservationResult } from '@smartstore/shared'

/**
 * 트랜잭션 내에서 상품을 행 잠금으로 조회한다.
 * PostgreSQL SELECT ... FOR UPDATE → 같은 행에 대한 동시 트랜잭션은 대기.
 */
async function findProductForUpdate(tx: { $queryRaw: Function }, productId: string) {
  const rows = await tx.$queryRaw`
    SELECT id, "cachedStock", "reservedStock", "supplierStock", "listingPaused"
    FROM products
    WHERE id = ${productId}
    FOR UPDATE
  ` as Array<{
    id: string
    cachedStock: number
    reservedStock: number
    supplierStock: number
    listingPaused: boolean
  }>
  return rows[0] ?? null
}

/**
 * 재고 예약: 주문 접수 시 호출
 */
export async function reserveStock(
  productId: string,
  qty: number
): Promise<Result<ReservationResult>> {
  if (qty <= 0) {
    return Err(new Error('예약 수량은 1 이상이어야 합니다'))
  }

  return prisma.$transaction(async (tx) => {
    const product = await findProductForUpdate(tx, productId)
    if (!product) {
      return Err(new Error(`상품을 찾을 수 없습니다: ${productId}`))
    }

    const availableStock = product.cachedStock - product.reservedStock
    if (availableStock < qty) {
      return Err(new Error(
        `재고 부족: 가용 ${availableStock}, 요청 ${qty} (상품: ${productId})`
      ))
    }

    const newReserved = product.reservedStock + qty

    await tx.product.update({
      where: { id: productId },
      data: { reservedStock: newReserved },
    })

    await tx.inventoryEvent.create({
      data: {
        productId,
        type: 'reserve',
        previousStock: product.cachedStock,
        newStock: product.cachedStock,
        reservedDelta: qty,
        reason: `재고 예약: ${qty}개`,
      },
    })

    return Ok({
      productId,
      reservedQty: qty,
      availableStock: availableStock - qty,
      reservedStock: newReserved,
    })
  })
}

/**
 * 예약 해제: 주문 취소/실패 시 호출
 */
export async function releaseStock(
  productId: string,
  qty: number
): Promise<Result<void>> {
  return prisma.$transaction(async (tx) => {
    const product = await findProductForUpdate(tx, productId)
    if (!product) {
      return Err(new Error(`상품을 찾을 수 없습니다: ${productId}`))
    }

    const newReserved = Math.max(product.reservedStock - qty, 0)

    await tx.product.update({
      where: { id: productId },
      data: { reservedStock: newReserved },
    })

    await tx.inventoryEvent.create({
      data: {
        productId,
        type: 'release',
        previousStock: product.cachedStock,
        newStock: product.cachedStock,
        reservedDelta: -(product.reservedStock - newReserved),
        reason: `예약 해제: ${qty}개`,
      },
    })

    return Ok(undefined)
  })
}

/**
 * 예약 확정 → 실 차감: 발주 완료 시 호출
 */
export async function confirmStockDeduction(
  productId: string,
  qty: number
): Promise<Result<void>> {
  return prisma.$transaction(async (tx) => {
    const product = await findProductForUpdate(tx, productId)
    if (!product) {
      return Err(new Error(`상품을 찾을 수 없습니다: ${productId}`))
    }

    const newCachedStock = Math.max(product.cachedStock - qty, 0)
    const newReserved = Math.max(product.reservedStock - qty, 0)

    await tx.product.update({
      where: { id: productId },
      data: {
        cachedStock: newCachedStock,
        reservedStock: newReserved,
      },
    })

    await tx.inventoryEvent.create({
      data: {
        productId,
        type: 'order_decrement',
        previousStock: product.cachedStock,
        newStock: newCachedStock,
        reservedDelta: -(product.reservedStock - newReserved),
        reason: `주문 확정 차감: ${qty}개`,
      },
    })

    return Ok(undefined)
  })
}
