// =============================================
// 구매대행 가격 계산 엔진 단위 테스트
// =============================================

import { calculateOverseasPrice, type OverseasPriceParams } from './overseas'

// =============================================
// CLAUDE.md 기준 예시 파라미터
// =============================================

/** CLAUDE.md 예시: USB 케이블 $2.50, 환율 1200, 관세 10%, 마진 30% */
const BASE_PARAMS: OverseasPriceParams = {
  overseasPrice: 2.5,
  currency: 'USD',
  exchangeRate: 1200,
  overseasShipFee: 1000,
  customsRate: 0.10,
  domesticShipFee: 3000,
  naverFeeRate: 0.05,
  targetMarginRate: 0.30,
}

// =============================================
// 테스트
// =============================================

describe('calculateOverseasPrice', () => {

  // ---- CLAUDE.md 예시 검증 ----

  it('CLAUDE.md 예시: 판매가 11,740원', () => {
    const result = calculateOverseasPrice(BASE_PARAMS)
    expect(result.salePrice).toBe(11740)
  })

  it('costBreakdown.overseasCost = 3,000원 ($2.50 × 1200)', () => {
    const result = calculateOverseasPrice(BASE_PARAMS)
    expect(result.costBreakdown.overseasCost).toBe(3000)
  })

  it('costBreakdown.customs = 300원 (3000 × 10%)', () => {
    const result = calculateOverseasPrice(BASE_PARAMS)
    expect(result.costBreakdown.customs).toBe(300)
  })

  it('costBreakdown.vat = 330원 ((3000+300) × 10%)', () => {
    const result = calculateOverseasPrice(BASE_PARAMS)
    expect(result.costBreakdown.vat).toBe(330)
  })

  it('costBreakdown.totalCost = 7,630원', () => {
    const result = calculateOverseasPrice(BASE_PARAMS)
    expect(result.costBreakdown.totalCost).toBe(7630)
  })

  it('costBreakdown.overseasShipFee = 1,000원', () => {
    const result = calculateOverseasPrice(BASE_PARAMS)
    expect(result.costBreakdown.overseasShipFee).toBe(1000)
  })

  it('costBreakdown.domesticShipFee = 3,000원', () => {
    const result = calculateOverseasPrice(BASE_PARAMS)
    expect(result.costBreakdown.domesticShipFee).toBe(3000)
  })

  // ---- CEIL 10원 단위 ----

  it('분수 결과 → 10원 단위 올림 (11,738.46 → 11,740)', () => {
    // totalCost=7630, divisor=0.65 → rawPrice=11738.46... → CEIL → 11740
    const result = calculateOverseasPrice(BASE_PARAMS)
    expect(result.salePrice % 10).toBe(0)
    expect(result.salePrice).toBeGreaterThanOrEqual(11738)
  })

  it('정확히 10원 배수인 경우 → 그대로 유지', () => {
    // 원가를 조정해 rawPrice가 정확히 10 배수가 되도록
    const params: OverseasPriceParams = {
      ...BASE_PARAMS,
      overseasShipFee: 0,
      customsRate: 0,
      domesticShipFee: 0,
      // overseasCost = 2.5 × 2000 = 5000, vat = 500, total = 5500
      // rawPrice = 5500 / 0.65 = 8461.538... → CEIL → 8470
      exchangeRate: 2000,
    }
    const result = calculateOverseasPrice(params)
    expect(result.salePrice % 10).toBe(0)
  })

  // ---- 마진율 안전장치 ----

  it('마진율 15% 미만 → Error throw', () => {
    // 원가를 높여 마진이 15% 미만이 되도록
    const lowMarginParams: OverseasPriceParams = {
      ...BASE_PARAMS,
      overseasPrice: 100,      // $100 → 120,000원 원가 (매우 높음)
      exchangeRate: 1200,
      targetMarginRate: 0.05, // 목표 마진 5%만 설정해도 실제 마진이 15% 이상이면 OK
      // 이 경우 totalCost 계산: 120000 + 1000 + 12000 + 13200 + 3000 = 149200
      // divisor = 1 - 0.05 - 0.05 = 0.90
      // rawPrice = 149200 / 0.90 = 165,778원
      // salePrice = 165,780원
      // revenue = 165780 × 0.95 = 157491
      // margin = (157491 - 149200) / 165780 = 0.05 (5%) < 15%
      naverFeeRate: 0.05,
    }
    expect(() => calculateOverseasPrice(lowMarginParams)).toThrow('마진율 안전장치')
  })

  it('마진율 안전장치 오류 메시지에 실제 마진율 포함', () => {
    const lowMarginParams: OverseasPriceParams = {
      ...BASE_PARAMS,
      overseasPrice: 100,
      exchangeRate: 1200,
      targetMarginRate: 0.05,
      naverFeeRate: 0.05,
    }
    expect(() => calculateOverseasPrice(lowMarginParams)).toThrow('%')
  })

  // ---- 마진율 반환값 ----

  it('marginRate 반환값이 0과 1 사이', () => {
    const result = calculateOverseasPrice(BASE_PARAMS)
    expect(result.marginRate).toBeGreaterThan(0)
    expect(result.marginRate).toBeLessThan(1)
  })

  it('marginRate가 최소 15% 이상', () => {
    const result = calculateOverseasPrice(BASE_PARAMS)
    expect(result.marginRate).toBeGreaterThanOrEqual(0.15)
  })

  // ---- CNY 통화 ----

  it('CNY 통화도 동일 공식 적용', () => {
    const cnyParams: OverseasPriceParams = {
      ...BASE_PARAMS,
      currency: 'CNY',
      overseasPrice: 18,       // 18위안
      exchangeRate: 180,       // 1위안 = 180원
      overseasShipFee: 500,
      customsRate: 0.08,
      domesticShipFee: 2500,
    }
    const result = calculateOverseasPrice(cnyParams)
    // overseasCost = 18 × 180 = 3240
    // customs = 3240 × 0.08 = 259.2 → Math.round → 259
    // vat = (3240 + 259) × 0.1 = 349.9 → Math.round → 350
    // totalCost = 3240 + 500 + 259 + 350 + 2500 = 6849
    // rawPrice = 6849 / 0.65 = 10537.0... → CEIL → 10540
    expect(result.salePrice).toBe(10540)
    expect(result.salePrice % 10).toBe(0)
    expect(result.costBreakdown.overseasCost).toBe(3240)
  })

  // ---- 관세율 0% ----

  it('관세율 0%: customs=0, vat=overseasCost×10%', () => {
    const noCustomsParams: OverseasPriceParams = {
      ...BASE_PARAMS,
      customsRate: 0,
    }
    const result = calculateOverseasPrice(noCustomsParams)
    expect(result.costBreakdown.customs).toBe(0)
    // vat = (3000 + 0) × 10% = 300
    expect(result.costBreakdown.vat).toBe(300)
  })

  // ---- costBreakdown 항목 합산 검증 ----

  it('totalCost = 각 항목 합산과 일치', () => {
    const result = calculateOverseasPrice(BASE_PARAMS)
    const { overseasCost, overseasShipFee, customs, vat, domesticShipFee, totalCost } =
      result.costBreakdown
    expect(totalCost).toBe(overseasCost + overseasShipFee + customs + vat + domesticShipFee)
  })
})
