// =============================================
// 관세 계산기 단위 테스트
// =============================================

import { calculateCustoms } from './customs'

// =============================================
// 테스트
// =============================================

describe('calculateCustoms', () => {
  // ---- $150 면세 규정 ----

  it('$150 이하 → 면세 (duty free)', () => {
    // 100,000원 = ~$76.9 @ 1300 → 면세
    const result = calculateCustoms({
      overseasCostKRW: 80_000,
      overseasShipFeeKRW: 20_000,
      category: '전자제품',
    })

    expect(result.dutyFree).toBe(true)
    expect(result.customsRate).toBe(0)
    expect(result.dutyFreeReason).toBeDefined()
  })

  it('$150 초과 → 과세 (duty applied)', () => {
    // 200,000원 = ~$153.8 @ 1300 → 과세
    const result = calculateCustoms({
      overseasCostKRW: 180_000,
      overseasShipFeeKRW: 20_000,
      category: '전자제품',
    })

    expect(result.dutyFree).toBe(false)
    expect(result.customsRate).toBe(0.08)
  })

  // ---- 경계값 ----

  it('경계값: 정확히 $150 (195,000원) → 면세', () => {
    // 150 * 1300 = 195,000원 정확히
    const result = calculateCustoms({
      overseasCostKRW: 175_000,
      overseasShipFeeKRW: 20_000,
    })

    expect(result.dutyFree).toBe(true)
    expect(result.customsRate).toBe(0)
  })

  it('경계값: $150 초과 (195,001원) → 과세', () => {
    const result = calculateCustoms({
      overseasCostKRW: 175_001,
      overseasShipFeeKRW: 20_000,
    })

    expect(result.dutyFree).toBe(false)
    expect(result.customsRate).toBeGreaterThan(0)
  })

  // ---- 카테고리별 관세율 ----

  it('의류/패션 카테고리 → 13%', () => {
    const result = calculateCustoms({
      overseasCostKRW: 300_000,
      overseasShipFeeKRW: 30_000,
      category: '의류/패션',
    })

    expect(result.customsRate).toBe(0.13)
  })

  it('전자제품 카테고리 → 8%', () => {
    const result = calculateCustoms({
      overseasCostKRW: 300_000,
      overseasShipFeeKRW: 30_000,
      category: '전자제품',
    })

    expect(result.customsRate).toBe(0.08)
  })

  it('화장품/뷰티 카테고리 → 6.5%', () => {
    const result = calculateCustoms({
      overseasCostKRW: 300_000,
      overseasShipFeeKRW: 30_000,
      category: '화장품/뷰티',
    })

    expect(result.customsRate).toBe(0.065)
  })

  it('카테고리 미지정 → 기본 8%', () => {
    const result = calculateCustoms({
      overseasCostKRW: 300_000,
      overseasShipFeeKRW: 30_000,
    })

    expect(result.customsRate).toBe(0.08)
  })

  // ---- dutyFreeReason 확인 ----

  it('면세 시 dutyFreeReason에 $150 관련 설명 포함', () => {
    const result = calculateCustoms({
      overseasCostKRW: 100_000,
      overseasShipFeeKRW: 10_000,
    })

    expect(result.dutyFree).toBe(true)
    expect(result.dutyFreeReason).toContain('150')
  })

  it('과세 시 dutyFreeReason은 undefined', () => {
    const result = calculateCustoms({
      overseasCostKRW: 300_000,
      overseasShipFeeKRW: 30_000,
    })

    expect(result.dutyFree).toBe(false)
    expect(result.dutyFreeReason).toBeUndefined()
  })

  // ---- 커스텀 기준환율 ----

  it('usdReferenceRate 커스텀 값 적용', () => {
    // 150 * 1400 = 210,000원 기준
    // 200,000원 → 210,000 이하 → 면세
    const result = calculateCustoms({
      overseasCostKRW: 180_000,
      overseasShipFeeKRW: 20_000,
    }, { usdReferenceRate: 1400 })

    expect(result.dutyFree).toBe(true)
    expect(result.customsRate).toBe(0)
  })

  // ---- 식품 카테고리 ----

  it('식품 카테고리 → 8%', () => {
    const result = calculateCustoms({
      overseasCostKRW: 300_000,
      overseasShipFeeKRW: 30_000,
      category: '식품',
    })

    expect(result.customsRate).toBe(0.08)
  })
})
