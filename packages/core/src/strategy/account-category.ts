// =============================================
// 계정별 카테고리 전략 — "각 매장의 취급 코너"
//
// 비유: 백화점 층별 매장 배치.
// 1층(account1)은 전동공구·수동공구만 진열,
// 2층(account2)은 생활도구·원예만 진열.
// 물건이 들어오면 해당 층 매장 코너에 맞는지 확인 후 진열한다.
// 코너에 없는 물건은 거부한다.
//
// 빈 배열([]) = 전 층 자유 진열 (제한 없음)
// =============================================

import { classifyProduct, type CategoryGroup } from './niche-selector'

export interface AccountCategoryResult {
  readonly allowed: boolean
  readonly category: string
  readonly group: string
  readonly reason?: string
}

/**
 * 계정별 허용 카테고리 그룹 맵
 * 빈 배열 = 제한 없음 (모든 카테고리 허용)
 */
export const ACCOUNT_CATEGORY_MAP: Record<string, readonly CategoryGroup[]> = {
  // 전동공구 + 수동공구 전문점
  account1: ['전동공구 소모품', '수동공구', '측정/안전'],

  // 생활도구 + 원예 전문점
  account2: ['생활도구', '원예/농업', '페인트/도장'],

  // 배관 + 전기 전문점
  account3: ['배관/설비', '전기/조명', '용접/납땜'],

  // 자동차 + 전동공구 전문점
  account4: ['자동차/정비', '전동공구 소모품', '측정/안전'],
}

/**
 * 계정 ID에 맞는 허용 카테고리 그룹 반환
 * 미등록 / default → 빈 배열 (제한 없음)
 */
export function getAccountCategories(accountId: string): readonly CategoryGroup[] {
  return ACCOUNT_CATEGORY_MAP[accountId] ?? []
}

/**
 * 상품이 해당 계정의 카테고리에 맞는지 판별
 *
 * 규칙:
 *   1. 계정에 카테고리 제한이 없으면 (빈 배열) → 항상 허용
 *   2. 상품이 '기타' 카테고리 → 허용 (분류 불가 상품은 통과)
 *   3. 상품 카테고리 그룹이 계정 허용 목록에 있으면 → 허용
 *   4. 그 외 → 거부
 */
export function isProductAllowedForAccount(input: {
  readonly accountId: string
  readonly productName: string
}): AccountCategoryResult {
  const { accountId, productName } = input
  const { category, group } = classifyProduct(productName)

  const allowedGroups = getAccountCategories(accountId)

  // 제한 없음
  if (allowedGroups.length === 0) {
    return { allowed: true, category, group }
  }

  // 분류 불가 상품은 통과
  if (category === '기타') {
    return { allowed: true, category, group }
  }

  // 허용 목록 확인
  if (allowedGroups.includes(group as CategoryGroup)) {
    return { allowed: true, category, group }
  }

  return {
    allowed: false,
    category,
    group,
    reason: `카테고리 그룹 '${group}'은(는) 계정 '${accountId}'에서 허용되지 않습니다`,
  }
}

/**
 * 런타임에 계정 카테고리 설정 변경
 * (추후 DB 기반으로 전환 예정)
 */
export function setAccountCategories(
  accountId: string,
  groups: readonly CategoryGroup[],
): void {
  ;(ACCOUNT_CATEGORY_MAP as Record<string, readonly CategoryGroup[]>)[accountId] = groups
}
