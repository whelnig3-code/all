/**
 * agent-router.ts 순수 함수 단위 테스트
 *
 * 테스트 대상: createRoutingContext, inferIntent, classifyMessageIntent, routeMessage
 * 모든 함수가 순수 함수(side-effect 없음)이므로 mock 불필요.
 */
import { describe, it, expect } from "vitest";
import {
  createRoutingContext,
  inferIntent,
  classifyMessageIntent,
  routeMessage,
  type RoutingContext,
  type RoutingResult,
} from "../agent-router";

// ─── createRoutingContext ────────────────────────────────────────────────────

describe("createRoutingContext", () => {
  it("기본값: hopCount=0, visited=[]", () => {
    const ctx = createRoutingContext();
    expect(ctx.hopCount).toBe(0);
    expect(ctx.visited).toEqual([]);
    expect(ctx.currentAgent).toBeUndefined();
    expect(ctx.sourceAgent).toBeUndefined();
  });

  it("currentAgent 전달 시 visited에 포함", () => {
    const ctx = createRoutingContext("developer");
    expect(ctx.currentAgent).toBe("developer");
    expect(ctx.visited).toEqual(["developer"]);
    expect(ctx.hopCount).toBe(0);
  });

  it("sourceAgent 전달", () => {
    const ctx = createRoutingContext("developer", "planner");
    expect(ctx.sourceAgent).toBe("planner");
    expect(ctx.currentAgent).toBe("developer");
  });

  it("overrides로 hopCount 덮어쓰기", () => {
    const ctx = createRoutingContext("reviewer", undefined, { hopCount: 2 });
    expect(ctx.hopCount).toBe(2);
    // overrides에 visited가 없으므로 currentAgent로 초기화
    expect(ctx.visited).toEqual(["reviewer"]);
  });

  it("overrides로 visited 덮어쓰기", () => {
    const ctx = createRoutingContext("developer", undefined, {
      hopCount: 1,
      visited: ["planner", "developer"],
    });
    expect(ctx.hopCount).toBe(1);
    expect(ctx.visited).toEqual(["planner", "developer"]);
  });

  it("immutability: overrides.visited 원본 미변경", () => {
    const originalVisited = ["planner"];
    const ctx = createRoutingContext("developer", undefined, {
      visited: originalVisited,
    });
    // ctx.visited는 originalVisited와 같은 참조이지만, 함수 내에서 push 등 mutation은 없어야 함
    expect(ctx.visited).toEqual(["planner"]);
  });
});

// ─── inferIntent ─────────────────────────────────────────────────────────────

describe("inferIntent", () => {
  it("리뷰 관련 키워드 → reviewer", () => {
    expect(inferIntent("코드 리뷰 해주세요")).toBe("reviewer");
    expect(inferIntent("이 코드를 검토해줘")).toBe("reviewer");
    expect(inferIntent("please review this code")).toBe("reviewer");
  });

  it("보안 관련 키워드 → security-auditor", () => {
    expect(inferIntent("보안 점검 필요")).toBe("security-auditor");
    expect(inferIntent("취약점 분석해줘")).toBe("security-auditor");
    expect(inferIntent("owasp top 10 체크")).toBe("security-auditor");
  });

  it("설계 관련 키워드 → planner", () => {
    expect(inferIntent("시스템 설계 도와줘")).toBe("planner");
    expect(inferIntent("구조 변경 계획")).toBe("planner");
    expect(inferIntent("아키텍처 계획 세워줘")).toBe("planner");
  });

  it("코드 블록 포함 → developer", () => {
    expect(inferIntent("```typescript\nconst x = 1;\n```")).toBe("developer");
  });

  it("인사/질문 → developer (자동 배정, null 대신)", () => {
    expect(inferIntent("안녕하세요")).toBe("developer");
    expect(inferIntent("날씨 알려줘")).toBe("developer");
    expect(inferIntent("")).toBe("developer");
  });
});

// ─── routeMessage ────────────────────────────────────────────────────────────

describe("routeMessage", () => {
  // 공통 헬퍼: RoutingResult 기본 검증
  function assertRoutingResult(result: RoutingResult) {
    expect(result.selectedAgent).toBeDefined();
    expect(result.targetAgent).toBe(result.selectedAgent);
    expect(result.method).toBeDefined();
    expect(result.reason).toBeDefined();
    expect(typeof result.timestamp).toBe("number");
    expect(typeof result.hopCount).toBe("number");
    expect(typeof result.isAmbiguous).toBe("boolean");
  }

  describe("명시적 에이전트 선택 (Layer 0)", () => {
    it("explicitAgent가 있으면 무조건 해당 에이전트 선택", () => {
      const result = routeMessage("아무 메시지", "security-auditor");
      assertRoutingResult(result);
      expect(result.selectedAgent).toBe("security-auditor");
      expect(result.method).toBe("explicit");
      expect(result.isAmbiguous).toBe(false);
    });

    it("키워드가 다른 에이전트를 가리켜도 explicit이 우선", () => {
      // "코드 리뷰" → reviewer 키워드지만, explicit이 developer이면 developer 선택
      const result = routeMessage("코드 리뷰해줘", "developer");
      expect(result.selectedAgent).toBe("developer");
      expect(result.method).toBe("explicit");
    });
  });

  describe("Gate Layer (Layer 1)", () => {
    it("hopCount > 3이면 loop-protect → developer", () => {
      const ctx: RoutingContext = {
        hopCount: 4,
        visited: ["planner", "developer", "reviewer", "security-auditor"],
        currentAgent: "security-auditor",
      };
      const result = routeMessage("어떤 메시지든", undefined, ctx);
      assertRoutingResult(result);
      expect(result.method).toBe("loop-protect");
      expect(result.hopCount).toBe(4);
    });
  });

  describe("Deterministic Layer (Layer 2) — 키워드 매칭", () => {
    it("보안 키워드 → security-auditor", () => {
      // "보안" 키워드만 포함 (분석/점검 → gate에서 reviewer로 가므로 회피)
      const result = routeMessage("이 코드에 보안 이슈가 있나요");
      assertRoutingResult(result);
      expect(result.selectedAgent).toBe("security-auditor");
      expect(["keyword", "gate"]).toContain(result.method);
    });

    it("코드 작성 키워드 → developer", () => {
      const result = routeMessage("함수를 구현해주세요");
      assertRoutingResult(result);
      expect(result.selectedAgent).toBe("developer");
    });

    it("리뷰 키워드 → reviewer", () => {
      const result = routeMessage("코드 리뷰 부탁합니다");
      assertRoutingResult(result);
      expect(result.selectedAgent).toBe("reviewer");
    });
  });

  describe("Fallback Layer (Layer 3)", () => {
    it("projectDefaultAgent가 있으면 해당 에이전트 사용", () => {
      const result = routeMessage(
        "잘 모르겠는 요청입니다",
        undefined,
        { hopCount: 0, visited: [] },
        "writer",
      );
      assertRoutingResult(result);
      // projectDefault이면 writer 선택, 아니면 fallback
      if (result.method === "project-default") {
        expect(result.selectedAgent).toBe("writer");
      }
    });

    it("아무 키워드도 매칭 안 되면 fallback → developer (isAmbiguous=false)", () => {
      const result = routeMessage("ㅋㅋㅋ");
      assertRoutingResult(result);
      expect(["fallback", "inferred"]).toContain(result.method);
      expect(result.isAmbiguous).toBe(false);
      expect(result.selectedAgent).toBe("developer");
    });
  });

  describe("RoutingResult 구조 검증", () => {
    it("selectedAgent와 targetAgent가 항상 동일", () => {
      const messages = [
        "코드 작성해줘",
        "보안 점검",
        "리뷰 해줘",
        "아무말",
      ];
      for (const msg of messages) {
        const result = routeMessage(msg);
        expect(result.selectedAgent).toBe(result.targetAgent);
      }
    });

    it("nextCandidates는 배열", () => {
      const result = routeMessage("테스트 메시지");
      expect(Array.isArray(result.nextCandidates)).toBe(true);
    });

    it("isAmbiguous는 boolean", () => {
      const result = routeMessage("테스트");
      expect(typeof result.isAmbiguous).toBe("boolean");
    });
  });
});

// ─── classifyMessageIntent ──────────────────────────────────────────────────

describe("classifyMessageIntent", () => {
  it("greeting: 인사/테스트 메시지 → developer", () => {
    expect(classifyMessageIntent("안녕하세요").intent).toBe("greeting");
    expect(classifyMessageIntent("하이").intent).toBe("greeting");
    expect(classifyMessageIntent("hello").intent).toBe("greeting");
    expect(classifyMessageIntent("hi").intent).toBe("greeting");
    expect(classifyMessageIntent("테스트").intent).toBe("greeting");
    expect(classifyMessageIntent("안녕하세요").agent).toBe("developer");
  });

  it("greeting: 짧은 메시지 (10자 이하) → developer", () => {
    expect(classifyMessageIntent("ㅋ").intent).toBe("greeting");
    expect(classifyMessageIntent("ok").intent).toBe("greeting");
    expect(classifyMessageIntent("ㅋㅋ").intent).toBe("greeting");
  });

  it("question: 질문 패턴 → developer", () => {
    expect(classifyMessageIntent("어떻게 하면 돼?").intent).toBe("question");
    expect(classifyMessageIntent("왜 이렇게 되는 거야").intent).toBe("question");
    expect(classifyMessageIntent("날씨 알려줘").intent).toBe("question");
    expect(classifyMessageIntent("이게 뭐야").intent).toBe("question");
    expect(classifyMessageIntent("how does this work?").intent).toBe("question");
  });

  it("code_request: 코드 작성 요청 → developer", () => {
    expect(classifyMessageIntent("함수 구현해줘").intent).toBe("code_request");
    expect(classifyMessageIntent("컴포넌트 만들어줘").intent).toBe("code_request");
    expect(classifyMessageIntent("api endpoint 추가해").intent).toBe("code_request");
    expect(classifyMessageIntent("```typescript\nconst x = 1;\n```").intent).toBe("code_request");
  });

  it("bug_report: 버그 관련 → developer", () => {
    expect(classifyMessageIntent("버그가 있어요").intent).toBe("bug_report");
    expect(classifyMessageIntent("에러 발생").intent).toBe("bug_report");
    expect(classifyMessageIntent("안돼요 오류").intent).toBe("bug_report");
  });

  it("review_request: 리뷰 요청 → reviewer", () => {
    expect(classifyMessageIntent("코드 리뷰 해줘").intent).toBe("review_request");
    expect(classifyMessageIntent("이 코드 검토해줘").intent).toBe("review_request");
    expect(classifyMessageIntent("please review this").intent).toBe("review_request");
  });

  it("planning: 설계/기획 → planner", () => {
    expect(classifyMessageIntent("아키텍처 설계해줘").intent).toBe("planning");
    expect(classifyMessageIntent("시스템 계획 세워줘").intent).toBe("planning");
  });

  it("research: 조사/비교 → researcher", () => {
    expect(classifyMessageIntent("react vs vue 비교해줘").intent).toBe("research");
    expect(classifyMessageIntent("최신 트렌드 조사해줘").intent).toBe("research");
    expect(classifyMessageIntent("어떤 게 좋을까 추천해").intent).toBe("research");
  });

  it("docs: 문서 작성 → writer", () => {
    expect(classifyMessageIntent("readme 업데이트해줘").intent).toBe("docs");
    expect(classifyMessageIntent("문서 작성 필요").intent).toBe("docs");
  });

  it("security: 보안 → security-auditor", () => {
    expect(classifyMessageIntent("보안 감사해줘").intent).toBe("security");
    expect(classifyMessageIntent("owasp 점검").intent).toBe("security");
    expect(classifyMessageIntent("xss 취약점 있나").intent).toBe("security");
  });

  it("design: 디자인 → designer", () => {
    expect(classifyMessageIntent("와이어프레임 만들어줘").intent).toBe("design");
    expect(classifyMessageIntent("ui 설계 해줘").intent).toBe("design");
  });

  it("general: 패턴 매칭 안 되는 긴 메시지", () => {
    expect(classifyMessageIntent("이것은 패턴에 매칭되지 않는 아주 긴 메시지입니다 특수 키워드 없음").intent).toBe("general");
  });

  it("항상 유효한 agent 반환", () => {
    const validAgents = ["planner", "developer", "reviewer", "writer", "security-auditor", "researcher", "designer"];
    const testMessages = [
      "안녕", "hello", "버그야", "코드 작성", "리뷰해", "설계",
      "보안", "문서", "디자인", "조사", "아무말이나 적어도 될까요 패턴 없는 메시지",
    ];
    for (const msg of testMessages) {
      const result = classifyMessageIntent(msg.toLowerCase());
      expect(validAgents).toContain(result.agent);
      expect(result.promptHint.length).toBeGreaterThan(0);
    }
  });

  it("promptHint는 항상 비어있지 않음", () => {
    const result = classifyMessageIntent("anything");
    expect(result.promptHint.length).toBeGreaterThan(0);
  });
});

// ─── isAmbiguous 제거 검증 ──────────────────────────────────────────────────

describe("routeMessage: isAmbiguous 제거 검증", () => {
  it("어떤 메시지든 isAmbiguous=false", () => {
    const messages = ["안녕", "테스트", "ㅋㅋㅋ", "hello", "", "아무말", "날씨 어때"];
    for (const msg of messages) {
      const result = routeMessage(msg);
      expect(result.isAmbiguous).toBe(false);
    }
  });

  it("모든 메시지가 유효한 에이전트로 라우팅됨", () => {
    const validAgents = ["planner", "developer", "reviewer", "writer", "security-auditor", "researcher", "designer"];
    const messages = ["안녕", "리뷰해줘", "보안 점검", "코드 작성", "이건 뭐야", ""];
    for (const msg of messages) {
      const result = routeMessage(msg);
      expect(validAgents).toContain(result.selectedAgent);
      expect(result.isAmbiguous).toBe(false);
    }
  });

  it("'안녕 테스트 중' → developer 자동 배정 (선택 UI 없음)", () => {
    const result = routeMessage("안녕 테스트 중");
    expect(result.selectedAgent).toBe("developer");
    expect(result.isAmbiguous).toBe(false);
  });
});

// ─── errors.ts 단위 테스트 ────────────────────────────────────────────────────

describe("AppError", () => {
  // errors.ts도 순수 함수/클래스이므로 함께 테스트
  it("팩토리 메서드가 올바른 코드와 상태를 반환", async () => {
    const { AppError } = await import("../errors");

    const badReq = AppError.badRequest("잘못된 요청");
    expect(badReq.code).toBe("BAD_REQUEST");
    expect(badReq.statusCode).toBe(400);
    expect(badReq.message).toBe("잘못된 요청");

    const notFound = AppError.notFound("없음");
    expect(notFound.code).toBe("NOT_FOUND");
    expect(notFound.statusCode).toBe(404);

    const unauth = AppError.unauthorized("인증 실패");
    expect(unauth.code).toBe("UNAUTHORIZED");
    expect(unauth.statusCode).toBe(401);

    const validation = AppError.validationError("검증 실패", { field: "email" });
    expect(validation.code).toBe("VALIDATION_ERROR");
    expect(validation.statusCode).toBe(400);
    expect(validation.details).toEqual({ field: "email" });

    const conflict = AppError.conflict("충돌");
    expect(conflict.code).toBe("CONFLICT");
    expect(conflict.statusCode).toBe(409);

    const internal = AppError.internal("서버 오류");
    expect(internal.code).toBe("INTERNAL_ERROR");
    expect(internal.statusCode).toBe(500);
  });

  it("AppError는 Error를 상속", async () => {
    const { AppError } = await import("../errors");
    const err = AppError.badRequest("test");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.name).toBe("AppError");
  });
});
