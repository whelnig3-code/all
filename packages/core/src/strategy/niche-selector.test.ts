// =============================================
// 스마트 상품 선별 테스트 (TDD — Phase B-1)
//
// 공구 소모품 니치에 맞는 상품을 자동 선별
// =============================================

import {
  isNicheProduct,
  calculateNicheScore,
  classifyNicheCategory,
  NICHE_CATEGORIES,
} from './niche-selector'

describe('NICHE_CATEGORIES', () => {
  it('공구 소모품 카테고리가 정의됨', () => {
    expect(NICHE_CATEGORIES.length).toBeGreaterThan(0)
    expect(NICHE_CATEGORIES.some((c) => c.keywords.includes('드릴비트'))).toBe(true)
  })
})

describe('isNicheProduct', () => {
  it('드릴비트 → 니치 상품', () => {
    expect(isNicheProduct('HSS 드릴비트 세트 13본')).toBe(true)
  })

  it('그라인더 디스크 → 니치 상품', () => {
    expect(isNicheProduct('4인치 절단석 10매')).toBe(true)
  })

  it('샌딩페이퍼 → 니치 상품', () => {
    expect(isNicheProduct('사포 #120 10매')).toBe(true)
  })

  it('줄자 → 니치 상품 (측정)', () => {
    expect(isNicheProduct('줄자 5m 스틸')).toBe(true)
  })

  it('안전장갑 → 니치 상품', () => {
    expect(isNicheProduct('작업장갑 코팅 10켤레')).toBe(true)
  })

  it('캠핑 텐트 → 니치 아님', () => {
    expect(isNicheProduct('캠핑 텐트 4인용')).toBe(false)
  })

  it('USB 케이블 → 니치 아님', () => {
    expect(isNicheProduct('USB C타입 고속충전 케이블')).toBe(false)
  })

  it('원피스 → 니치 아님', () => {
    expect(isNicheProduct('여성 원피스 플라워 패턴')).toBe(false)
  })
})

describe('calculateNicheScore', () => {
  it('드릴비트 + 저가(세트) → 높은 점수', () => {
    const score = calculateNicheScore({
      productName: 'HSS 드릴비트 13본 세트',
      wholesalePrice: 5000,
      category: '공구/철물',
    })
    expect(score).toBeGreaterThan(60)
  })

  it('알 수 없는 제품 → 0점', () => {
    const score = calculateNicheScore({
      productName: '우주선 부품',
      wholesalePrice: 5000,
      category: '기타',
    })
    expect(score).toBe(0)
  })

  it('소모품(세트/개입) → 가산점', () => {
    const scoreSet = calculateNicheScore({
      productName: '절단석 10매입',
      wholesalePrice: 3000,
      category: '공구',
    })
    const scoreSingle = calculateNicheScore({
      productName: '절단석',
      wholesalePrice: 3000,
      category: '공구',
    })
    expect(scoreSet).toBeGreaterThan(scoreSingle)
  })

  it('적정 가격대(3,000~30,000원) → 가산점', () => {
    const scoreGood = calculateNicheScore({
      productName: '드릴비트',
      wholesalePrice: 8000,
      category: '공구',
    })
    const scoreTooExpensive = calculateNicheScore({
      productName: '드릴비트',
      wholesalePrice: 80000,
      category: '공구',
    })
    expect(scoreGood).toBeGreaterThan(scoreTooExpensive)
  })

  it('스펙 키워드 포함 → 가산점', () => {
    const withSpec = calculateNicheScore({
      productName: 'HSS 드릴비트 6mm 코발트',
      wholesalePrice: 5000,
      category: '공구',
    })
    const noSpec = calculateNicheScore({
      productName: '드릴비트',
      wholesalePrice: 5000,
      category: '공구',
    })
    expect(withSpec).toBeGreaterThan(noSpec)
  })
})

describe('classifyNicheCategory', () => {
  it('드릴비트 상품 → "드릴비트" 카테고리', () => {
    expect(classifyNicheCategory('HSS 드릴비트 세트 13본')).toBe('드릴비트')
  })

  it('절단석 → "그라인더 디스크" 카테고리', () => {
    expect(classifyNicheCategory('4인치 절단석 10매')).toBe('그라인더 디스크')
  })

  it('톱날 → "절단날" 카테고리', () => {
    expect(classifyNicheCategory('원형톱날 185mm 40T')).toBe('절단날')
  })

  it('사포 → "샌딩/연마" 카테고리', () => {
    expect(classifyNicheCategory('사포 #120 10매')).toBe('샌딩/연마')
  })

  it('충전배터리 → "충전배터리" 카테고리', () => {
    expect(classifyNicheCategory('마끼다 호환배터리 18V')).toBe('충전배터리')
  })

  it('줄자 → "측정도구" 카테고리', () => {
    expect(classifyNicheCategory('줄자 5m 스틸')).toBe('측정도구')
  })

  it('작업장갑 → "안전장비" 카테고리', () => {
    expect(classifyNicheCategory('작업장갑 코팅 10켤레')).toBe('안전장비')
  })

  it('공구함 → "공구함/정리" 카테고리', () => {
    expect(classifyNicheCategory('공구함 3단 접이식')).toBe('공구함/정리')
  })

  it('니치 아닌 상품 → "기타" 카테고리', () => {
    expect(classifyNicheCategory('캠핑 텐트 4인용')).toBe('기타')
  })

  it('빈 문자열 → "기타"', () => {
    expect(classifyNicheCategory('')).toBe('기타')
  })
})
