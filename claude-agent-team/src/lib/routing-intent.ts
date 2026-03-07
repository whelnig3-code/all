/**
 * routing-intent.ts — 메시지 의도 분류 엔진
 *
 * 비유: 회사 접수대 직원. 방문자(메시지)의 말을 듣고 적합한 부서(에이전트)로 안내합니다.
 * 11개 의도 카테고리 중 first-match 반환, 매칭 없으면 "general" → developer.
 */

import type { AgentId } from "../types";
import type { MessageIntent, IntentClassification } from "./routing-types";

// ─── 의도 분류 규칙 테이블 ─────────────────────────────────────────────────────
// 우선순위 순서: 배열 앞 규칙이 먼저 평가됩니다 (first-match-wins).
// 전문 에이전트(security, reviewer 등)가 먼저, 범용(question, greeting)이 나중에.

interface IntentRule {
  readonly intent: MessageIntent;
  readonly agent: AgentId;
  readonly patterns: readonly RegExp[];
  readonly promptHint: string;
}

const INTENT_CLASSIFICATION_RULES: readonly IntentRule[] = [
  {
    intent: "security",
    agent: "security-auditor",
    patterns: [/보안/, /취약/, /owasp/, /security/i, /인증\s*검토/, /xss/i, /sql\s*injection/i],
    promptHint: "사용자가 보안 관련 요청을 했습니다. OWASP 기준으로 체계적으로 분석하고 취약점과 개선방안을 제시하세요.",
  },
  {
    intent: "review_request",
    agent: "reviewer",
    patterns: [/리뷰/, /검토/, /review\b/i, /코드\s*확인/, /점검/],
    promptHint: "사용자가 코드 리뷰를 요청했습니다. 품질, 성능, 유지보수성 관점에서 구체적으로 검토하세요.",
  },
  {
    intent: "design",
    agent: "designer",
    patterns: [/디자인/, /와이어프레임/, /\bdesign\b/i, /wireframe/i, /ui\s*설계/, /ux\b/i, /레이아웃/],
    promptHint: "사용자가 UI/UX 디자인을 요청했습니다. 와이어프레임, 레이아웃, 컴포넌트 설계를 진행하세요.",
  },
  {
    intent: "planning",
    agent: "planner",
    patterns: [/설계/, /기획/, /계획/, /아키텍처/, /로드맵/, /\bplan\b/i, /구조\s*설계/],
    promptHint: "사용자가 설계/기획을 요청했습니다. 요구사항을 분석하고 구조화된 계획을 수립하세요.",
  },
  {
    intent: "research",
    agent: "researcher",
    patterns: [/조사/, /리서치/, /research/i, /비교/, /추천/, /최신/, /트렌드/, /찾아봐/, /검색해/, /어떤\s*게\s*좋/],
    promptHint: "사용자가 기술 조사를 요청했습니다. 최신 정보와 비교 분석을 기반으로 구체적인 권장 사항을 제시하세요.",
  },
  {
    intent: "docs",
    agent: "writer",
    patterns: [/문서/, /readme/i, /가이드/, /changelog/i, /문서화/, /\bdocs\b/i, /매뉴얼/],
    promptHint: "사용자가 문서 작성을 요청했습니다. 명확하고 구조화된 문서를 작성하세요.",
  },
  {
    intent: "bug_report",
    agent: "developer",
    patterns: [/버그/, /오류/, /에러/, /\berror\b/i, /안돼/, /안되/, /실패/, /오작동/, /깨진/, /고쳐/, /\bfix\b/i, /\bbug\b/i],
    promptHint: "사용자가 버그 또는 오류를 보고했습니다. 원인을 분석하고 수정 방안을 제시하세요.",
  },
  {
    intent: "code_request",
    agent: "developer",
    patterns: [/구현/, /만들어/, /개발/, /코딩/, /함수/, /컴포넌트/, /```/, /작성해/, /추가해/, /생성해/, /코드/, /\bapi\b/i, /endpoint/i, /\bcreate\b/i, /\bbuild\b/i, /\bimplement\b/i],
    promptHint: "사용자가 코드 구현을 요청했습니다. 고품질 TypeScript 코드를 작성하세요.",
  },
  {
    intent: "question",
    agent: "developer",
    patterns: [/어떻게/, /뭐/, /왜/, /설명해/, /알려줘/, /무엇/, /언제/, /어디/, /\?$/, /\bhow\b/i, /\bwhat\b/i, /\bwhy\b/i, /차이/, /의미/, /방법/, /도와/, /도움/],
    promptHint: "사용자가 질문을 했습니다. 명확하고 구체적으로 답변하세요. 필요하면 코드 예시를 포함하세요.",
  },
  {
    intent: "greeting",
    agent: "developer",
    patterns: [/^(안녕|하이|hello|hi|hey|ㅎㅇ|반가|테스트|test)\b/i, /^(ㅋㅋ|ㅎㅎ|ㅇㅇ)/, /^.{0,10}$/],
    promptHint: "사용자가 인사 또는 테스트 메시지를 보냈습니다. 친근하게 응답하고 도움이 필요한 부분이 있는지 제안하세요.",
  },
];

/**
 * 메시지 의도를 분류하고 적합한 에이전트와 프롬프트 힌트를 반환합니다.
 * 항상 유효한 결과를 반환합니다 (null 없음).
 *
 * @param lower 소문자 변환된 메시지
 * @returns IntentClassification — intent + agent + promptHint (절대 null 아님)
 */
export function classifyMessageIntent(lower: string): IntentClassification {
  for (const rule of INTENT_CLASSIFICATION_RULES) {
    if (rule.patterns.some((p) => p.test(lower))) {
      return {
        intent: rule.intent,
        agent: rule.agent,
        promptHint: rule.promptHint,
      };
    }
  }
  return {
    intent: "general",
    agent: "developer",
    promptHint: "사용자의 요청을 분석하고 적절히 응답하세요. 필요한 경우 코드를 작성하거나 질문에 답변하세요.",
  };
}

/**
 * 메시지 내용에서 에이전트를 추론합니다 (키워드 외 의도 기반).
 * "general" 의도만 null 반환 (호환성 유지).
 */
export function inferIntent(lower: string): AgentId | null {
  const classification = classifyMessageIntent(lower);
  return classification.intent === "general" ? null : classification.agent;
}
