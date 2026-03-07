/**
 * custom-agent.ts — 커스텀 에이전트 타입 정의
 *
 * 비유: 극장의 고정 배우(AGENTS_CONFIG)와 별도로, 오디션으로 합류한 임시 배우의 프로필.
 * id(예명), name(본명), icon(의상), systemPrompt(대본)를 갖는다.
 */

/** 커스텀 에이전트 설정 (불변 — spread로만 업데이트) */
export interface CustomAgentConfig {
  readonly id: string;           // kebab-case, e.g. "qa-tester"
  readonly name: string;         // 표시 이름, e.g. "QA 테스터"
  readonly icon: string;         // 이모지, e.g. "🧪"
  readonly color: string;        // Hex 색상, e.g. "#10B981"
  readonly description: string;  // 역할 설명
  readonly model: string;        // "sonnet" | "opus" | "haiku"
  readonly systemPrompt: string; // 에이전트 지시 프롬프트
  readonly createdAt: string;    // ISO 8601
  readonly updatedAt: string;    // ISO 8601
}

/** 커스텀 에이전트 생성 입력 (id ~ systemPrompt 필수) */
export interface CreateCustomAgentInput {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly color: string;
  readonly description: string;
  readonly model: string;
  readonly systemPrompt: string;
}

/** 커스텀 에이전트 수정 입력 (모든 필드 선택적) */
export interface UpdateCustomAgentInput {
  readonly name?: string;
  readonly icon?: string;
  readonly color?: string;
  readonly description?: string;
  readonly model?: string;
  readonly systemPrompt?: string;
}
