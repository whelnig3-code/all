// =============================================
// 크롤러 베이스 클래스
//
// CLAUDE.md 핵심 경고 #4 (절대 제거 금지):
//   - robots.txt 확인 후 크롤링 진행
//   - 허용되지 않은 경로는 Error throw로 크롤링 중단
// =============================================

import { createLogger } from '@smartstore/shared'

const logger = createLogger('base-crawler')

/** 크롤링 수집 상품 최소 인터페이스 (카테고리 필터용) */
export interface CrawledProduct {
  name: string
  category: string
  sourceProductId: string
  [key: string]: unknown
}

/** 크롤링 옵션 (계정별 카테고리 필터 등) */
export interface CrawlOptions {
  accountId?: string
  /** 이 카테고리만 수집 (부분 매칭 — includes 사용) */
  allowedCategories?: string[]
}

/**
 * 크롤러 베이스 클래스
 * 모든 크롤러는 반드시 이 클래스를 상속해야 한다.
 *
 * [uniqueKey 필수 규칙]
 * 크롤러 subclass에서 Product 레코드를 DB에 저장할 때
 * 반드시 `uniqueKey = "{source}:{sourceProductId}"` 형식으로 세팅해야 한다.
 * uniqueKey가 빈 문자열이면 registration.job.ts에서 `uniqueKey_missing_blocked` 처리됨.
 * 예시: uniqueKey: `domaegguk:${product.sourceProductId}`
 */
export abstract class BaseCrawler {
  /** robots.txt 파싱 결과 캐시 (baseUrl+경로 단위, 프로세스 내 재사용) */
  private readonly robotsCache = new Map<string, boolean>()

  /**
   * 상품 고유키 생성 — DB 저장 전 반드시 호출
   * uniqueKey 포맷을 "{source}:{sourceProductId}"로 강제하여
   * 서브클래스가 잘못된 포맷으로 저장하는 실수를 방지한다.
   *
   * @param source          소싱 플랫폼 식별자 (예: 'domaegguk', 'ownerclan')
   * @param sourceProductId 플랫폼 내 상품 ID
   * @returns "{source}:{sourceProductId}" 형식의 고유키
   *
   * @example
   * const uniqueKey = this.buildProductUniqueKey('domaegguk', product.id)
   * // → 'domaegguk:123456'
   */
  protected buildProductUniqueKey(source: string, sourceProductId: string): string {
    return `${source}:${sourceProductId}`
  }

  /**
   * 카테고리 필터 — 허용 카테고리에 해당하는 상품만 반환
   * allowedCategories가 없으면 전체 통과, 빈 배열이면 전체 차단
   * 부분 매칭(includes) 사용하여 '식품'이 '건강기능식품/비타민'에도 매칭
   *
   * @param products  크롤링 수집 상품 배열
   * @param options   크롤링 옵션 (allowedCategories 포함)
   * @returns 허용 카테고리에 해당하는 상품만 필터링된 새 배열
   */
  protected filterByCategory(
    products: CrawledProduct[],
    options?: CrawlOptions,
  ): CrawledProduct[] {
    const allowed = options?.allowedCategories
    if (!allowed) return [...products]

    const matched = products.filter(p =>
      allowed.some(cat => p.category.includes(cat)),
    )

    logger.info('crawl_category_filtered', {
      total: products.length,
      matched: matched.length,
      filtered: products.length - matched.length,
      accountId: options?.accountId ?? 'unknown',
    })

    return matched
  }

  /**
   * robots.txt 확인 — 크롤링 시작 전 반드시 호출
   * 허용되지 않은 경로면 Error를 throw하여 크롤링을 중단한다.
   *
   * @param baseUrl 대상 도메인 기본 URL (예: 'https://search.shopping.naver.com')
   * @param path    크롤링 경로 (기본: '/')
   */
  protected async checkRobotsTxt(baseUrl: string, path = '/'): Promise<void> {
    const cacheKey = `${baseUrl}::${path}`

    if (this.robotsCache.has(cacheKey)) {
      const allowed = this.robotsCache.get(cacheKey)!
      if (!allowed) {
        throw new Error(`robots.txt: 크롤링 차단됨 — ${baseUrl}${path}`)
      }
      logger.debug('robots.txt 캐시 히트 (허용)', { baseUrl, path })
      return
    }

    const allowed = await this.fetchAndCheckRobots(baseUrl, path)
    this.robotsCache.set(cacheKey, allowed)

    if (!allowed) {
      throw new Error(`robots.txt: 크롤링 차단됨 — ${baseUrl}${path}`)
    }

    logger.debug('robots.txt 확인 완료 (허용)', { baseUrl, path })
  }

  /**
   * robots.txt 다운로드 및 허용 여부 판정
   * 네트워크 오류 / 404 등 실패 시 허용으로 처리 (페일-오픈 — 업무 연속성 우선)
   */
  private async fetchAndCheckRobots(baseUrl: string, path: string): Promise<boolean> {
    const robotsUrl = `${baseUrl.replace(/\/$/, '')}/robots.txt`

    try {
      const res = await fetch(robotsUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(5000), // 5초 타임아웃
      })

      if (!res.ok) {
        // 404 등 robots.txt 없음 → 허용
        logger.debug('robots.txt 없음, 허용 처리', { robotsUrl, status: res.status })
        return true
      }

      const text = await res.text()
      const allowed = this.parseRobotsTxt(text, path)
      logger.info('robots.txt 파싱 결과', { robotsUrl, path, allowed })
      return allowed
    } catch (error) {
      // 네트워크 오류 → 페일-오픈
      logger.warn('robots.txt 조회 실패, 허용으로 처리', { robotsUrl, error })
      return true
    }
  }

  /**
   * robots.txt 텍스트 파싱 — User-agent: * 블록 기준
   * Allow/Disallow 중 가장 구체적인(긴 패턴) 규칙 우선 적용
   */
  private parseRobotsTxt(text: string, path: string): boolean {
    const lines = text
      .split('\n')
      .map(l => l.split('#')[0]!.trim())
      .filter(Boolean)

    const rules: Array<{ type: 'allow' | 'disallow'; pattern: string }> = []
    let inWildcardBlock = false

    for (const line of lines) {
      const lower = line.toLowerCase()

      if (lower.startsWith('user-agent:')) {
        const agent = line.slice('user-agent:'.length).trim()
        inWildcardBlock = agent === '*'
      } else if (inWildcardBlock) {
        if (lower.startsWith('disallow:')) {
          const pattern = line.slice('disallow:'.length).trim()
          if (pattern) rules.push({ type: 'disallow', pattern })
        } else if (lower.startsWith('allow:')) {
          const pattern = line.slice('allow:'.length).trim()
          if (pattern) rules.push({ type: 'allow', pattern })
        }
      }
    }

    // 경로와 일치하는 규칙 중 가장 구체적인(긴 패턴) 우선
    const matching = rules
      .filter(r => path.startsWith(r.pattern))
      .sort((a, b) => b.pattern.length - a.pattern.length)

    if (matching.length === 0) return true // 규칙 없음 → 허용
    return matching[0]!.type === 'allow'
  }
}
