/** 크롤링 수집 상품 최소 인터페이스 (카테고리 필터용) */
export interface CrawledProduct {
    name: string;
    category: string;
    sourceProductId: string;
    [key: string]: unknown;
}
/** 크롤링 옵션 (계정별 카테고리 필터 등) */
export interface CrawlOptions {
    accountId?: string;
    /** 이 카테고리만 수집 (부분 매칭 — includes 사용) */
    allowedCategories?: string[];
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
export declare abstract class BaseCrawler {
    /** robots.txt 파싱 결과 캐시 (baseUrl+경로 단위, 프로세스 내 재사용) */
    private readonly robotsCache;
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
    protected buildProductUniqueKey(source: string, sourceProductId: string): string;
    /**
     * 카테고리 필터 — 허용 카테고리에 해당하는 상품만 반환
     * allowedCategories가 없으면 전체 통과, 빈 배열이면 전체 차단
     * 부분 매칭(includes) 사용하여 '식품'이 '건강기능식품/비타민'에도 매칭
     *
     * @param products  크롤링 수집 상품 배열
     * @param options   크롤링 옵션 (allowedCategories 포함)
     * @returns 허용 카테고리에 해당하는 상품만 필터링된 새 배열
     */
    protected filterByCategory(products: CrawledProduct[], options?: CrawlOptions): CrawledProduct[];
    /**
     * robots.txt 확인 — 크롤링 시작 전 반드시 호출
     * 허용되지 않은 경로면 Error를 throw하여 크롤링을 중단한다.
     *
     * @param baseUrl 대상 도메인 기본 URL (예: 'https://search.shopping.naver.com')
     * @param path    크롤링 경로 (기본: '/')
     */
    protected checkRobotsTxt(baseUrl: string, path?: string): Promise<void>;
    /**
     * robots.txt 다운로드 및 허용 여부 판정
     * 네트워크 오류 / 404 등 실패 시 허용으로 처리 (페일-오픈 — 업무 연속성 우선)
     */
    private fetchAndCheckRobots;
    /**
     * robots.txt 텍스트 파싱 — User-agent: * 블록 기준
     * Allow/Disallow 중 가장 구체적인(긴 패턴) 규칙 우선 적용
     */
    private parseRobotsTxt;
}
//# sourceMappingURL=base-crawler.d.ts.map