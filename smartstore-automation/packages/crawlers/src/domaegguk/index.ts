// =============================================
// 도매꾹 크롤러 (Playwright 기반)
//
// 준수 사항 (CLAUDE.md 핵심 경고 #4):
//   - BaseCrawler.checkRobotsTxt() 호출 필수
//   - 요청 간 2~5초 랜덤 지연
// =============================================

export { DomaeggukCrawler } from './crawler'
export type { DomaeggukProduct, DomaeggukCrawlerOptions } from './types'
