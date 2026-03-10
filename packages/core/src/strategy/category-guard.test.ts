// =============================================
// 계정별 허용 카테고리 가드 단위 테스트
// isCategoryAllowed
// =============================================

import { isCategoryAllowed, isCategoryAllowedForSellerType, getAllowedCategories } from './category-guard'

describe('isCategoryAllowed', () => {
  describe('허용 카테고리 통과', () => {
    it('account1 — 허용 카테고리(패션의류) → true', () => {
      expect(isCategoryAllowed('account1', '패션의류')).toBe(true)
    })

    it('account1 — 허용 카테고리(뷰티) → true', () => {
      expect(isCategoryAllowed('account1', '뷰티')).toBe(true)
    })

    it('account2 — 허용 카테고리(식품) → true', () => {
      expect(isCategoryAllowed('account2', '식품')).toBe(true)
    })

    it('account3 — 허용 카테고리(디지털/가전) → true', () => {
      expect(isCategoryAllowed('account3', '디지털/가전')).toBe(true)
    })

    it('account4 — 허용 카테고리(스포츠/레저) → true', () => {
      expect(isCategoryAllowed('account4', '스포츠/레저')).toBe(true)
    })

    it('default — 광범위 허용(생활/건강) → true', () => {
      expect(isCategoryAllowed('default', '생활/건강')).toBe(true)
    })
  })

  describe('미허용 카테고리 차단', () => {
    it('account1(패션 전용) — 디지털/가전 → false', () => {
      expect(isCategoryAllowed('account1', '디지털/가전')).toBe(false)
    })

    it('account1(패션 전용) — 식품 → false', () => {
      expect(isCategoryAllowed('account1', '식품')).toBe(false)
    })

    it('account2(생활/식품 전용) — 패션의류 → false', () => {
      expect(isCategoryAllowed('account2', '패션의류')).toBe(false)
    })

    it('account3(IT 전용) — 스포츠/레저 → false', () => {
      expect(isCategoryAllowed('account3', '스포츠/레저')).toBe(false)
    })

    it('account4(레저 전용) — 뷰티 → false', () => {
      expect(isCategoryAllowed('account4', '뷰티')).toBe(false)
    })

    it('default — 존재하지 않는 카테고리 → false', () => {
      expect(isCategoryAllowed('default', '존재하지않는카테고리')).toBe(false)
    })
  })

  describe('미등록 accountId → default fallback', () => {
    it('알 수 없는 accountId — default 허용 카테고리(패션의류) → true', () => {
      expect(isCategoryAllowed('unknown-account', '패션의류')).toBe(true)
    })

    it('알 수 없는 accountId — default 허용 카테고리(도서/음반) → true', () => {
      expect(isCategoryAllowed('unknown-account', '도서/음반')).toBe(true)
    })

    it('알 수 없는 accountId — 맵에 없는 카테고리 → false', () => {
      expect(isCategoryAllowed('unknown-account', '존재하지않는카테고리')).toBe(false)
    })
  })
})

// =============================================
// 셀러 유형별 카테고리 가드 테스트
// isCategoryAllowedForSellerType
// =============================================

describe('isCategoryAllowedForSellerType', () => {
  describe('개인 판매자 — 사업자 전용 카테고리 차단', () => {
    it('개인 + 건강기능식품 → false', () => {
      expect(isCategoryAllowedForSellerType('건강기능식품', 'individual')).toBe(false)
    })

    it('개인 + 의료기기 → false', () => {
      expect(isCategoryAllowedForSellerType('의료기기', 'individual')).toBe(false)
    })

    it('개인 + 주류 → false', () => {
      expect(isCategoryAllowedForSellerType('주류', 'individual')).toBe(false)
    })

    it('개인 + 의약외품 → false', () => {
      expect(isCategoryAllowedForSellerType('의약외품', 'individual')).toBe(false)
    })

    it('개인 + 부분 매칭(건강기능식품 포함 카테고리명) → false', () => {
      expect(isCategoryAllowedForSellerType('건강기능식품/비타민', 'individual')).toBe(false)
    })
  })

  describe('개인 판매자 — 일반 카테고리 허용', () => {
    it('개인 + 패션의류 → true', () => {
      expect(isCategoryAllowedForSellerType('패션의류', 'individual')).toBe(true)
    })

    it('개인 + 디지털/가전 → true', () => {
      expect(isCategoryAllowedForSellerType('디지털/가전', 'individual')).toBe(true)
    })

    it('개인 + 생활/건강 → true', () => {
      expect(isCategoryAllowedForSellerType('생활/건강', 'individual')).toBe(true)
    })

    it('개인 + 식품 → true', () => {
      expect(isCategoryAllowedForSellerType('식품', 'individual')).toBe(true)
    })
  })

  describe('사업자 판매자 — 모든 카테고리 허용', () => {
    it('사업자 + 건강기능식품 → true', () => {
      expect(isCategoryAllowedForSellerType('건강기능식품', 'business')).toBe(true)
    })

    it('사업자 + 의료기기 → true', () => {
      expect(isCategoryAllowedForSellerType('의료기기', 'business')).toBe(true)
    })

    it('사업자 + 주류 → true', () => {
      expect(isCategoryAllowedForSellerType('주류', 'business')).toBe(true)
    })

    it('사업자 + 패션의류 → true', () => {
      expect(isCategoryAllowedForSellerType('패션의류', 'business')).toBe(true)
    })
  })
})

// =============================================
// 계정별 허용 카테고리 목록 조회
// getAllowedCategories
// =============================================

describe('getAllowedCategories', () => {
  it('account1 → 패션 전문 3개 카테고리', () => {
    const categories = getAllowedCategories('account1')
    expect(categories).toEqual(['패션의류', '패션잡화', '뷰티'])
  })

  it('account2 → 생활/식품 전문 3개 카테고리', () => {
    const categories = getAllowedCategories('account2')
    expect(categories).toEqual(['생활/건강', '식품', '가구/인테리어'])
  })

  it('account3 → IT 전문 2개 카테고리', () => {
    const categories = getAllowedCategories('account3')
    expect(categories).toEqual(['디지털/가전', '문구/오피스'])
  })

  it('account4 → 레저 전문 2개 카테고리', () => {
    const categories = getAllowedCategories('account4')
    expect(categories).toEqual(['스포츠/레저', '완구/취미'])
  })

  it('default → 전체 11개 카테고리', () => {
    const categories = getAllowedCategories('default')
    expect(categories).toHaveLength(11)
    expect(categories).toContain('패션의류')
    expect(categories).toContain('식품')
    expect(categories).toContain('디지털/가전')
  })

  it('미등록 accountId → default fallback', () => {
    const categories = getAllowedCategories('unknown-account')
    expect(categories).toHaveLength(11)
  })

  it('반환된 배열은 원본과 같은 참조 (불변성은 호출자 책임)', () => {
    const a = getAllowedCategories('account1')
    const b = getAllowedCategories('account1')
    expect(a).toBe(b) // 같은 배열 참조
  })
})
