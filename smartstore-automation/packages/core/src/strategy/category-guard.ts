// =============================================
// 계정별 허용 카테고리 가드
// accountId마다 등록 가능한 카테고리를 제한하여
// 계정 운영 목적에 맞지 않는 상품 등록을 사전 차단
// =============================================

/**
 * 계정별 허용 카테고리 맵 (1차 하드코딩)
 *
 * key   : accountId (ENV ACCOUNT_ID 값)
 * value : 해당 계정에서 등록 허용된 카테고리명 배열
 *
 * accountId가 맵에 존재하지 않으면 'default' 규칙을 적용
 */
const ACCOUNT_CATEGORY_MAP: Record<string, string[]> = {
  // 모든 주요 카테고리 허용 (미지정 계정 fallback)
  default: [
    '패션의류', '패션잡화', '뷰티',
    '생활/건강', '식품',
    '스포츠/레저', '가구/인테리어',
    '디지털/가전', '도서/음반',
    '완구/취미', '문구/오피스',
  ],

  // 패션 전문 계정
  account1: ['패션의류', '패션잡화', '뷰티'],

  // 생활/식품 전문 계정
  account2: ['생활/건강', '식품', '가구/인테리어'],

  // IT·전자 전문 계정
  account3: ['디지털/가전', '문구/오피스'],

  // 레저·취미 전문 계정
  account4: ['스포츠/레저', '완구/취미'],
}

/**
 * 해당 계정에서 카테고리 등록이 허용되는지 검사
 *
 * @param accountId 운영 계정 ID (ENV ACCOUNT_ID)
 * @param category  상품 카테고리명 (Product.category)
 * @returns true: 등록 허용 / false: 차단
 */
/**
 * 계정에 허용된 카테고리 목록 반환
 * 크롤링 단계에서 수집 대상 카테고리를 제한하는 데 사용
 *
 * @param accountId 운영 계정 ID
 * @returns 허용 카테고리명 배열
 */
export function getAllowedCategories(accountId: string): string[] {
  return ACCOUNT_CATEGORY_MAP[accountId] ?? ACCOUNT_CATEGORY_MAP['default']!
}

export function isCategoryAllowed(accountId: string, category: string): boolean {
  // 맵에 없는 accountId는 default 규칙으로 fallback
  const allowedCategories =
    ACCOUNT_CATEGORY_MAP[accountId] ?? ACCOUNT_CATEGORY_MAP['default']!
  return allowedCategories.includes(category)
}

// =============================================
// 셀러 유형별 카테고리 가드
// 사업자 등록이 필수인 카테고리를 개인 셀러가 등록하지 못하도록 차단
// =============================================

/** 사업자 등록 필수 카테고리 (개인 셀러 등록 불가) */
const BUSINESS_ONLY_CATEGORIES = [
  '건강기능식품',
  '의료기기',
  '주류',
  '의약외품',
  '화장품/향수',
  '반려동물/의약품',
] as const

export type SellerType = 'individual' | 'business'

/**
 * 셀러 유형에 따라 카테고리 등록이 허용되는지 검사
 *
 * - 사업자(business): 모든 카테고리 허용
 * - 개인(individual): 사업자 전용 카테고리 차단 (부분 매칭)
 *
 * @param category   상품 카테고리명
 * @param sellerType 셀러 유형 ('individual' | 'business')
 * @returns true: 등록 허용 / false: 차단
 */
export function isCategoryAllowedForSellerType(
  category: string,
  sellerType: SellerType,
): boolean {
  if (sellerType === 'business') return true
  return !BUSINESS_ONLY_CATEGORIES.some((bc) => category.includes(bc))
}
