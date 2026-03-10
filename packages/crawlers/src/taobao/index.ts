// =============================================
// 타오바오 크롤러 (Playwright 기반)
//
// 준수 사항 (CLAUDE.md 핵심 경고 #4):
//   - BaseCrawler.checkRobotsTxt() 호출 필수
//   - 요청 간 4~8초 랜덤 지연
//   - 쿠키 기반 세션 필수
// =============================================

export { TaobaoCrawler } from './crawler'
export type { TaobaoProduct, TaobaoCrawlerOptions } from './types'
