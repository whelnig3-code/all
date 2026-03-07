/**
 * routing-rules.ts — 라우팅 규칙 테이블 및 매칭 엔진
 *
 * 비유: 우체국의 분류표. 편지(메시지)의 키워드를 보고 담당 부서(에이전트)로 분류합니다.
 */

import type { AgentId } from "../types";
import type { RoutingRule, GateRule } from "./routing-types";
import { loadCustomRules, type CustomRoutingRule } from "./custom-routing-rules";

// ─── 라우팅 규칙 테이블 ───────────────────────────────────────────────────────
// priority 숫자가 낮을수록 먼저 평가됩니다.

const ROUTING_RULES: RoutingRule[] = [
  {
    id: "approval",
    priority: 0,
    agent: "developer",
    keywords: [],
    startsWith: ["승인", "진행", "ㄱㄱ", "ok", "고고", "시작해"],
    compoundCondition: (lower) =>
      lower.includes("승인") &&
      (lower.includes("구현") || lower.includes("시작")),
    description: "승인/구현 시작 신호 → developer 직행",
  },
  {
    id: "phase-task",
    priority: 1,
    agent: "planner",
    keywords: [],
    patterns: [/phase\s*\d/i, /페이즈\s*\d/],
    description: "Phase N 단계적 작업 → planner",
  },
  {
    id: "planning",
    priority: 2,
    agent: "planner",
    keywords: ["설계해", "기획해", "계획해", "아키텍처", "로드맵", "구조 설계"],
    patterns: [/\bplan\b/i],
    excludeKeywords: ["구현", "개발해", "만들어", "코딩", "작성해"],
    description: "기획/설계 요청 (구현 키워드 없음) → planner",
  },
  {
    id: "security",
    priority: 3,
    agent: "security-auditor",
    keywords: ["보안", "취약", "security", "취약점", "감사", "owasp"],
    description: "보안/취약점 관련 → security-auditor",
  },
  {
    id: "review",
    priority: 4,
    agent: "reviewer",
    keywords: ["리뷰", "검토", "review", "코드 리뷰", "코드리뷰"],
    description: "리뷰/검토 요청 → reviewer",
  },
  {
    id: "research",
    priority: 5,
    agent: "researcher",
    keywords: ["조사", "리서치", "research", "찾아봐", "검색해"],
    description: "조사/리서치 → researcher",
  },
  {
    id: "design",
    priority: 6,
    agent: "designer",
    keywords: ["디자인", "와이어프레임", "design", "wireframe", "ui 설계", "ux"],
    description: "디자인/와이어프레임 → designer",
  },
  {
    id: "bugfix",
    priority: 7,
    agent: "developer",
    keywords: [
      "버그", "오류", "에러", "고쳐", "fix",
      "안돼", "안되", "실패", "오작동",
    ],
    description: "버그/오류 수정 → developer",
  },
  {
    id: "docs",
    priority: 8,
    agent: "writer",
    keywords: ["readme", "문서화", "changelog", "문서 작성"],
    description: "문서 작업 → writer",
  },
  {
    id: "new-feature",
    priority: 9,
    agent: "planner",
    keywords: ["자동화 시스템", "새 기능", "새로운 기능", "시스템 설계", "플랫폼"],
    compoundCondition: (lower) =>
      /\d+\.\s/.test(lower) && lower.includes("기획"),
    description: "신규 기능/시스템 기획 → planner",
  },
];

// 우선순위 오름차순 정렬 (모듈 로드 시 1회)
export const SORTED_ROUTING_RULES = [...ROUTING_RULES].sort((a, b) => a.priority - b.priority);

/** 기본 라우팅 규칙 목록 반환 (API 조회용) — 직렬화 가능한 필드만 포함 */
export function getDefaultRoutingRules() {
  return ROUTING_RULES.map((r) => ({
    id: r.id,
    priority: r.priority,
    agent: r.agent,
    keywords: r.keywords,
    description: r.description,
  }));
}

// ─── 강제 게이트 규칙 ─────────────────────────────────────────────────────────

export const GATE_RULES: GateRule[] = [
  {
    id: "analysis-not-developer",
    intentKeywords: [
      "분析", "분석", "진단", "상태 점검", "전체 진단",
      "실행 가능 상태", "개발 상태", "진단해", "분析해",
      "상태 확인", "빌드 상태", "실행 상태", "점검해",
    ],
    blockedAgent: "developer",
    suggestedAgent: "reviewer",
    reason: "분析/진단 요청은 리뷰어가 적합합니다",
  },
  {
    id: "security-not-developer",
    intentKeywords: [
      "보안 감사", "취약점 분析", "owasp", "인증 검토",
      "보안 점검", "보안 분析", "취약점 진단",
    ],
    blockedAgent: "developer",
    suggestedAgent: "security-auditor",
    reason: "보안 감사/분析은 보안 감사자가 적합합니다",
  },
  {
    id: "design-not-developer",
    intentKeywords: [
      "ui 설계", "레이아웃 설계", "와이어프레임 설계",
      "화면 설계", "ux 설계",
    ],
    blockedAgent: "developer",
    suggestedAgent: "designer",
    reason: "UI/화면 설계는 디자이너가 적합합니다",
  },
];

// ─── 커스텀 규칙 캐시 (런타임 동적 로드) ───────────────────────────────────────

let _customRulesCache: RoutingRule[] = [];
let _customRulesLastLoad = 0;
const CUSTOM_RULES_TTL = 10_000; // 10초 캐시

async function getCustomRoutingRules(): Promise<RoutingRule[]> {
  const now = Date.now();
  if (now - _customRulesLastLoad < CUSTOM_RULES_TTL && _customRulesCache.length >= 0) {
    return _customRulesCache;
  }
  try {
    const raw = await loadCustomRules();
    _customRulesCache = raw.map((r: CustomRoutingRule) => ({
      id: r.id,
      priority: r.priority,
      agent: r.agent as AgentId,
      keywords: r.keywords,
      description: r.description,
    }));
    _customRulesLastLoad = now;
  } catch {
    // 로드 실패 시 기존 캐시 유지
  }
  return _customRulesCache;
}

/** 커스텀 규칙 캐시 강제 갱신 (규칙 CRUD 후 호출) */
export function invalidateCustomRulesCache(): void {
  _customRulesLastLoad = 0;
}

/** 현재 캐시된 커스텀 규칙 (동기적 접근용) */
export function getCachedCustomRules(): RoutingRule[] {
  return _customRulesCache;
}

// 서버 시작 시 캐시 프리로드
if (typeof window === "undefined") {
  getCustomRoutingRules().catch(() => {});
}

// ─── 규칙 매칭 엔진 ──────────────────────────────────────────────────────────

/**
 * 단일 RoutingRule에 대해 메시지 매칭 여부를 판단합니다.
 * @returns 매칭된 키워드/패턴 배열, 매칭 없으면 null
 */
export function matchRule(rule: RoutingRule, lower: string): string[] | null {
  if (rule.excludeKeywords?.some((k) => lower.includes(k))) {
    return null;
  }

  const matched: string[] = [];

  if (rule.startsWith) {
    for (const sw of rule.startsWith) {
      if (lower.startsWith(sw.toLowerCase())) {
        matched.push(sw);
      }
    }
  }

  for (const kw of rule.keywords) {
    if (lower.includes(kw)) {
      matched.push(kw);
    }
  }

  if (rule.patterns) {
    for (const pat of rule.patterns) {
      if (pat.test(lower)) {
        matched.push(`pattern:${pat.source}`);
      }
    }
  }

  if (rule.compoundCondition?.(lower)) {
    matched.push("(복합조건)");
  }

  return matched.length > 0 ? matched : null;
}
