/**
 * agent-executor.ts — Message processing, SSE streaming, Claude API calls
 *
 * Contains processUserMessage() generator and all supporting helpers:
 * - loadConversationHistory
 * - readHandoffMemo / writeHandoffMemo
 * - findRecentlyModifiedFiles
 * - fetchLLMCandidate
 * - generateMockResponse
 * - Pipeline / handoff configuration constants
 *
 * Extracted from agent-manager.ts for single-responsibility.
 * All exports are re-exported from agent-manager.ts for backward compatibility.
 */
import { promises as fsp } from "fs";
import path from "path";
import { AgentId, SSEEvent } from "@/types";
import { AGENTS_CONFIG, AGENT_SYSTEM_PROMPTS } from "@/config/agents";
import { getAgentConfig, getAgentSystemPrompt } from "@/config/agent-registry";
import { executeClaudeCode } from "./claude-code";
import { getAgentTools, executeTool } from "./tools";
import { getMessages, addMessage } from "./conversation-store";
import { readAgentMemory, updateAgentMemory } from "./agent-memory";
// Intent 기반 라우팅 엔진 (순수 함수)
import { routeMessage, createRoutingContext, classifyMessageIntent } from "./agent-router";
import { getProjectBase } from "@/lib/utils/env";
import { ensureDir } from "@/lib/paths";
import { getTenantHandoffsDir } from "@/lib/tenant/tenant-paths";
import { createModuleLogger } from "@/lib/logger";

// State management
import {
  getSocketBroadcast,
  isAgentActive,
  setAgentStatus,
  setCurrentAbortController,
} from "./agent-state";

// Telemetry
import {
  incrementApiCall,
  getEstimatedTokens,
  recordAgentCall,
  incrementChainHopCount,
  getChainHopCount,
  deleteChainHopCount,
  getAgentTimeout,
  getAgentMaxTokens,
  AVG_TOKENS_PER_AGENT,
  AVG_LATENCY_PER_AGENT,
} from "./agent-telemetry";

const log = createModuleLogger("agent-executor");

// ── 히스토리 1개 메시지 최대 길이 (토큰 절약) ─────────────────────────────────
const MAX_MSG_CHARS = 2000;

// ── 파이프라인 연결 맵 ───────────────────────────────────────────────────────
// 에이전트 완료 후 자동으로 다음 에이전트 진행 제안
// planner → developer (백엔드 기본 흐름), designer → developer, developer → reviewer
const PIPELINE_NEXT: Partial<Record<AgentId, { nextAgent: AgentId; msg: string }>> = {
  planner:   { nextAgent: "developer", msg: "📋 플래너가 설계를 완료했습니다.\n개발을 시작할까요?" },
  designer:  { nextAgent: "developer", msg: "🎨 디자인이 완료됐습니다.\n개발을 시작할까요?" },
  developer: { nextAgent: "reviewer",  msg: "⚡ 개발이 완료됐습니다.\n코드 리뷰를 시작할까요?" },
};

// 핸드오프 메모 읽기 소스: 이 에이전트가 시작할 때 어떤 에이전트의 메모를 읽을지
const HANDOFF_SOURCES: Partial<Record<AgentId, AgentId>> = {
  designer:          "planner",    // 디자이너: 플래너 설계 기반으로 디자인
  developer:         "planner",    // 개발자: 플래너 설계 문서 기반으로 구현 (designer 없을 때)
  reviewer:          "developer",
  writer:            "developer",
  "security-auditor": "developer",
};

// 에이전트별 우선 출력 파일 목록 (먼저 탐색할 파일)
// ※ planner는 동적 파일명(plan-*.md)을 쓸 수 있으므로 Step B(전체 스캔)로 주로 감지됨
const AGENT_OUTPUT_FILES: Partial<Record<AgentId, string[]>> = {
  planner: ["docs/plan.md", "docs/design.md"],
  designer: ["docs/design.md", "docs/wireframe.md"],
  reviewer: ["docs/analysis_report.md", "docs/review.md"],
  "security-auditor": ["docs/security-report.md", "docs/audit.md"],
  writer: ["README.md", "docs/README.md"],
};

// 스캔 시 무시할 디렉토리
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", ".claude", "coverage"]);
// 스캔 대상 확장자
const INCLUDE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".css", ".py", ".env.local"]);

/**
 * baseDir 하위에서 sinceMs 이후 수정된 파일을 최대 maxFiles개 반환.
 * SDK 모드 agentic 안전망: 에이전트가 어떤 파일을 작성했는지 자동 감지.
 */
async function findRecentlyModifiedFiles(
  baseDir: string,
  sinceMs: number,
  maxFiles = 10
): Promise<string[]> {
  const result: string[] = [];

  async function scan(dir: string, relDir: string) {
    if (result.length >= maxFiles) return;
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (result.length >= maxFiles) return;
      const name = entry.name;
      const fullPath = path.join(dir, name);
      const relPath = relDir ? `${relDir}/${name}` : name;

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(name)) await scan(fullPath, relPath);
      } else if (entry.isFile()) {
        const ext = path.extname(name).toLowerCase();
        if (INCLUDE_EXTS.has(ext)) {
          try {
            const stat = await fsp.stat(fullPath);
            if (stat.mtimeMs >= sinceMs) result.push(relPath);
          } catch { /* skip */ }
        }
      }
    }
  }

  await scan(baseDir, "");
  return result;
}

/** 핸드오프 메모 읽기: 선행 에이전트가 저장한 메모 파일 읽기 */
async function readHandoffMemo(fromAgentId: AgentId, tenantId?: string): Promise<string> {
  const filePath = path.join(getTenantHandoffsDir(tenantId), `${fromAgentId}.md`);
  try {
    const content = await fsp.readFile(filePath, "utf-8");
    return content.slice(0, 2000); // 토큰 절약: 최대 2000자
  } catch {
    return ""; // 파일 없으면 무시
  }
}

/** 핸드오프 메모 저장: 에이전트 완료 후 다음 에이전트를 위해 자동 저장 */
async function writeHandoffMemo(agentId: AgentId, agentName: string, content: string, tenantId?: string): Promise<void> {
  const dir = getTenantHandoffsDir(tenantId);
  const filePath = path.join(dir, `${agentId}.md`);
  const memo = [
    `# 🗒️ ${agentName} 핸드오프 메모`,
    `생성: ${new Date().toISOString()}`,
    ``,
    `## 작업 요약`,
    ``,
    content.slice(0, 3000),
  ].join("\n");
  try {
    await ensureDir(dir);
    await fsp.writeFile(filePath, memo, "utf-8");
  } catch { /* 저장 실패 무시 */ }
}

// 대화 히스토리 로드 (멀티턴 대화용)
// maxMessages=6: 최근 3턴(user+assistant×3)만 컨텍스트에 포함하여 토큰 절약
async function loadConversationHistory(
  conversationId: string,
  maxMessages: number = 6,
  tenantId?: string,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  try {
    const stored = await getMessages(conversationId, tenantId);
    if (!stored || stored.length === 0) return [];

    // 최근 N개 메시지만 사용 (슬라이딩 윈도우)
    const recent = stored.slice(-maxMessages);

    return recent
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        // 긴 메시지는 MAX_MSG_CHARS자로 트런케이트 (토큰 절약)
        content:
          m.content.length > MAX_MSG_CHARS
            ? m.content.slice(0, MAX_MSG_CHARS) +
              "\n... [이하 생략 — 전체 내용은 파일에서 확인]"
            : m.content,
      }));
  } catch {
    return [];
  }
}

// ─── [Phase 3] LLM 기반 보조 후보 생성 헬퍼 ──────────────────────────────────
// 설계 원칙:
//   - agent-router.ts는 순수 함수 모듈(외부 API 호출 금지)이므로 여기에 구현
//   - ANTHROPIC_API_KEY 미설정 → null 반환 (SDK 모드 완전 호환)
//   - 타임아웃/파싱/네트워크 오류 → null 반환 (체인 실행에 영향 없음)
//   - rule 기반 nextCandidates보다 우선권 없음 — 뒤에 추가만 가능
//   - alreadyVisited에 포함된 에이전트는 화이트리스트 통과 후에도 재차 제거
async function fetchLLMCandidate(
  message: string,
  agentResponse: string,
  currentAgent: string,
  alreadyVisited: string[],  // currentAgent 포함 (현재 hop까지의 전체 방문 목록)
): Promise<{ name: string; score: number; reason: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;  // API 키 미설정 → SDK 모드, 조용히 skip

  // 유효 에이전트 화이트리스트 (내장 + 커스텀 — 이 목록 밖의 제안은 거부)
  const { getCustomAgentIds } = await import("@/config/agent-registry");
  const validAgents = [
    "planner", "developer", "reviewer",
    "security-auditor", "researcher", "writer", "designer",
    ...getCustomAgentIds(),
  ];

  // 아직 방문하지 않은 에이전트만 LLM에게 제안 권한 부여
  const available = validAgents.filter((a) => !alreadyVisited.includes(a));
  if (available.length === 0) return null;

  const systemPrompt = `You are a workflow routing assistant for a multi-agent software development team. Suggest the BEST next agent based on context. Be conservative — only suggest if clearly necessary.`;
  const userPrompt = `Current agent: ${currentAgent}
Available agents to suggest (ONLY from this list): ${available.join(", ")}

User's original request (first 400 chars):
${message.substring(0, 400)}

Current agent's response summary (first 600 chars):
${agentResponse.substring(0, 600)}

Based on the above, suggest the BEST next agent if one is clearly needed. Otherwise return empty.
Respond with ONLY valid JSON, no explanation:
{"nextAgents": [{"name": "agent-name", "score": 8, "reason": "간단한 이유(한국어)"}]}

Rules:
- Suggest at most 1 agent
- score: 1-10 (suggest only if score would be >= 7)
- name must exactly match one from the available list
- If no next agent is clearly needed: {"nextAgents": []}`;

  try {
    const abortCtrl = new AbortController();
    const timeoutId = setTimeout(() => abortCtrl.abort(), 8000); // 8초 타임아웃

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: abortCtrl.signal,
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",  // 라우팅 결정용: 빠르고 저렴
        max_tokens: 200,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    clearTimeout(timeoutId);
    if (!res.ok) return null;

    const data = await res.json() as { content?: Array<{ type: string; text: string }> };
    const text = (data.content?.[0]?.text ?? "").trim();

    // 응답에 설명 텍스트가 섞인 경우를 대비해 JSON 객체만 추출
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as {
      nextAgents?: { name: string; score: number; reason: string }[];
    };
    const candidates = parsed.nextAgents ?? [];
    if (candidates.length === 0) return null;

    const candidate = candidates[0];
    // 화이트리스트 검증: LLM이 임의 에이전트를 반환하는 것을 방지
    if (!validAgents.includes(candidate.name)) return null;
    // 방문 목록 재확인 (LLM이 무시하는 경우 대비)
    if (alreadyVisited.includes(candidate.name)) return null;

    return candidate;
  } catch {
    // 타임아웃, 파싱 오류, 네트워크 에러 → 조용히 null 반환
    return null;
  }
}

// 목업 응답 생성
function generateMockResponse(agentId: string, message: string): string {
  const responses: Record<string, string> = {
    planner: `## 📋 기획 분석\n\n요청사항 **"${message.slice(0, 50)}..."**을 분석했습니다.\n\n### 제안 아키텍처\n- **Phase 1**: 요구사항 정리 및 기술 스택 선정\n- **Phase 2**: 핵심 기능 구현\n- **Phase 3**: 테스트 및 검증\n\n> ⚠️ ANTHROPIC_API_KEY가 설정되지 않아 목업 응답입니다. .env.local에 API 키를 추가하세요.`,
    developer: `## ⚡ 개발 응답\n\n\`\`\`typescript\n// ${message.slice(0, 30)} 구현 예시\nexport function implementation() {\n  // TODO: API 키 설정 후 실제 코드 생성\n  return "API 키를 설정하면 실제 코드가 생성됩니다.";\n}\n\`\`\`\n\n> ⚠️ ANTHROPIC_API_KEY가 설정되지 않아 목업 응답입니다.`,
    reviewer: `## 🔍 코드 리뷰\n\n**검토 완료** — 주요 발견 사항:\n\n1. ✅ 기본 구조 양호\n2. ⚠️ 에러 핸들링 보강 필요\n3. ℹ️ 타입 정의 추가 권장\n\n> ⚠️ ANTHROPIC_API_KEY가 설정되지 않아 목업 응답입니다.`,
    writer: `## 📝 문서 초안\n\n### 개요\n${message.slice(0, 100)}...\n\n### 사용 방법\n1. 설치: \`npm install\`\n2. 실행: \`npm run dev\`\n\n> ⚠️ ANTHROPIC_API_KEY가 설정되지 않아 목업 응답입니다.`,
    "security-auditor": `## 🔒 보안 감사 결과\n\n**위험도 평가**: 낮음 (목업)\n\n| 항목 | 상태 |\n|------|------|\n| XSS 취약점 | ✅ 없음 |\n| SQL 인젝션 | ✅ 없음 |\n| 인증 로직 | ⚠️ 확인 필요 |\n\n> ⚠️ ANTHROPIC_API_KEY가 설정되지 않아 목업 응답입니다.`,
    researcher: `## 🔬 조사 결과\n\n**주제**: ${message.slice(0, 50)}\n\n### 주요 레퍼런스\n- 공식 문서 참조 권장\n- 커뮤니티 베스트 프랙티스 적용\n- 최신 업데이트 확인 필요\n\n> ⚠️ ANTHROPIC_API_KEY가 설정되지 않아 목업 응답입니다.`,
  };

  return responses[agentId] || responses["developer"];
}

// 사용자 메시지를 처리하고 SSE 이벤트를 순차적으로 yield
export async function* processUserMessage(
  message: string,
  conversationId?: string,
  targetAgent?: AgentId,
  /**
   * 프로젝트에 설정된 기본 에이전트.
   * targetAgent 미지정 시 inferIntent 이전에 사용됩니다.
   */
  projectDefaultAgent?: AgentId,
  /**
   * [Phase 2] Multi-Hop 내부 전용 — 외부(API route)에서 절대 전달 금지.
   * 멀티홉 체인 실행 시 hopCount/visited 상태를 다음 홉으로 전달하는 데 사용.
   * chainStartTime: 최상위 hop 시작 시각 (Runtime Budget 계산 기준점).
   * chainRootTaskId: 최상위 호출의 taskId (텔레메트리 집계 기준 키).
   */
  _hopContext?: {
    hopCount: number;
    visited: string[];
    chainStartTime?: number;
    chainRootTaskId?: string;
    forcedLastHop?: boolean;  // Soft Budget 초과 시 true → 이 hop은 추가 체인 불가
  },
  /** 멀티 테넌트 모드에서 테넌트 격리를 위한 ID */
  tenantId?: string,
): AsyncGenerator<SSEEvent> {
  // ── 오케스트라 추적용 taskId 생성 ──────────────────────────────────────────
  // 형식: tsk-<agentId 예정>-<타임스탬프 6자리>-<랜덤 4자리>
  // (agentId는 selectAgent 호출 전이므로 임시 "pending" 사용 후 확정 후 재로그)
  const taskId = `tsk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  // 실행 시작 시각 기록 (완료 후 방금 수정된 파일 감지용)
  const taskStartTime = Date.now();

  // 유저 메시지 영속 저장 (fire-and-forget: 응답 스트림을 블로킹하지 않음)
  if (conversationId) {
    addMessage(conversationId, "user", message, undefined, tenantId).catch(() => {});
  }

  // 새 요청 시작 시 AbortController 생성 (이전 요청은 이미 종료된 상태)
  const abortController = new AbortController();
  setCurrentAbortController(abortController);
  const abortSignal = abortController.signal;

  // ── Intent 기반 라우팅 (순수 함수, side-effect 없음) ──────────────────────
  // routeMessage()는 전역 상태 수정 없이 라우팅 결과만 반환합니다.
  // SSE "routing" 이벤트는 아래에서 yield — 로그/사이드이펙트는 여기서 담당합니다.
  //
  // RoutingContext: 각 사용자 요청은 hopCount=0, visited=[] 에서 시작합니다.
  // 멀티홉 시나리오(Phase 5+)에서는 context를 다음 홉으로 전달하여 루프를 추적합니다.
  const routingContext = createRoutingContext(
    undefined,    // 현재 에이전트: 단일 홉에서는 미설정 (멀티홉 구현 시 활성화)
    undefined,    // 이전 에이전트: 단일 홉에서는 미설정
    _hopContext   // [Phase 2] 멀티홉 체인에서 hopCount/visited 이어받기
  );
  const routingResult = routeMessage(message, targetAgent, routingContext, projectDefaultAgent);
  const agentId = routingResult.selectedAgent;

  // [1] TASK_CREATED: Leader가 task를 생성하는 시점
  log.info({ taskId, agentId, routing: routingResult.method, reason: routingResult.reason, conv: conversationId ?? "none" }, "TASK_CREATED");

  // 판단 불가: developer 자동 실행 금지 — 에이전트 선택 UI 표시 후 중단
  if (routingResult.isAmbiguous) {
    yield {
      type: "needs_agent_select" as const,
      reason: "어떤 에이전트에게 요청할지 선택해 주세요.",
    };
    return;
  }

  // 라우팅 결과를 SSE로 즉시 전송 — UI 배지 및 Timeline에 표시 (1회만)
  yield {
    type: "routing" as const,
    agent: agentId,
    method: routingResult.method,
    sourceAgent: routingResult.sourceAgent,
    targetAgent: routingResult.targetAgent,
    matchedKeywords: routingResult.matchedKeywords,
    reason: routingResult.reason,
    gateReason: routingResult.gateReason,
    originalAgent: routingResult.originalAgent,
    hopCount: routingResult.hopCount,
    // Shadow Multi-Hop: ENABLE_SHADOW_MULTI_HOP=true 일 때만 포함 (실제 호출 없음)
    nextCandidates: routingResult.nextCandidates,
    isAmbiguous: routingResult.isAmbiguous,
  };

  // 로컬 변경 가능 변수: routingResult (순수 값 객체)를 직접 변이하지 않기 위해 분리
  let nextCandidates = routingResult.nextCandidates ?? [];

  // 에이전트 비활성화 상태 확인
  if (!isAgentActive(agentId)) {
    yield {
      type: "error",
      error: `${(await getAgentConfig(agentId))?.name || agentId} 에이전트가 비활성화되어 있습니다.`,
    };
    return;
  }

  const config = await getAgentConfig(agentId);
  const agentName = config?.name || agentId;
  const agentIcon = config?.icon || "🤖";

  // 에이전트 활성화 알림 + WebSocket 브로드캐스트
  setAgentStatus(agentId, "active");
  // [5] LEADER_UPDATE: Leader가 상태를 active로 변경
  log.info({ taskId, agentId, status: "active" }, "LEADER_UPDATE");
  // 메시지 앞 50자를 현재 작업 요약으로 전송
  getSocketBroadcast()?.(agentId, "active", message.slice(0, 50));
  yield {
    type: "agent",
    agent: agentId,
    content: `${agentIcon} **${agentName}**이(가) 작업을 시작합니다...`,
    status: "active",
  };

  // 핸드오프 소스 에이전트 결정 (메모리와 병렬 로드에 필요)
  const handoffSourceId = HANDOFF_SOURCES[agentId as AgentId];

  // 멀티턴 히스토리 + 핸드오프 메모 + 장기 메모리를 병렬로 로드
  const [history, handoffMemo, agentMemoryContent] = await Promise.all([
    conversationId ? loadConversationHistory(conversationId, 6, tenantId) : Promise.resolve([]),
    handoffSourceId ? readHandoffMemo(handoffSourceId, tenantId) : Promise.resolve(""),
    readAgentMemory(agentId as AgentId, tenantId),
  ]);

  const baseSystemPrompt = await getAgentSystemPrompt(agentId);
  const systemPromptWithHandoff = handoffMemo
    ? `${baseSystemPrompt}\n\n---\n[이전 ${handoffSourceId} 핸드오프 메모]\n${handoffMemo}\n---`
    : baseSystemPrompt;
  const systemPromptWithMemory = agentMemoryContent
    ? `${systemPromptWithHandoff}\n\n---\n[장기 메모리 — 이전 세션 학습 내용]\n${agentMemoryContent}\n---`
    : systemPromptWithHandoff;

  // ── 의도 기반 프롬프트 힌트 주입 ──────────────────────────────────────────
  // 메시지 의도를 분류하여 에이전트가 응답 방향을 잡을 수 있는 힌트를 시스템 프롬프트에 추가
  const intentResult = classifyMessageIntent(message.toLowerCase());
  const systemPromptFinal = intentResult.intent !== "general"
    ? `${systemPromptWithMemory}\n\n---\n[메시지 의도: ${intentResult.intent}] ${intentResult.promptHint}\n---`
    : systemPromptWithMemory;

  // 에이전트별 도구 설정
  const tools = getAgentTools(agentId);

  // ── 비동기 이벤트 큐 ─────────────────────────────────────────
  // executeClaudeCode의 onStream/onToolUse 콜백이 클로저 밖이라 yield 불가
  // 대신 큐에 쌓고 제너레이터 루프에서 실시간으로 yield합니다.
  // 텍스트 청크(string) 또는 구조화된 SSE 이벤트(SSEEvent) 혼합 가능
  const chunkQueue: (string | SSEEvent)[] = [];
  let chunkResolve: (() => void) | null = null; // 대기 중인 yield 깨우기
  let execDone = false;
  let streamError: unknown = null;

  // executeClaudeCode 반환값 (Claude의 순수 텍스트 응답, 도구 로그 제외)
  // onStream이 호출됐다면 이미 streamBuffer에 포함됨
  // onStream 없이 조용히 완료된 경우의 안전망으로 사용
  let finalClaudeResponse = "";

  // Claude가 실제 텍스트를 스트리밍했는지 여부 (도구 로그 제외)
  let hasStreamedText = false;

  /** 큐에 신호 보내기 (청크 추가 or 완료 시 호출) */
  function signalQueue(): void {
    chunkResolve?.();
    chunkResolve = null;
  }

  // [3] WORKER_RECEIVE: Worker(executeClaudeCode)가 작업을 수신하는 시점
  log.info({ taskId, agentId, mode: process.env.CLAUDE_CODE_MODE ?? (process.env.ANTHROPIC_API_KEY ? "api" : "sdk") }, "WORKER_RECEIVE");

  // ── [Phase 3 준비] COST_ESTIMATE: LLM 호출 전 비용 선제 추정 ────────────────
  // 실제 LLM 과금 모델 기준 추정값 (SDK 모드에서는 참고용 — 구독 사용)
  // ⚠️ 변수명 주의: 모듈 레벨 estimatedTokens를 섀도잉하지 않도록
  //   estCostTokens / estCostLatency 사용
  const estCostTokens  = AVG_TOKENS_PER_AGENT[agentId]  ?? 1500;
  const estCostLatency = AVG_LATENCY_PER_AGENT[agentId]  ?? 20000;
  const estimatedCostUSD = ((estCostTokens / 1_000_000) * 15).toFixed(6); // Sonnet output $15/M
  log.info({ taskId, agentId, est_tokens: estCostTokens, est_latency: estCostLatency, est_cost_usd: estimatedCostUSD, hop: _hopContext?.hopCount ?? 0 }, "COST_ESTIMATE");

  // ── Cost-aware 사전 차단 ──────────────────────────────────────────────────
  // 조건 1: 누적 토큰(서버 기동 후 합산) + 예상 토큰 > MAX_TOKEN_BUDGET (0이면 비활성)
  // 조건 2: 단일 hop 예상 비용 > COST_THRESHOLD_USD (0이면 비활성)
  // 차단 시: LLM 호출 없이 즉시 종료 + [METRIC] COST_BLOCKED 출력
  const currentEstimatedTokens = getEstimatedTokens();
  const maxTokenBudget   = Number(process.env.MAX_TOKEN_BUDGET   ?? "8000");
  const costThresholdUsd = Number(process.env.COST_THRESHOLD_USD ?? "0.10");
  const projectedTokens  = currentEstimatedTokens + estCostTokens;
  const isCostBlocked    =
    (maxTokenBudget > 0 && projectedTokens > maxTokenBudget) ||
    (costThresholdUsd > 0 && Number(estimatedCostUSD) > costThresholdUsd);

  if (isCostBlocked) {
    log.warn({ agentId, est_tokens: estCostTokens, est_cost: estimatedCostUSD, accumulated_tokens: currentEstimatedTokens, projected: projectedTokens, max_budget: maxTokenBudget }, "COST_BLOCKED");
    nextCandidates = [];  // 추가 hop 차단
    setAgentStatus(agentId, "idle");
    getSocketBroadcast()?.(agentId, "idle");
    yield {
      type: "stream" as const,
      agent: agentId,
      content: `⚠️ **비용 한도 초과로 실행이 차단되었습니다.**\n\n- 누적 토큰: ${currentEstimatedTokens} + 예상: ${estCostTokens} = ${projectedTokens} (한도: ${maxTokenBudget})\n- 예상 비용: $${estimatedCostUSD} (한도: $${costThresholdUsd})`,
    };
    yield { type: "done" as const, summary: "비용 한도 초과로 차단되었습니다." };
    return;
  }

  // 타임아웃 1회 계산 (3곳에서 재사용 — METRIC 로그, execPromise, 타임아웃 안내 메시지)
  const agentTimeout = getAgentTimeout(agentId, config?.model);

  // executeClaudeCode를 await 없이 시작: 청크는 큐에 쌓임
  const execPromise = executeClaudeCode({
    prompt: message,
    systemPrompt: systemPromptFinal,
    conversationHistory: history,
    tools: tools.length > 0 ? tools : undefined,
    // Step 1: 에이전트별 Hard Timeout (ENV: AGENT_TIMEOUT_*_MS)
    // Step 3: 에이전트별 max_tokens 상한 (ENV: MAX_TOKENS_*)
    timeout: agentTimeout,
    maxTokens: getAgentMaxTokens(agentId),
    // 스트리밍 청크 → 큐에 추가 후 즉시 제너레이터 루프로 전달
    onStream: (chunk) => {
      // 도구 실행 로그(🔧)는 onToolUse SSE 이벤트로 별도 처리되므로
      // msg.content에 포함되지 않도록 필터링 — 완료 후 대화 로그에 잔류하지 않음
      if (chunk.includes("🔧")) return;
      if (chunk.trim().length > 0) {
        hasStreamedText = true;
      }
      chunkQueue.push(chunk);
      // [2] QUEUE_PUSH: 스트리밍 청크가 큐에 추가되는 시점
      // 텍스트가 있는 청크만 기록 (빈 청크 노이즈 방지)
      if (chunk.trim().length > 0) {
        log.debug({ taskId, queueLen: chunkQueue.length, chunkLen: chunk.length }, "QUEUE_PUSH");
      }
      signalQueue();
    },
    onToolUse: async (toolName, toolInput) => {
      // 도구 사용 시작 이벤트를 큐에 추가 (UI에 "🔧 도구명 사용 중..." 표시)
      const toolUseEvent: SSEEvent = {
        type: "tool_use",
        toolName,
        toolInput,
      };
      chunkQueue.push(toolUseEvent);
      signalQueue();

      // 실제 도구 실행
      const result = await executeTool(toolName, toolInput);
      const toolResultEvent: SSEEvent = {
        type: "tool_result",
        toolName,
        result,
      };
      chunkQueue.push(toolResultEvent);
      signalQueue();
      return result;
    },
  })
    .then((result) => {
      // 최종 응답 텍스트 저장 (onStream과 동일 내용이지만 안전망용)
      finalClaudeResponse = result;
      execDone = true;
      // [4] WORKER_DONE: Worker가 실행을 정상 완료한 시점
      log.info({ taskId, agentId, responseLen: result.length, streamed: hasStreamedText }, "WORKER_DONE");
      // [METRIC] CHAIN_DURATION_MS: 이 hop의 실행 시간 (taskStartTime 기준)
      const hopDuration = Date.now() - taskStartTime;
      log.info({ taskId, agentId, hop: _hopContext?.hopCount ?? 0, durationMs: hopDuration }, "CHAIN_DURATION_MS");
      // Step 5: per-hop 실행 시간 + 상태 텔레메트리
      log.info({ taskId, agentId, hop: _hopContext?.hopCount ?? 0, durationMs: hopDuration, status: "OK" }, "AGENT_DURATION");
      // [METRIC] AGENT_CALL_DISTRIBUTION: 에이전트별 누적 호출 횟수 (서버 기동 후 누산)
      recordAgentCall(agentId);
      signalQueue();
    })
    .catch((err) => {
      streamError = err;
      execDone = true;
      // [4] WORKER_DONE(error): Worker가 오류로 종료된 시점
      const errMsg = err instanceof Error ? err.message : String(err);
      const isAgentTimeout = errMsg.includes("시간 초과") || errMsg.includes("timeout");
      log.error({ taskId, agentId, error: errMsg.slice(0, 80) }, "WORKER_DONE error");
      // Step 1: 에이전트 Hard Timeout 전용 METRIC 로그
      if (isAgentTimeout) {
        log.warn({ taskId, agentId, timeoutMs: agentTimeout, hop: _hopContext?.hopCount ?? 0 }, "AGENT_TIMEOUT");
      }
      // Step 5: per-hop 실행 시간 + 상태 텔레메트리 (TIMEOUT / ERROR 구분)
      const hopDurationOnErr = Date.now() - taskStartTime;
      log.info({ taskId, agentId, hop: _hopContext?.hopCount ?? 0, durationMs: hopDurationOnErr, status: isAgentTimeout ? "TIMEOUT" : "ERROR" }, "AGENT_DURATION");
      signalQueue();
    });

  // ── 이벤트 실시간 yield 루프 ──────────────────────────────────
  // execDone이 true이고 큐가 비워질 때까지 반복
  // abortSignal.aborted가 true이면 즉시 루프 탈출 (중단 기능)
  let streamBuffer = "";
  while (!execDone || chunkQueue.length > 0) {
    // 중단 신호 감지 시 즉시 루프 탈출
    if (abortSignal.aborted) break;

    if (chunkQueue.length > 0) {
      const item = chunkQueue.shift()!;

      // 항목 타입 분기: SSEEvent 객체이면 그대로 yield, 문자열이면 stream 이벤트로 래핑
      if (typeof item === "string") {
        // 텍스트 청크: "stream" 이벤트로 ChatArea에 전달 (타이핑 효과)
        streamBuffer += item;
        yield {
          type: "stream" as const,
          agent: agentId,
          content: item,
          status: "active" as const,
        };
      } else {
        // 구조화된 SSE 이벤트 (tool_use / tool_result 등): 그대로 yield
        // ChatArea에서 타입별로 다른 UI 처리 가능
        // 도구 로그 텍스트는 별도로 string 청크로도 큐에 추가되어 streamBuffer에 포함됨
        yield item;
      }
    } else if (!execDone) {
      // 다음 이벤트 또는 완료 신호 대기
      await new Promise<void>((r) => {
        chunkResolve = r;
      });
    }
  }

  // execPromise 완료 보장 (위 .catch에서 이미 처리됨, 안전 대기)
  await execPromise;

  // 함수 종료 시 AbortController 정리 (중단 후 재사용 방지)
  setCurrentAbortController(null);

  incrementApiCall(message.length, streamBuffer.length, agentId);

  // 중단 신호가 발생한 경우 중단 완료 이벤트를 반환하고 종료
  if (abortSignal.aborted) {
    setAgentStatus(agentId, "idle");
    // [5] LEADER_UPDATE: 중단으로 인한 idle 전환
    log.info({ taskId, agentId, status: "idle(aborted)" }, "LEADER_UPDATE");
    getSocketBroadcast()?.(agentId, "idle");
    yield {
      type: "done" as const,
      summary: "작업이 중단되었습니다.",
    };
    return;
  }

  if (streamError) {
    const errMsg = streamError instanceof Error ? streamError.message : String(streamError);
    const isTimeout = errMsg.includes("시간 초과") || errMsg.includes("timeout");

    // 스트리밍된 내용이 있으면 → 부분 성공으로 처리 (에러만 표시하지 않음)
    if (streamBuffer.trim() && isTimeout) {
      setAgentStatus(agentId, "done");
      // [5] LEADER_UPDATE: 타임아웃 부분 성공 → done 처리
      log.info({ taskId, agentId, status: "done(timeout-partial)" }, "LEADER_UPDATE");
      getSocketBroadcast()?.(agentId, "idle");
      // 이미 스트리밍된 내용은 위 루프에서 전달됨 — 타임아웃 안내만 추가
      yield {
        type: "stream" as const,
        agent: agentId,
        content: `\n\n---\n⚠️ **작업 시간 초과로 일부 중단** (${Math.round(agentTimeout / 60000)}분 제한)\n위 내용까지 완료되었습니다.`,
      };
    } else {
      // 내용 없이 실패 → 에러 표시
      setAgentStatus(agentId, "error");
      // [5] LEADER_UPDATE: 실패 → error 처리
      log.error({ taskId, agentId, status: "error" }, "LEADER_UPDATE");
      getSocketBroadcast()?.(agentId, "error");
      yield {
        type: "stream" as const,
        agent: agentId,
        content: `❌ **에이전트 실행 실패**\n\n\`\`\`\n${errMsg}\n\`\`\`\n\n**진단 방법:** 터미널에서 \`claude -p "테스트" --print\` 실행`,
      };
    }
  } else {
    // 정상 완료: 최종 전체 응답 이벤트 (ChatArea가 isStreaming 종료에 사용)
    setAgentStatus(agentId, "done");
    // [5] LEADER_UPDATE: 정상 완료 → done 처리
    log.info({ taskId, agentId, status: "done" }, "LEADER_UPDATE");
    getSocketBroadcast()?.(agentId, "idle");

    // 안전망 1: onStream 반환값이 있으면 streamBuffer에 추가
    // (SDK 모드의 result.result 또는 API 모드의 finalText가 스트리밍 외부로 온 경우)
    let displayContent = streamBuffer;
    if (!hasStreamedText && finalClaudeResponse) {
      displayContent = streamBuffer
        ? streamBuffer + "\n\n---\n\n" + finalClaudeResponse
        : finalClaudeResponse;
    }

    // ── 안전망 2: 출력 파일 자동 표시 (SDK 모드 agentic 안전망) ────────────────
    // Claude Code CLI가 도구만 실행하고 텍스트를 출력하지 않는 경우
    // Step A: 에이전트별 우선 출력 파일 확인 (planner → docs/plan.md 등)
    // Step B: 우선 파일 없으면 → 프로젝트 전체에서 방금 수정된 파일 자동 감지
    if (!hasStreamedText) {
      const base = getProjectBase();
      let foundOutput = false;

      // Step A: 에이전트별 우선 출력 파일 (docs/plan.md 등)
      const priorityFiles = AGENT_OUTPUT_FILES[agentId as AgentId] ?? [];
      for (const filePath of priorityFiles) {
        try {
          const fullPath = path.join(base, filePath);
          const stat = await fsp.stat(fullPath);
          if (stat.mtimeMs >= taskStartTime - 2000) {
            const content = await fsp.readFile(fullPath, "utf-8");
            if (content.trim()) {
              const autoChunk = `\n\n---\n\n## 📄 **${filePath}**\n\n${content}`;
              yield { type: "stream" as const, agent: agentId, content: autoChunk, status: "active" as const };
              displayContent = (displayContent || "") + autoChunk;
              foundOutput = true;
              break;
            }
          }
        } catch { /* skip */ }
      }

      // Step B: 우선 파일 없으면 → 방금 수정된 파일 자동 감지
      if (!foundOutput) {
        try {
          const recentFiles = await findRecentlyModifiedFiles(base, taskStartTime - 2000);
          if (recentFiles.length > 0) {
            let summary = `\n\n---\n\n## ✅ 작업 완료 — 수정된 파일 (${recentFiles.length}개)\n\n`;
            summary += recentFiles.map((f) => `- \`${f}\``).join("\n");

            // 소규모 파일(5000자 이하)은 내용도 표시 (최대 2개)
            let shown = 0;
            for (const f of recentFiles) {
              if (shown >= 2) break;
              try {
                const content = await fsp.readFile(path.join(base, f), "utf-8");
                if (content.trim() && content.length <= 5000) {
                  const ext = path.extname(f).replace(".", "") || "text";
                  summary += `\n\n### 📄 ${f}\n\`\`\`${ext}\n${content}\n\`\`\``;
                  shown++;
                }
              } catch { /* skip */ }
            }

            yield { type: "stream" as const, agent: agentId, content: summary, status: "active" as const };
            displayContent = (displayContent || "") + summary;
            foundOutput = true;
          }
        } catch { /* 스캔 실패 시 무시 */ }
      }

      // Step C: 아무 파일도 수정되지 않았으면 도구 로그를 그대로 표시
      if (!foundOutput && streamBuffer.trim()) {
        displayContent = streamBuffer;
      }
    }
    // ──────────────────────────────────────────────────────────────────────────

    yield {
      type: "agent" as const,
      agent: agentId,
      content: displayContent || "(응답 없음)",
      status: "done" as const,
    };

    // 어시스턴트 응답 영속 저장 (fire-and-forget: 채팅 이력 유지, agentId 포함)
    if (conversationId && displayContent && displayContent !== "(응답 없음)") {
      addMessage(conversationId, "assistant", displayContent, agentId, tenantId).catch(() => {});
    }

    // 핸드오프 메모 + 장기 메모리를 병렬로 저장 (독립 파일, 데이터 의존성 없음)
    if (displayContent && displayContent !== "(응답 없음)") {
      await Promise.all([
        writeHandoffMemo(agentId as AgentId, agentName, displayContent, tenantId),
        updateAgentMemory(agentId as AgentId, agentName, displayContent.slice(0, 800), tenantId),
      ]);
    }

    // ── 파이프라인 제안: 실제 작업이 수행된 경우에만 다음 에이전트 진행 제안 ───
    // 조건: (1) 텍스트 출력이 있고 (2) 단순 대화(인사/질문)가 아닌 실제 작업 의도일 때만
    // 비유: 레스토랑에서 "안녕하세요"라고 인사만 했는데 "디저트 드릴까요?"라고 묻지 않는 것
    const NON_WORK_INTENTS = new Set(["greeting", "question", "general"]);
    const isWorkIntent = !NON_WORK_INTENTS.has(intentResult.intent);
    const pipelineNext = PIPELINE_NEXT[agentId as AgentId];
    if (pipelineNext && isWorkIntent && (hasStreamedText || (displayContent && displayContent !== "(응답 없음)"))) {
      yield {
        type: "pipeline" as const,
        agent: agentId,
        nextAgent: pipelineNext.nextAgent,
        pipelineMsg: pipelineNext.msg,
      };
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ─── [Phase 3] LLM Candidate 보조 후보 생성 ──────────────────────────────
    // ENABLE_LLM_CANDIDATE=true + ANTHROPIC_API_KEY 설정 + 조건 충족 시에만 실행.
    // rule 기반 nextCandidates는 항상 유지하고, LLM 후보는 최대 1개만 뒤에 추가.
    if (
      process.env.ENABLE_LLM_CANDIDATE === "true" &&
      displayContent &&
      displayContent !== "(응답 없음)" &&
      !_hopContext?.forcedLastHop     // Soft Budget에 의해 마지막 hop 강제 시 LLM 불필요
    ) {
      const llmChainStart  = _hopContext?.chainStartTime ?? taskStartTime;
      const llmElapsedMs   = Date.now() - llmChainStart;
      const softBudgetMs   = Number(process.env.SOFT_BUDGET_MS               ?? "0");
      const maxHopLimit    = Number(process.env.MAX_HOP_LIMIT                ?? "3");
      const scoreThreshold = Number(process.env.LLM_CANDIDATE_SCORE_THRESHOLD ?? "7");
      const currentHop     = _hopContext?.hopCount ?? 0;
      // visited에 현재 에이전트(agentId) 포함: 이번 hop도 완료된 것으로 간주
      const visitedSoFar   = [...(_hopContext?.visited ?? []), agentId];

      // ① hopCount 제한 ② Soft Budget 제한 (SOFT_BUDGET_MS=0이면 항상 통과)
      const hopOk    = currentHop < maxHopLimit;
      const budgetOk = softBudgetMs === 0 || llmElapsedMs < softBudgetMs;

      if (hopOk && budgetOk) {
        const llmCandidate = await fetchLLMCandidate(
          message,
          displayContent,
          agentId,
          visitedSoFar,
        );

        if (llmCandidate && llmCandidate.score >= scoreThreshold) {
          if (!nextCandidates.includes(llmCandidate.name)) {
            // rule 기반 후보 뒤에 추가 (우선권 없음 — nextCandidates[0]는 rule 기반)
            nextCandidates = [...nextCandidates, llmCandidate.name];
            log.info({ taskId, agentId, llm_next: llmCandidate.name, score: llmCandidate.score, reason: llmCandidate.reason, hop: currentHop, elapsedMs: llmElapsedMs, adopted: true }, "LLM_CANDIDATE");
          } else {
            // 이미 rule-based에 동일 에이전트가 있음 → 중복 추가 방지
            log.info({ taskId, agentId, llm_next: llmCandidate.name, score: llmCandidate.score, adopted: false, reason: "already_in_rule_candidates" }, "LLM_CANDIDATE");
          }
        } else if (llmCandidate) {
          // LLM이 후보를 반환했지만 점수 미달
          log.info({ taskId, agentId, llm_next: llmCandidate.name, score: llmCandidate.score, adopted: false, reason: `score_below_threshold(${scoreThreshold})` }, "LLM_CANDIDATE");
        }
        // llmCandidate === null: API 키 미설정, 타임아웃, 파싱 실패 등 → 조용히 무시
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ─── [Phase 2] Multi-Hop 실행 ────────────────────────────────────────────
    // ── Step 2: 3-hop Soft Budget Gate ────────────────────────────────────────
    {
      const _nextHop = (_hopContext?.hopCount ?? 0) + 1;
      const _sb      = Number(process.env.SOFT_BUDGET_MS ?? "0");
      const _cs      = _hopContext?.chainStartTime ?? taskStartTime;
      const _elapsed = Date.now() - _cs;
      if (_nextHop >= 2 && _sb > 0 && _elapsed >= _sb * 0.8) {
        log.warn({ taskId, elapsedMs: _elapsed, threshold: Math.round(_sb * 0.8), agentId, nextHop: _nextHop }, "HOP3_BLOCKED_BY_SOFT_BUDGET");
        nextCandidates = [];  // 다음 hop 강제 차단
      }
    }

    // ─── [Phase 2] Multi-Hop 실행 + Tiered Budget (Soft/Hard) ───────────────
    if (
      process.env.ENABLE_MULTI_HOP_EXECUTION === "true" &&
      nextCandidates.length > 0 &&
      displayContent &&
      displayContent !== "(응답 없음)" &&
      (_hopContext?.hopCount ?? 0) < Number(process.env.MAX_HOP_LIMIT ?? "3") &&
      !_hopContext?.forcedLastHop   // Soft Budget에 의해 강제 종료된 경우 체인 차단
    ) {
      const nextAgent = nextCandidates[0] as AgentId;

      // 체인 시작 시각: 최상위 hop에서 taskStartTime으로 초기화, 이후 hop은 전달받은 값 사용
      const chainStartTime = _hopContext?.chainStartTime ?? taskStartTime;
      // 체인 루트 taskId: 최상위 taskId를 텔레메트리 집계 키로 사용
      const chainRootTaskId = _hopContext?.chainRootTaskId ?? taskId;

      const runtimeBudgetMs = Number(process.env.RUNTIME_BUDGET_MS ?? "120000");
      const softBudgetMs    = Number(process.env.SOFT_BUDGET_MS    ?? "0");  // 0 = 비활성
      const elapsedMs = Date.now() - chainStartTime;

      if (elapsedMs >= runtimeBudgetMs) {
        // ── Hard Budget 초과 → 다음 hop 실행 자체를 차단 ─────────────────────
        log.warn({ taskId, hop: (_hopContext?.hopCount ?? 0) + 1, agent: `${agentId}→${nextAgent}`, elapsedMs, budgetMs: runtimeBudgetMs }, "RUNTIME_BUDGET_EXCEEDED");
      } else {
        // ── Soft Budget 체크: 초과 시 다음 hop에 forcedLastHop=true ──────────
        const isSoftExceeded = softBudgetMs > 0 && elapsedMs >= softBudgetMs;
        if (isSoftExceeded) {
          log.warn({ taskId, hop: (_hopContext?.hopCount ?? 0) + 1, agent: `${agentId}→${nextAgent}`, elapsedMs, soft_budget: softBudgetMs }, "SOFT_BUDGET_REACHED");
        }

        const nextHopCtx = {
          hopCount: (_hopContext?.hopCount ?? 0) + 1,
          // 현재 에이전트를 visited에 추가 → 다음 hop에서 reVisit 차단
          visited: [...(_hopContext?.visited ?? []), agentId],
          chainStartTime,
          chainRootTaskId,    // 텔레메트리 집계 키 전달
          // Soft Budget 초과 시 다음 hop이 추가 체인 불가하도록 표시
          forcedLastHop: isSoftExceeded,
        };

        // hop 전환 이벤트 emit — UI에서 새 에이전트 시작 표시
        yield {
          type: "routing" as const,
          agent: nextAgent,
          method: "explicit" as const,
          sourceAgent: agentId,
          targetAgent: nextAgent,
          reason: `[Phase 2] Multi-Hop chain: ${agentId} → ${nextAgent} (hop ${nextHopCtx.hopCount}${isSoftExceeded ? ", last" : ""})`,
          hopCount: nextHopCtx.hopCount,
          nextCandidates: [],
        };

        log.info({ taskId, hop: nextHopCtx.hopCount, chain: `${agentId} → ${nextAgent}`, visited: nextHopCtx.visited, softBudgetLast: isSoftExceeded }, "HOP_CHAIN");

        // 텔레메트리: 체인 루트 기준 hop 카운터 증가
        incrementChainHopCount(chainRootTaskId);

        // 다음 에이전트 실행 (generator 위임 — yield*는 모든 이벤트 완료 후 재개)
        yield* processUserMessage(
          `[이전 에이전트 ${agentId}의 분석 결과]\n\n${displayContent}`,
          conversationId,
          nextAgent,
          undefined,  // 다음 홉에서는 projectDefaultAgent 불필요
          nextHopCtx,
        );

      }

      // [METRIC] CHAIN_SUMMARY + CHAIN_HOP_COUNT: 최상위 hop에서만 1회 출력
      // Hard Budget 초과(BUDGET_EXCEEDED) + 정상 완료(COMPLETED) 모두 처리
      if (!_hopContext) {
        const totalElapsed = Date.now() - chainStartTime;
        const totalHops = (getChainHopCount(taskId)) + 1; // 현재 hop 포함
        deleteChainHopCount(taskId); // 메모리 정리
        log.info({ taskId, total_hops: totalHops, agents: [agentId, nextAgent] }, "CHAIN_HOP_COUNT");
        log.info({ taskId, durationMs: totalElapsed, hopCount: totalHops, status: elapsedMs >= runtimeBudgetMs ? "BUDGET_EXCEEDED" : "COMPLETED", agents: elapsedMs >= runtimeBudgetMs ? agentId : [agentId, nextAgent].join(",") }, "CHAIN_SUMMARY");
      }
    }
    // ─────────────────────────────────────────────────────────────────────────
    // 단일 hop 또는 멀티홉 미실행 시 CHAIN_SUMMARY 보완 (최상위 hop에만 출력)
    // Multi-Hop 블록 내 CHAIN_SUMMARY는 nextCandidates.length > 0 일 때만 출력되므로
    // 단일 hop 또는 nextCandidates 없는 경우 여기서 보완하여 리포트 데이터 확보
    if (!_hopContext && !(
      process.env.ENABLE_MULTI_HOP_EXECUTION === "true" &&
      (routingResult.nextCandidates?.length ?? 0) > 0
    )) {
      const singleHopElapsed = Date.now() - taskStartTime;
      log.info({ taskId, durationMs: singleHopElapsed, hopCount: 1, status: "COMPLETED", agents: agentId }, "CHAIN_SUMMARY");
    }
  }

  setTimeout(() => {
    setAgentStatus(agentId, "idle");
  }, 3000);

  yield {
    type: "done" as const,
    summary: "작업이 완료되었습니다.",
  };
}
