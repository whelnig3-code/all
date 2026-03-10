// =============================================
// 스마트 상품 선별 테스트 (TDD — Phase B-1)
//
// 공구 소모품 니치에 맞는 상품을 자동 선별
// =============================================

import {
  isNicheProduct,
  calculateNicheScore,
  classifyNicheCategory,
  classifyProduct,
  NICHE_CATEGORIES,
  CATEGORY_GROUPS,
} from './niche-selector'

describe('NICHE_CATEGORIES', () => {
  it('22개 카테고리가 정의됨', () => {
    expect(NICHE_CATEGORIES.length).toBe(22)
  })

  it('모든 카테고리에 group 필드가 있음', () => {
    for (const cat of NICHE_CATEGORIES) {
      expect(cat.group).toBeTruthy()
      expect(CATEGORY_GROUPS).toContain(cat.group)
    }
  })

  it('10개 그룹이 정의됨', () => {
    expect(CATEGORY_GROUPS.length).toBe(10)
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

  // 신규 카테고리 테스트
  it('렌치 → "렌치/스패너"', () => {
    expect(classifyNicheCategory('토크렌치 1/2인치')).toBe('렌치/스패너')
  })

  it('드라이버 → "드라이버"', () => {
    expect(classifyNicheCategory('정밀드라이버 세트 6본')).toBe('드라이버')
  })

  it('펜치 → "펜치/플라이어"', () => {
    expect(classifyNicheCategory('롱노우즈 펜치 200mm')).toBe('펜치/플라이어')
  })

  it('배관 → "배관공구"', () => {
    expect(classifyNicheCategory('배관 파이프 피팅 세트')).toBe('배관공구')
  })

  it('전선 → "전기공구"', () => {
    expect(classifyNicheCategory('전선 2.5sq 100m')).toBe('전기공구')
  })

  it('원예가위 → "원예도구"', () => {
    expect(classifyNicheCategory('전지가위 원예 가지치기')).toBe('원예도구')
  })

  it('페인트 → "페인트/도장"', () => {
    expect(classifyNicheCategory('페인트 롤러 세트')).toBe('페인트/도장')
  })

  it('용접봉 → "용접/납땜"', () => {
    expect(classifyNicheCategory('스테인리스 용접봉 2.6mm')).toBe('용접/납땜')
  })

  it('자동차 잭 → "자동차공구"', () => {
    expect(classifyNicheCategory('유압 자동차 잭 2톤')).toBe('자동차공구')
  })

  it('글루건 → "생활공구"', () => {
    expect(classifyNicheCategory('글루건 대형 접착제')).toBe('생활공구')
  })

  it('작업등 → "조명"', () => {
    expect(classifyNicheCategory('충전식 LED 작업등')).toBe('조명')
  })

  it('고압세척 → "청소도구"', () => {
    expect(classifyNicheCategory('고압세척기 노즐')).toBe('청소도구')
  })

  it('망치 → "망치/해머"', () => {
    expect(classifyNicheCategory('고무망치 2파운드')).toBe('망치/해머')
  })
})

describe('classifyProduct (상세 분류)', () => {
  it('드릴비트 → 전동공구 소모품 그룹', () => {
    const result = classifyProduct('HSS 드릴비트 세트')
    expect(result.category).toBe('드릴비트')
    expect(result.group).toBe('전동공구 소모품')
  })

  it('렌치 → 수동공구 그룹', () => {
    const result = classifyProduct('토크렌치 1/2인치')
    expect(result.category).toBe('렌치/스패너')
    expect(result.group).toBe('수동공구')
  })

  it('전지가위 → 원예/농업 그룹', () => {
    const result = classifyProduct('전지가위 대형')
    expect(result.category).toBe('원예도구')
    expect(result.group).toBe('원예/농업')
  })

  it('알 수 없는 상품 → 기타/기타', () => {
    const result = classifyProduct('우주선 부품')
    expect(result.category).toBe('기타')
    expect(result.group).toBe('기타')
  })
})
