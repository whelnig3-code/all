import {
  MIN_MARGIN_RATE,
  MAX_MARGIN_RATE,
  MIN_SALE_PRICE,
  MAX_SALE_PRICE,
  validateMarginRate,
  validateSalePrice,
  validateWholesalePrice,
} from './guards'

describe('Safety Guards', () => {
  describe('Constants', () => {
    it('should export MIN_MARGIN_RATE as 0.10 (absolute floor, tiered-margin handles per-price-range)', () => {
      expect(MIN_MARGIN_RATE).toBe(0.10)
    })

    it('should export MAX_MARGIN_RATE as 0.80', () => {
      expect(MAX_MARGIN_RATE).toBe(0.80)
    })

    it('should export MIN_SALE_PRICE as 100', () => {
      expect(MIN_SALE_PRICE).toBe(100)
    })

    it('should export MAX_SALE_PRICE as 10,000,000', () => {
      expect(MAX_SALE_PRICE).toBe(10_000_000)
    })
  })

  describe('validateMarginRate', () => {
    it('should accept valid margin rate of 10%', () => {
      expect(() => validateMarginRate(0.10)).not.toThrow()
    })

    it('should accept valid margin rate of 50%', () => {
      expect(() => validateMarginRate(0.50)).not.toThrow()
    })

    it('should accept valid margin rate of 80%', () => {
      expect(() => validateMarginRate(0.80)).not.toThrow()
    })

    it('should accept boundary value 0.10 exactly', () => {
      expect(() => validateMarginRate(0.10)).not.toThrow()
    })

    it('should throw for rate below 10% (boundary 0.099)', () => {
      expect(() => validateMarginRate(0.099)).toThrow('마진율 안전장치')
      expect(() => validateMarginRate(0.099)).toThrow('최소 마진율 10% 미만')
    })

    it('should throw for rate of 0%', () => {
      expect(() => validateMarginRate(0)).toThrow('마진율 안전장치')
    })

    it('should throw for negative rate', () => {
      expect(() => validateMarginRate(-0.1)).toThrow('마진율 안전장치')
    })

    it('should throw for rate above 80%', () => {
      expect(() => validateMarginRate(0.81)).toThrow('80%를 초과')
    })

    it('should throw for rate of 100%', () => {
      expect(() => validateMarginRate(1.0)).toThrow('80%를 초과')
    })

    it('should include the actual rate in the error message for below minimum', () => {
      expect(() => validateMarginRate(0.05)).toThrow('5.0%')
    })

    it('should include the actual rate in the error message for above maximum', () => {
      expect(() => validateMarginRate(0.85)).toThrow('85.0%')
    })
  })

  describe('validateSalePrice', () => {
    it('should accept valid price of 1000', () => {
      expect(() => validateSalePrice(1000)).not.toThrow()
    })

    it('should accept valid price of 5000000', () => {
      expect(() => validateSalePrice(5_000_000)).not.toThrow()
    })

    it('should accept boundary value 100 (minimum)', () => {
      expect(() => validateSalePrice(100)).not.toThrow()
    })

    it('should accept boundary value 10,000,000 (maximum)', () => {
      expect(() => validateSalePrice(10_000_000)).not.toThrow()
    })

    it('should throw for non-integer price', () => {
      expect(() => validateSalePrice(99.5)).toThrow('정수여야 합니다')
    })

    it('should throw for another non-integer price', () => {
      expect(() => validateSalePrice(1000.1)).toThrow('정수여야 합니다')
    })

    it('should throw for price below 100', () => {
      expect(() => validateSalePrice(99)).toThrow('최소값')
      expect(() => validateSalePrice(99)).toThrow('미만')
    })

    it('should throw for price of 0', () => {
      expect(() => validateSalePrice(0)).toThrow('최소값')
    })

    it('should throw for negative price', () => {
      expect(() => validateSalePrice(-100)).toThrow('최소값')
    })

    it('should throw for price above 10,000,000', () => {
      expect(() => validateSalePrice(10_000_001)).toThrow('최대값')
      expect(() => validateSalePrice(10_000_001)).toThrow('초과')
    })
  })

  describe('validateWholesalePrice', () => {
    it('should accept valid price of 1000', () => {
      expect(() => validateWholesalePrice(1000)).not.toThrow()
    })

    it('should accept valid price of 0.01', () => {
      expect(() => validateWholesalePrice(0.01)).not.toThrow()
    })

    it('should throw for zero price', () => {
      expect(() => validateWholesalePrice(0)).toThrow('0보다 커야 합니다')
    })

    it('should throw for negative price', () => {
      expect(() => validateWholesalePrice(-1)).toThrow('0보다 커야 합니다')
    })

    it('should throw for large negative price', () => {
      expect(() => validateWholesalePrice(-1000)).toThrow('0보다 커야 합니다')
    })

    it('should include the actual price in the error message', () => {
      expect(() => validateWholesalePrice(-500)).toThrow('-500')
    })
  })
})
