/**
 * responsive-breakpoints.ts — 반응형 브레이크포인트 분류
 *
 * 비유: 극장 좌석 배치처럼, 화면 너비에 따라 레이아웃 구성을 바꾼다.
 * mobile(스마트폰) → tablet(태블릿) → desktop(노트북) → wide(모니터) → ultraWide(21:9)
 */

export type BreakpointName = "mobile" | "tablet" | "desktop" | "wide" | "ultraWide";

/** 화면 너비를 브레이크포인트 이름으로 분류 */
export function classifyBreakpoint(width: number): BreakpointName {
  if (width < 768) return "mobile";
  if (width < 900) return "tablet";
  if (width < 1500) return "desktop";
  if (width < 2200) return "wide";
  return "ultraWide";
}

/** 브레이크포인트별 설정값 */
export function getBreakpointConfig(bp: BreakpointName) {
  switch (bp) {
    case "mobile":
      return { showSidebar: false, showRightPanel: false, sidebarWidth: 0, rightPanelWidth: 0 };
    case "tablet":
      return { showSidebar: true, showRightPanel: false, sidebarWidth: 52, rightPanelWidth: 0 };
    case "desktop":
      return { showSidebar: true, showRightPanel: true, sidebarWidth: 220, rightPanelWidth: 280 };
    case "wide":
      return { showSidebar: true, showRightPanel: true, sidebarWidth: 220, rightPanelWidth: 360 };
    case "ultraWide":
      return { showSidebar: true, showRightPanel: true, sidebarWidth: 220, rightPanelWidth: 520 };
  }
}
