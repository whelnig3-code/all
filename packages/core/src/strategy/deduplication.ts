// =============================================
// 상품 중복 등록 차단 유틸리티
// 계정 간 동일 도매 상품의 중복 등록을 막기 위한 고유 키 생성
// =============================================

/**
 * 공급처 기반 상품 고유 키 생성
 * 계정(accountId)에 무관하게 전역 중복 차단에 사용
 *
 * @param source          공급처 코드 ('domaegguk' | 'ownerclan' | ...)
 * @param sourceProductId 공급처 상품 ID
 * @returns "{source}:{sourceProductId}" 형태의 고유 키
 */
export function buildProductUniqueKey(
  source: string,
  sourceProductId: string
): string {
  return `${source}:${sourceProductId}`
}

/**
 * uniqueKey 존재 여부 강제 검사
 * 비어있거나 공백이면 Error를 throw하여 저장/등록을 차단한다.
 *
 * 호출 위치:
 *   - 크롤러: Product DB 저장 직전 (base-crawler.ts 가이드 참고)
 *   - 워커: registration.job.ts 등록 직전 (2차 방어선)
 *
 * @param uniqueKey 검사할 고유 키
 * @throws Error uniqueKey가 빈 문자열/공백/null/undefined이면
 */
export function assertProductUniqueKey(uniqueKey: string | null | undefined): void {
  if (!uniqueKey || uniqueKey.trim() === '') {
    throw new Error('uniqueKey is required before saving Product')
  }
}
