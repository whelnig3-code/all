/**
 * agent-router.ts — Intent 기반 에이전트 자동 라우팅 엔진 (메인 진입점)
 *
 * ⚠️ 순수 함수 모듈 (Pure Function Module)
 * - 전역 상태 수정 금지 / 파일 쓰기 금지 / 외부 API 호출 금지
 * - ENABLE_ROUTING_DEBUG=true 시에만 console.log 허용
 *
 * ┌──────────────────────────────────────────────────────┐
 * │  3-Layer 라우팅 아키텍처                              │
 * │                                                      │
 * │  Layer 1: Gate Layer (강제 규칙)                     │
 * │    - hopCount 안전 상한 (> 3 → loop-protect 종료)   │
 * │    - GATE_RULES (의도 신호 기반 강제 교정)           │
 * │                                                      │
 * │  Layer 2: Deterministic Layer (키워드 규칙)          │
 * │    - ROUTING_RULES 우선순위 매칭                     │
 * │    - 방문 에이전트 재방문 차단 (loop-protect)        │
 * │    - developer 재귀 차단 (gate → reviewer)          │
 * │                                                      │
 * │  Layer 3: Fallback Layer                             │
 * │    - 기본값 developer                               │
 * │    - 재귀/재방문 차단                               │
 * │    - classifyMessageIntent 의도 분류                 │
 * └──────────────────────────────────────────────────────┘
 *
 * 파일 구조:
 * - routing-types.ts   — 타입, 인터페이스, 팩토리
 * - routing-rules.ts   — 규칙 테이블, 게이트, 커스텀 캐시
 * - routing-intent.ts  — 의도 분류 (11개 카테고리)
 * - routing-shadow.ts  — Shadow 멀티홉, 스코어링, 비용 시뮬
 * - agent-router.ts    — 3개 레이어 + routeMessage (이 파일)
 */

import type { AgentId } from "../types";
import {
  type RoutingContext,
  type RoutingResult,
  createRoutingResult,
} from "./routing-types";
import {
  SORTED_ROUTING_RULES,
  GATE_RULES,
  getCachedCustomRules,
  matchRule,
} from "./routing-rules";
import { classifyMessageIntent } from "./routing-intent";
import { withShadow } from "./routing-shadow";

// ─── Re-exports (공개 API 하위 호환) ─────────────────────────────────────────

export { createRoutingContext } from "./routing-types";
export type {
  MessageIntent,
  IntentClassification,
  RoutingContext,
  RoutingResult,
} from "./routing-types";
export { classifyMessageIntent, inferIntent } from "./routing-intent";
export {
  getDefaultRoutingRules,
  invalidateCustomRulesCache,
} from "./routing-rules";

// ─── 디버그 유틸리티 ──────────────────────────────────────────────────────────

function debugLog(info: {
  layer: string;
  from?: string;
  to?: string;
  method?: string;
  reason?: string;
  hopCount: number;
  matched?: string[];
}): void {
  if (process.env.ENABLE_ROUTING_DEBUG !== "true") return;
  console.log("[ROUTE]", {
    layer: info.layer,
    from: info.from ?? "—",
    to: info.to ?? "—",
    method: info.method ?? "—",
    reason: info.reason ?? "",
    hopCount: info.hopCount,
    ...(info.matched ? { matched: info.matched } : {}),
  });
}

// ─── Layer 1: Gate Layer ──────────────────────────────────────────────────────

function applyGateLayer(
  lower: string,
  context: RoutingContext,
  now: number
): RoutingResult | null {
  const src = context.sourceAgent ?? context.currentAgent;

  // ① 안전 상한: 홉이 3을 초과하면 루프로 간주하고 강제 종료
  if (context.hopCount > 3) {
    debugLog({
      layer: "Gate[hopCap]",
      to: "developer",
      method: "loop-protect",
      reason: `hopCount=${context.hopCount} > 3`,
      hopCount: context.hopCount,
    });
    return createRoutingResult({
      agent: "developer",
      method: "loop-protect",
      sourceAgent: src,
      reason: `Safety cap: hopCount=${context.hopCount} > 3 — 루프 방지 강제 종료`,
      hopCount: context.hopCount,
      timestamp: now,
    });
  }

  // ② GATE_RULES: 강한 의도 신호가 있으면 즉시 교정
  for (const gate of GATE_RULES) {
    if (gate.intentKeywords.some((kw) => lower.includes(kw))) {
      debugLog({
        layer: "Gate[rule]",
        from: gate.blockedAgent,
        to: gate.suggestedAgent,
        method: "gate",
        reason: gate.reason,
        hopCount: context.hopCount,
      });
      return createRoutingResult({
        agent: gate.suggestedAgent,
        method: "gate",
        sourceAgent: src,
        reason: gate.reason,
        gateReason: gate.reason,
        originalAgent: gate.blockedAgent,
        hopCount: context.hopCount,
        timestamp: now,
      });
    }
  }

  return null;
}

// ─── Layer 2: Deterministic Layer ────────────────────────────────────────────

function applyDeterministicLayer(
  lower: string,
  context: RoutingContext,
  now: number
): RoutingResult | null {
  const src = context.sourceAgent ?? context.currentAgent;
  // 기본 규칙 + 커스텀 규칙(캐시) 병합, 우선순위 순 정렬
  const sortedRules = [...SORTED_ROUTING_RULES, ...getCachedCustomRules()].sort(
    (a, b) => a.priority - b.priority
  );

  for (const rule of sortedRules) {
    const matched = matchRule(rule, lower);
    if (!matched) continue;

    const selected = rule.agent;

    // ① 재방문 차단
    if (context.visited.includes(selected)) {
      debugLog({
        layer: "Det[loopVisit]",
        from: selected,
        to: "developer",
        method: "loop-protect",
        reason: `${selected} 재방문`,
        hopCount: context.hopCount,
        matched,
      });
      return createRoutingResult({
        agent: "developer",
        method: "loop-protect",
        sourceAgent: src,
        reason: `Loop protection: ${selected} 에이전트 재방문 차단`,
        originalAgent: selected,
        matchedKeywords: matched,
        hopCount: context.hopCount,
        timestamp: now,
      });
    }

    // ② developer → developer 재귀 차단
    if (context.currentAgent === "developer" && selected === "developer") {
      debugLog({
        layer: "Det[devRecurse]",
        from: "developer",
        to: "reviewer",
        method: "gate",
        reason: "dev→dev 재귀",
        hopCount: context.hopCount,
        matched,
      });
      return createRoutingResult({
        agent: "reviewer",
        method: "gate",
        sourceAgent: src,
        reason: "developer → developer 재귀 실행 방지: reviewer로 자동 교정",
        gateReason: "developer → developer 재귀 실행 방지: reviewer로 자동 교정",
        originalAgent: "developer",
        matchedKeywords: matched,
        hopCount: context.hopCount,
        timestamp: now,
      });
    }

    // ③ 정상 키워드 매칭
    debugLog({
      layer: "Det[keyword]",
      to: selected,
      method: "keyword",
      reason: rule.description,
      hopCount: context.hopCount,
      matched,
    });
    return createRoutingResult({
      agent: selected,
      method: "keyword",
      sourceAgent: src,
      matchedKeywords: matched,
      reason: rule.description,
      hopCount: context.hopCount,
      timestamp: now,
    });
  }

  return null;
}

// ─── Layer 3: Fallback Layer ──────────────────────────────────────────────────

function applyFallbackLayer(
  lower: string,
  context: RoutingContext,
  now: number,
  projectDefaultAgent?: AgentId
): RoutingResult {
  const src = context.sourceAgent ?? context.currentAgent;

  // 우선순위 1: 프로젝트 기본 에이전트
  if (projectDefaultAgent && !context.visited.includes(projectDefaultAgent)) {
    debugLog({
      layer: "Fallback[projectDefault]",
      to: projectDefaultAgent,
      method: "project-default",
      reason: "프로젝트 기본 에이전트",
      hopCount: context.hopCount,
    });
    return createRoutingResult({
      agent: projectDefaultAgent,
      method: "project-default",
      sourceAgent: src,
      reason: `프로젝트 기본 에이전트: ${projectDefaultAgent}`,
      hopCount: context.hopCount,
      timestamp: now,
    });
  }

  // 우선순위 2: classifyMessageIntent 의도 기반 추론
  const classification = classifyMessageIntent(lower);
  if (!context.visited.includes(classification.agent)) {
    debugLog({
      layer: "Fallback[inferred]",
      to: classification.agent,
      method: "inferred",
      reason: `의도 분류: ${classification.intent}`,
      hopCount: context.hopCount,
    });
    return createRoutingResult({
      agent: classification.agent,
      method: "inferred",
      sourceAgent: src,
      reason: `의도 분류: ${classification.intent} → ${classification.agent}`,
      hopCount: context.hopCount,
      timestamp: now,
    });
  }

  // 루프 보호: developer 재방문 차단
  if (context.visited.includes("developer")) {
    debugLog({
      layer: "Fallback[loopVisit]",
      from: "developer",
      to: "developer",
      method: "loop-protect",
      reason: "developer 재방문",
      hopCount: context.hopCount,
    });
    return createRoutingResult({
      agent: "developer",
      method: "loop-protect",
      sourceAgent: src,
      reason: "Loop protection: developer 기본값 에이전트 재방문 차단",
      originalAgent: "developer",
      hopCount: context.hopCount,
      timestamp: now,
    });
  }

  // developer → developer 재귀 차단
  if (context.currentAgent === "developer") {
    debugLog({
      layer: "Fallback[devRecurse]",
      from: "developer",
      to: "reviewer",
      method: "gate",
      reason: "dev→dev 재귀 (fallback)",
      hopCount: context.hopCount,
    });
    return createRoutingResult({
      agent: "reviewer",
      method: "gate",
      sourceAgent: src,
      reason: "developer → developer 재귀 실행 방지: reviewer로 자동 교정",
      gateReason: "developer → developer 재귀 실행 방지: reviewer로 자동 교정",
      originalAgent: "developer",
      hopCount: context.hopCount,
      timestamp: now,
    });
  }

  // 최종 기본값: developer
  debugLog({
    layer: "Fallback[default]",
    to: "developer",
    method: "fallback",
    reason: "최종 기본값 developer",
    hopCount: context.hopCount,
  });
  return createRoutingResult({
    agent: "developer",
    method: "fallback",
    sourceAgent: src,
    reason: "기본값: developer (자동 배정)",
    hopCount: context.hopCount,
    timestamp: now,
    isAmbiguous: false,
  });
}

// ─── 메인 라우팅 함수 (공개, 순수 함수) ──────────────────────────────────────

/**
 * 메시지 내용을 기반으로 최적 에이전트를 선택합니다.
 *
 * 처리 순서:
 * 0. explicitAgent 있으면 즉시 "explicit" 반환 (최우선)
 * 1. Layer 1 Gate   — hopCount 상한, GATE_RULES 의도 신호 감지
 * 2. Layer 2 Det    — ROUTING_RULES 키워드/패턴 매칭 + 루프 보호
 * 3. Layer 3 Fallback — 기본값 developer + 루프 보호
 *
 * @param message       사용자 메시지 원문
 * @param explicitAgent 사용자가 UI에서 직접 선택한 에이전트 (최우선)
 * @param context       라우팅 컨텍스트 (hopCount, visited 등)
 * @returns RoutingResult — 순수 값 객체
 */
export function routeMessage(
  message: string,
  explicitAgent?: AgentId,
  context: RoutingContext = { hopCount: 0, visited: [] },
  projectDefaultAgent?: AgentId
): RoutingResult {
  const now = Date.now();
  const lower = message.toLowerCase();

  debugLog({
    layer: "Entry",
    from: context.currentAgent,
    method: "—",
    hopCount: context.hopCount,
  });

  // 0단계: 명시적 선택
  if (explicitAgent) {
    debugLog({
      layer: "Explicit",
      to: explicitAgent,
      method: "explicit",
      hopCount: context.hopCount,
    });
    const explicitResult: RoutingResult = createRoutingResult({
      agent: explicitAgent,
      method: "explicit",
      sourceAgent: context.sourceAgent ?? context.currentAgent,
      reason: `사용자 직접 선택: ${explicitAgent}`,
      hopCount: context.hopCount,
      timestamp: now,
    });
    return withShadow(explicitResult, lower, context);
  }

  // Layer 1: Gate
  const gateResult = applyGateLayer(lower, context, now);
  if (gateResult) return withShadow(gateResult, lower, context);

  // Layer 2: Deterministic
  const ruleResult = applyDeterministicLayer(lower, context, now);
  if (ruleResult) return withShadow(ruleResult, lower, context);

  // Layer 3: Fallback
  const fallbackResult = applyFallbackLayer(lower, context, now, projectDefaultAgent);
  return withShadow(fallbackResult, lower, context);
}
