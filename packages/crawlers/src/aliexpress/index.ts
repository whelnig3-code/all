// =============================================
// AliExpress 크롤러 (Playwright 기반)
//
// 준수 사항 (CLAUDE.md 핵심 경고 #4):
//   - BaseCrawler.checkRobotsTxt() 호출 필수
//   - 요청 간 3~7초 랜덤 지연
//   - SOURCING_ALIEXPRESS_ENABLED 환경변수 확인 필수
// =============================================

export { AliexpressCrawler } from './crawler'
export { AliexpressProduct, AliexpressCrawlerOptions } from './types'
