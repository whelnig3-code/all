import { BaseCrawler } from './base-crawler';
/** 경쟁사 가격 항목 */
export interface CompetitorPrice {
    sellerName: string;
    price: number;
    rank: number;
}
/**
 * 상위 20개 상품 분석 결과 (노출 가능성 점수 입력용)
 * calculateExposureScore(ExposureScoreInput) 와 1:1 매핑
 */
export interface Top20ProductsResult {
    /** 광고 상품 수 (상위 20개 중) */
    adCount: number;
    /** 상위 상품 평균 리뷰 수 */
    avgReview: number;
    /** 상위 10개 중 브랜드 상품 수 (0~10) */
    brandCountTop10: number;
    /** 상위 상품 평균 가격 (원, 0이면 데이터 없음) */
    avgTopPrice: number;
}
/** 크롤러 옵션 */
interface CrawlerOptions {
    /** 브라우저 헤드리스 모드 (기본 true) */
    headless?: boolean;
    /** 최대 추출 결과 수 (기본 5) */
    maxResults?: number;
    /** 요청 최소 지연 ms (기본 2000) */
    minDelayMs?: number;
    /** 요청 최대 지연 ms (기본 5000) */
    maxDelayMs?: number;
}
/**
 * 네이버 쇼핑 경쟁가 크롤러
 * BaseCrawler를 상속하여 robots.txt 체크 보장
 *
 * @example
 * const crawler = new NaverShoppingCrawler()
 * const prices = await crawler.fetchCompetitorPrices('무선 이어폰')
 * await crawler.close()
 */
export declare class NaverShoppingCrawler extends BaseCrawler {
    private browser;
    private readonly options;
    constructor(options?: CrawlerOptions);
    /**
     * 브라우저 초기화 (lazy — 첫 크롤링 시 자동 실행)
     */
    private ensureBrowser;
    /**
     * 2~5초 사이 랜덤 지연 (서버 부하 방지)
     */
    private randomDelay;
    /**
     * 네이버 쇼핑에서 경쟁사 가격 검색
     * robots.txt 확인 후 크롤링 진행 (BaseCrawler.checkRobotsTxt 호출)
     *
     * @param productName 검색할 상품명
     * @param maxResults  최대 결과 수 (기본: 옵션 설정값)
     * @returns 경쟁사 가격 목록 (rank 오름차순)
     */
    fetchCompetitorPrices(productName: string, maxResults?: number): Promise<CompetitorPrice[]>;
    /**
     * 네이버 쇼핑 상위 20개 상품 분석 (노출 가능성 점수용)
     *
     * 수집 항목:
     *   - adCount       : 상위 20개 중 광고 상품 수
     *   - avgReview     : 상위 상품 평균 리뷰 수
     *   - brandCountTop10 : 상위 10개 중 브랜드 상품 수
     *   - avgTopPrice   : 상위 상품 평균 가격
     *
     * 오류 발생 시 fail-safe: { adCount: 0, avgReview: 0, brandCountTop10: 0, avgTopPrice: 0 }
     * (점수 계산 시 중립/최적값으로 처리 → 등록 허용 쪽으로 기울어짐)
     *
     * @param keyword 검색 키워드 (상품명)
     * @returns Top20ProductsResult
     */
    fetchTop20Products(keyword: string): Promise<Top20ProductsResult>;
    /**
     * 브라우저 종료 (워커 종료 시 호출)
     * 중복 호출 안전 (idempotent) — browser가 null이면 아무 동작도 하지 않는다.
     */
    close(): Promise<void>;
}
/** 싱글톤 인스턴스 (워커 프로세스당 1개 재사용) */
export declare const naverShoppingCrawler: NaverShoppingCrawler;
export {};
//# sourceMappingURL=naver-shopping.d.ts.map