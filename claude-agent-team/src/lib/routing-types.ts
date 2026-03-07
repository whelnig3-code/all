/**
 * routing-types.ts — 라우팅 엔진 공유 타입 및 팩토리 함수
 *
 * 비유: 건물의 설계도(blueprint). 모든 레이어가 동일한 설계도를 참조합니다.
 */

import type { AgentId } from "../types";

// ─── 공개 의도 분류 타입 ─────────────────────────────────────────────────────

/** 메시지 의도 카테고리 (11종) */
export type MessageIntent =
  | "greeting"
  | "question"
  | "code_request"
  | "bug_report"
  | "review_request"
  | "planning"
  | "research"
  | "docs"
  | "security"
  | "design"
  | "general";

/** 의도 분류 결과: 에이전트 + 프롬프트 힌트 */
export interface IntentClassification {
  readonly intent: MessageIntent;
  readonly agent: AgentId;
  readonly promptHint: string;
}

// ─── 내부 타입 정의 ───────────────────────────────────────────────────────────

/** 선언형 라우팅 규칙 */
export interface RoutingRule {
  id: string;
  /** 낮을수록 먼저 평가 (0 = 최우선) */
  priority: number;
  /** 매칭 성공 시 선택될 에이전트 */
  agent: AgentId;
  /** OR 매칭: 하나라도 포함되면 매칭 */
  keywords: string[];
  /** 정규식 패턴 매칭 (OR) */
  patterns?: RegExp[];
  /** 이 키워드가 메시지에 포함되면 이 규칙 무효화 */
  excludeKeywords?: string[];
  /** 메시지 시작 부분 매칭 (소문자 기준) */
  startsWith?: string[];
  /** 위 조건으로 처리 못하는 복합 조건 */
  compoundCondition?: (lower: string) => boolean;
  /** 규칙 설명 (reason 메시지로 사용) */
  description: string;
}

/** 강제 게이트 규칙: 강한 의도 신호를 감지하여 에이전트 즉시 교정 */
export interface GateRule {
  id: string;
  /** 메시지에 포함되면 즉시 발동 */
  intentKeywords: string[];
  /** 차단 대상 에이전트 (참조용 명세) */
  blockedAgent: AgentId;
  /** 교정할 에이전트 */
  suggestedAgent: AgentId;
  /** 교정 사유 (사용자에게 표시) */
  reason: string;
}

// ─── 공개 타입 정의 ───────────────────────────────────────────────────────────

/**
 * 라우팅 컨텍스트 — 멀티홉 확장을 위한 상태 추적
 */
export interface RoutingContext {
  /** 이전 에이전트 (로깅용) */
  sourceAgent?: string;
  /** 현재 실행 중인 에이전트 (재귀 차단에 사용) */
  currentAgent?: AgentId;
  /** 현재 홉 깊이 (0 = 최초 요청) */
  hopCount: number;
  /** 이번 라우팅 체인에서 방문한 에이전트 목록 (재방문 차단용) */
  visited: string[];
}

/** 라우팅 결과 (순수 값 객체, side-effect 없음) */
export interface RoutingResult {
  /** 최종 선택된 에이전트 */
  selectedAgent: AgentId;
  /** 라우팅 결정 방법 */
  method: "explicit" | "keyword" | "gate" | "fallback" | "loop-protect" | "inferred" | "project-default";
  /** 요청 직전 활성 에이전트 */
  sourceAgent?: string;
  /** @deprecated selectedAgent를 사용하세요 — 하위 호환용 별칭 */
  targetAgent: string;
  /** keyword 방법일 때 매칭된 키워드 목록 */
  matchedKeywords?: string[];
  /** 사람이 읽을 수 있는 라우팅 사유 */
  reason: string;
  /** gate 교정 시 사유 */
  gateReason?: string;
  /** gate/loop-protect 교정 전 원래 선택됐던 에이전트 */
  originalAgent?: string;
  /** 라우팅 결정 타임스탬프 (ms) */
  timestamp: number;
  /** 이 결과가 생성될 때의 홉 카운트 */
  hopCount: number;
  /** Shadow Multi-Hop 전용: 다음 홉 후보 에이전트 목록 */
  nextCandidates?: string[];
  /** true = 라우팅 판단 불가, 사용자 에이전트 선택 필요 */
  isAmbiguous: boolean;
}

// ─── Shadow Scoring 타입 ─────────────────────────────────────────────────────

/** Shadow Scoring 전용: 후보 에이전트와 점수 정보 (읽기 전용 순수 값 객체) */
export interface CandidateScore {
  agent: string;
  score: number;
  reasons: string[];
}

/** Depth 전략 */
export type DepthStrategy = "hard-cap" | "soft-cap" | "decay";

/** 체인 실행 비용 시뮬레이션 결과 */
export interface SimulationResult {
  totalLatencyMs: number;
  totalTokens: number;
  budgetExceeded: boolean;
  reason?: string;
}

// ─── 팩토리 함수 ─────────────────────────────────────────────────────────────

/** RoutingResult 생성 팩토리 — selectedAgent=targetAgent 자동 설정, 기본값 적용 */
export function createRoutingResult(params: {
  agent: AgentId;
  method: RoutingResult["method"];
  reason: string;
  hopCount: number;
  timestamp: number;
  sourceAgent?: string;
  matchedKeywords?: string[];
  gateReason?: string;
  originalAgent?: string;
  nextCandidates?: string[];
  isAmbiguous?: boolean;
}): RoutingResult {
  return {
    selectedAgent: params.agent,
    targetAgent: params.agent,
    method: params.method,
    reason: params.reason,
    hopCount: params.hopCount,
    timestamp: params.timestamp,
    sourceAgent: params.sourceAgent,
    ...(params.matchedKeywords ? { matchedKeywords: params.matchedKeywords } : {}),
    ...(params.gateReason ? { gateReason: params.gateReason } : {}),
    ...(params.originalAgent ? { originalAgent: params.originalAgent } : {}),
    nextCandidates: params.nextCandidates ?? [],
    isAmbiguous: params.isAmbiguous ?? false,
  };
}

/**
 * 기본 RoutingContext를 생성합니다.
 * 새로운 사용자 요청의 시작점 (hopCount=0, visited=[])
 */
export function createRoutingContext(
  currentAgent?: AgentId,
  sourceAgent?: string,
  overrides?: { hopCount?: number; visited?: string[] }
): RoutingContext {
  return {
    currentAgent,
    sourceAgent,
    hopCount: overrides?.hopCount ?? 0,
    visited: overrides?.visited ?? (currentAgent ? [currentAgent] : []),
  };
}
