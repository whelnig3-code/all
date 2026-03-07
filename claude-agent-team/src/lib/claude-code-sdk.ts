/**
 * claude-code-sdk.ts
 *
 * Claude Code CLI subprocess 기반 실행 엔진.
 *
 * ── 동작 방식 ──────────────────────────────────────────────────────────────
 *  `claude --print --output-format stream-json --verbose`
 *  을 child_process.spawn으로 실행하여 stdout의 NDJSON을 파싱합니다.
 *
 * ── CLI 출력 이벤트 구조 (--verbose 모드) ────────────────────────────────────
 *  {"type":"system","subtype":"init",...}
 *  {"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}}
 *  {"type":"assistant","message":{"content":[{"type":"text","text":"..."}],...}}
 *  {"type":"result","subtype":"success","result":"...",...}
 *
 * ── 파싱 전략 ────────────────────────────────────────────────────────────────
 *  1) stream_event.content_block_delta → onStream 직접 호출 (실시간 토큰 스트리밍)
 *  2) assistant 이벤트 → fullResponse 누적 (안전망: stream_event 없을 때 fallback)
 *  3) result 이벤트 → lastResultText 저장 (최종 안전망)
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import type { ClaudeCodeOptions } from "./claude-code";
import { getProjectBase } from "@/lib/utils/env";

// ─────────────────────────────────────────────────────────────────────────────
// stream-json 이벤트 타입 (claude CLI --verbose 출력 형식)
// ─────────────────────────────────────────────────────────────────────────────
interface CLISystemEvent {
  type: "system";
  subtype: "init";
  session_id: string;
}

interface CLIAssistantEvent {
  type: "assistant";
  message: {
    content: Array<
      | { type: "text"; text: string }
      | { type: "tool_use"; id: string; name: string; input: unknown }
    >;
  };
  session_id: string;
}

interface CLIResultEvent {
  type: "result";
  subtype: "success" | "error_during_execution" | string;
  result: string;
  session_id: string;
  total_cost_usd?: number;
  num_turns?: number;
  is_error?: boolean;
}

// --verbose 모드에서 추가되는 stream_event 래퍼
interface CLIStreamEvent {
  type: "stream_event";
  event: {
    type: string;
    index?: number;
    delta?: {
      type: string;
      text?: string;         // text_delta
      partial_json?: string; // input_json_delta (tool_use)
    };
    content_block?: {
      type: string;
      id?: string;
      name?: string;         // tool_use 블록 이름
      text?: string;
    };
    message?: {
      stop_reason?: string;
    };
  };
  session_id: string;
}

type CLIEvent =
  | CLISystemEvent
  | CLIAssistantEvent
  | CLIResultEvent
  | CLIStreamEvent
  | { type: string };

// ─────────────────────────────────────────────────────────────────────────────
// 공통 헬퍼
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 플랫폼에 맞게 claude 실행 명령을 결정합니다.
 * Windows: cmd.exe /C claude.cmd <args>
 * Unix:    claude <args>
 */
function resolveClaudeCmd(args: string[]): [string, string[]] {
  return process.platform === "win32"
    ? ["cmd.exe", ["/C", "claude.cmd", ...args]]
    : ["claude", args];
}

/**
 * Claude Code 실행 환경변수를 준비합니다.
 * CLAUDECODE, CLAUDE_CODE_ENTRYPOINT를 제거하여 중첩 세션 감지를 우회합니다.
 * CLAUDE_CODE_OAUTH_TOKEN은 유지 (인증에 필요).
 */
function buildClaudeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  return env;
}

// ─────────────────────────────────────────────────────────────────────────────
// 대화 히스토리를 프롬프트 앞에 컨텍스트로 삽입
// (claude CLI는 대화 히스토리 파라미터를 직접 지원하지 않음)
// ─────────────────────────────────────────────────────────────────────────────
function buildPromptWithHistory(
  prompt: string,
  history: Array<{ role: "user" | "assistant"; content: string }>
): string {
  if (!history.length) return prompt;

  const MAX_HISTORY_CHARS = 3000;
  const lines: string[] = [];
  let totalLen = 0;
  // 역순으로 최근 메시지부터 수집 (MAX_HISTORY_CHARS 이내)
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    const line = `${h.role === "user" ? "사용자" : "어시스턴트"}: ${h.content}\n\n`;
    if (totalLen + line.length > MAX_HISTORY_CHARS) break;
    lines.push(line);
    totalLen += line.length;
  }
  // 역순 수집이므로 뒤집어 시간순으로 복원
  const historyText = lines.reverse().join("");

  return `[이전 대화 컨텍스트]\n${historyText}---\n[현재 요청]\n${prompt}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Claude CLI subprocess 실행
// ─────────────────────────────────────────────────────────────────────────────
export async function executeViaSDK(options: ClaudeCodeOptions): Promise<string> {
  const {
    prompt,
    systemPrompt,
    conversationHistory = [],
    timeout = 120_000,
    maxTokens,
    onStream,
  } = options;

  const fullPrompt = buildPromptWithHistory(prompt, conversationHistory);

  // ── subprocess 환경 준비 ─────────────────────────────────────────────────
  // Claude Code 중첩 세션 감지 환경변수 제거 (buildClaudeEnv 참조)
  const env = buildClaudeEnv();

  // claude CLI 실행 인수
  const args: string[] = [
    "--print",                        // 비대화형 모드 (-p 단축키)
    "--output-format", "stream-json", // NDJSON 스트리밍 출력
    "--verbose",                      // stream-json에 필수 (없으면 오류) + stream_event 활성화
    "--include-partial-messages",     // 토큰 단위 stream_event 활성화
    "--dangerously-skip-permissions", // 도구 권한 확인 없이 자동 실행
    // Task/TodoWrite 도구 비활성화: 중첩 실행 시 타임아웃 발생하고 상태 추적 불가
    "--disallowed-tools", "Task,TodoWrite",
    // Step 3 (SDK 모드): Claude CLI는 --max-tokens 미지원 → 제거
    // max_tokens 상한은 API 모드(executeViaAPI)에서만 적용됨
  ];

  // 시스템 프롬프트: Windows cmd.exe는 명령줄 8191자 한계가 있으므로
  // --append-system-prompt 대신 stdin 앞에 삽입하는 방식으로 처리
  // (Linux/Mac은 인자 길이 제한이 없으므로 기존 방식 유지)
  let systemPromptForStdin = "";
  if (systemPrompt) {
    if (process.platform === "win32") {
      // Windows: 시스템 프롬프트를 stdin에 포함 (cmd.exe 길이 제한 우회)
      systemPromptForStdin = systemPrompt;
    } else {
      args.push("--append-system-prompt", systemPrompt);
    }
  }

  // 프로젝트 디렉터리 기준 경로 설정
  const cwd = getProjectBase();

  return new Promise<string>((resolve, reject) => {
    let fullResponse = "";      // stream_event 또는 assistant 이벤트에서 누적된 응답
    let lastResultText = "";    // result 이벤트의 최종 텍스트 (최후 안전망)
    let streamedText = "";      // stream_event.content_block_delta에서 누적 (실시간 스트리밍)
    let currentToolName = "";   // 현재 tool_use 블록의 name (content_block_start에서 캡처)
    let stderr = "";
    let settled = false;

    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) {
        console.error("[claude-code-sdk] subprocess 오류:", err.message);
        reject(err);
      } else {
        // ── 안전망 1: stream_event로 누적된 텍스트 우선 사용 ──
        // (assistant 이벤트보다 먼저 옴, 이미 onStream으로 전달됨)
        if (!fullResponse.trim() && streamedText.trim()) {
          fullResponse = streamedText;
        }
        // ── 안전망 2: result.result 텍스트 (onStream 미호출된 경우) ──
        if (!fullResponse.trim() && lastResultText.trim()) {
          onStream?.(lastResultText);
          fullResponse = lastResultText;
        }
        resolve(fullResponse.trim());
      }
    };

    // 타임아웃 처리
    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      done(new Error(`응답 시간 초과 (${timeout / 1000}초)`));
    }, timeout);

    // Windows: claude는 .cmd 래퍼로 설치됨 → cmd.exe로 직접 실행 (보안 경고 없음)
    // Linux/Mac: claude 바이너리 직접 실행
    const [spawnCmd, spawnArgs] = resolveClaudeCmd(args);

    const proc = spawn(spawnCmd, spawnArgs, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // ── stdin으로 프롬프트 전달 ──────────────────────────────────────────────
    // Windows에서 시스템 프롬프트가 있으면 stdin 앞에 삽입 (cmd.exe 길이 제한 우회)
    const stdinContent = systemPromptForStdin
      ? `[System Instructions]\n${systemPromptForStdin}\n\n[User Message]\n${fullPrompt}`
      : fullPrompt;
    proc.stdin.write(stdinContent, "utf8");
    proc.stdin.end();

    // ── stdout: NDJSON 파싱 및 스트리밍 ─────────────────────────────────────
    let buffer = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      // 완전한 줄 단위로 처리 (NDJSON은 줄 바꿈으로 구분)
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // 마지막 불완전한 줄은 버퍼에 보관

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const event: CLIEvent = JSON.parse(trimmed);

          // result 이벤트: 최종 텍스트 저장 (안전망용 — done()에서 활용)
          if (event.type === "result") {
            const re = event as CLIResultEvent;
            if (re.result && re.subtype !== "error_during_execution") {
              lastResultText = re.result;
            }
          }

          handleEvent(
            event,
            onStream,
            (text) => { fullResponse += text; },
            (text) => { streamedText += text; },
            (name) => { currentToolName = name; },
            () => currentToolName,
          );
        } catch {
          // JSON 파싱 실패 시 raw 텍스트로 처리
          if (trimmed && !trimmed.startsWith("{")) {
            onStream?.(trimmed);
            fullResponse += trimmed;
          }
        }
      }
    });

    // ── stderr: 오류 수집 ────────────────────────────────────────────────────
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    // ── 프로세스 종료 ────────────────────────────────────────────────────────
    proc.on("close", (code) => {
      // 버퍼에 남은 내용 처리
      if (buffer.trim()) {
        try {
          const event: CLIEvent = JSON.parse(buffer.trim());
          handleEvent(
            event,
            onStream,
            (text) => { fullResponse += text; },
            (text) => { streamedText += text; },
            (name) => { currentToolName = name; },
            () => currentToolName,
          );
        } catch { /* 무시 */ }
      }

      if (code !== 0 && !fullResponse && !streamedText) {
        // 오류 진단 (알려진 오류 패턴 → 구체적인 안내 메시지)
        if (stderr.includes("not logged in") || stderr.includes("authentication")) {
          done(new Error(
            "Claude Code 로그인이 필요합니다.\n" +
            "터미널에서 실행하세요: claude login"
          ));
        } else if (stderr.includes("cannot be launched inside")) {
          done(new Error(
            "중첩 Claude Code 세션 오류. 환경변수 CLAUDECODE를 해제하세요."
          ));
        } else {
          done(new Error(
            `Claude CLI 오류 (exit ${code})${stderr ? `: ${stderr.slice(0, 300)}` : ""}`
          ));
        }
      } else {
        done();
      }
    });

    proc.on("error", (err) => {
      if (err.message.includes("ENOENT")) {
        done(new Error(
          "claude 명령어를 찾을 수 없습니다.\n" +
          "설치: npm install -g @anthropic-ai/claude-code\n" +
          "로그인: claude login"
        ));
      } else {
        done(err);
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CLIEvent 처리 헬퍼
// ─────────────────────────────────────────────────────────────────────────────
function handleEvent(
  event: CLIEvent,
  onStream: ((chunk: string) => void) | undefined,
  accumulate: (text: string) => void,       // assistant 이벤트 누적
  accumulateStream: (text: string) => void, // stream_event 누적
  setToolName: (name: string) => void,      // tool_use 이름 캡처
  getToolName: () => string,                // tool_use 이름 조회
) {
  switch (event.type) {

    // ── stream_event: --verbose 모드의 실시간 이벤트 ──────────────────────────
    // 토큰 단위 스트리밍 + tool_use 실시간 표시
    case "stream_event": {
      const se = event as CLIStreamEvent;
      const inner = se.event;

      switch (inner.type) {
        // tool_use 블록 시작: 도구 이름 캡처
        case "content_block_start": {
          if (inner.content_block?.type === "tool_use" && inner.content_block.name) {
            setToolName(inner.content_block.name);
            const toolLog = `\n\n🔧 **\`${inner.content_block.name}\`** 실행 중...\n`;
            onStream?.(toolLog);
          }
          break;
        }

        // 텍스트 또는 tool_use 인자 델타 수신
        case "content_block_delta": {
          const delta = inner.delta;
          if (!delta) break;

          if (delta.type === "text_delta" && delta.text) {
            // 텍스트 토큰: 실시간 스트리밍 + 버퍼에 누적
            accumulateStream(delta.text);
            onStream?.(delta.text);
          }
          // input_json_delta (tool_use 인자): 표시하지 않음 (UI 노이즈 방지)
          break;
        }
      }
      break;
    }

    // ── assistant: 완성된 응답 메시지 (stream_event 없는 환경의 fallback) ──────
    case "assistant": {
      const e = event as CLIAssistantEvent;
      for (const block of e.message.content) {
        if (block.type === "text" && block.text) {
          // stream_event로 이미 스트리밍된 경우 중복 방지
          // (streamedText가 비어있을 때만 onStream 호출)
          accumulate(block.text);
          // stream_event로 텍스트가 이미 전달됐으면 onStream 재호출 안 함
          // → agent-manager의 hasStreamedText 플래그로 판단
        } else if (block.type === "tool_use") {
          // tool_use: stream_event.content_block_start에서 이미 표시됐을 수 있음
          // 중복 표시를 피하기 위해 getToolName()과 비교
          if (getToolName() !== block.name) {
            const toolLog = `\n\n🔧 **\`${block.name}\`** 실행 중...\n`;
            onStream?.(toolLog);
          }
        }
      }
      break;
    }

    // ── result: 최종 이벤트 ────────────────────────────────────────────────────
    case "result": {
      const e = event as CLIResultEvent;
      if (e.subtype === "error_during_execution" && e.result) {
        // 실행 오류: 오류 메시지를 스트림으로 표시
        const errMsg = `\n⚠️ 오류 발생: ${e.result}\n`;
        onStream?.(errMsg);
      }
      // 정상 result는 executeViaSDK의 done()에서 안전망으로 처리
      break;
    }
    // system(init), rate_limit_event 등은 무시
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Claude Code CLI 설치 및 인증 상태 확인
// ─────────────────────────────────────────────────────────────────────────────
export async function checkSDKAvailable(): Promise<{
  installed: boolean;
  loggedIn: boolean;
  version?: string;
}> {
  return new Promise((resolve) => {
    const env = buildClaudeEnv();

    const [spawnCmd, spawnArgs] = resolveClaudeCmd(["--version"]);
    const proc = spawn(spawnCmd, spawnArgs, {
      env,
      stdio: ["ignore", "pipe", "ignore"],
    });

    let output = "";
    proc.stdout.on("data", (d: Buffer) => { output += d.toString(); });
    proc.on("close", (code) => {
      if (code !== 0) {
        resolve({ installed: false, loggedIn: false });
        return;
      }
      // 로그인 상태는 짧은 테스트 실행으로 확인
      // (config 명령이 없으므로 간단히 true 반환)
      resolve({ installed: true, loggedIn: true, version: output.trim() });
    });
    proc.on("error", () => resolve({ installed: false, loggedIn: false }));

    setTimeout(() => {
      proc.kill();
      resolve({ installed: false, loggedIn: false });
    }, 5000);
  });
}
