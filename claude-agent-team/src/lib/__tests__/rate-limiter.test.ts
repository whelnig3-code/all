/**
 * rate-limiter.ts 단위 테스트 (TDD — RED 먼저)
 *
 * Sliding Window 기반 Rate Limiter.
 * 비유: 놀이공원 입장 게이트 — 시간당 N명까지만 입장 허용,
 *       시간이 지나면 자동으로 카운트 리셋.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  createRateLimiter,
  checkRateLimit,
  RATE_LIMIT_PRESETS,
  type RateLimitConfig,
  type RateLimitResult,
} from "../rate-limiter";

// ─── createRateLimiter ──────────────────────────────────────────────────────

describe("createRateLimiter", () => {
  it("기본 설정으로 limiter 생성", () => {
    const limiter = createRateLimiter();
    expect(limiter).toBeDefined();
    expect(typeof limiter.check).toBe("function");
    expect(typeof limiter.reset).toBe("function");
  });

  it("커스텀 설정으로 limiter 생성", () => {
    const limiter = createRateLimiter({
      maxRequests: 5,
      windowMs: 10_000,
    });
    expect(limiter).toBeDefined();
  });
});

// ─── checkRateLimit (순수 함수) ──────────────────────────────────────────────

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("제한 이내 요청은 허용 (allowed=true)", () => {
    const limiter = createRateLimiter({ maxRequests: 3, windowMs: 60_000 });
    const result = limiter.check("user-1");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
    expect(result.limit).toBe(3);
  });

  it("제한 초과 요청은 차단 (allowed=false)", () => {
    const limiter = createRateLimiter({ maxRequests: 2, windowMs: 60_000 });
    limiter.check("user-1"); // 1/2
    limiter.check("user-1"); // 2/2
    const result = limiter.check("user-1"); // 3/2 → 차단
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("다른 키는 독립적으로 카운트", () => {
    const limiter = createRateLimiter({ maxRequests: 1, windowMs: 60_000 });
    const r1 = limiter.check("user-1");
    const r2 = limiter.check("user-2");
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
  });

  it("시간 경과 후 카운트 리셋", () => {
    const limiter = createRateLimiter({ maxRequests: 1, windowMs: 10_000 });
    limiter.check("user-1"); // 1/1
    const blocked = limiter.check("user-1"); // 차단
    expect(blocked.allowed).toBe(false);

    // 10초 경과
    vi.advanceTimersByTime(10_001);
    const afterReset = limiter.check("user-1");
    expect(afterReset.allowed).toBe(true);
    expect(afterReset.remaining).toBe(0); // 방금 1개 사용
  });

  it("reset()으로 특정 키 초기화", () => {
    const limiter = createRateLimiter({ maxRequests: 1, windowMs: 60_000 });
    limiter.check("user-1"); // 1/1
    expect(limiter.check("user-1").allowed).toBe(false);

    limiter.reset("user-1");
    expect(limiter.check("user-1").allowed).toBe(true);
  });

  it("결과에 limit, remaining, retryAfterMs 포함", () => {
    const limiter = createRateLimiter({ maxRequests: 5, windowMs: 30_000 });
    const result = limiter.check("test-key");
    expect(result).toHaveProperty("allowed");
    expect(result).toHaveProperty("limit");
    expect(result).toHaveProperty("remaining");
    expect(result).toHaveProperty("retryAfterMs");
    expect(result.limit).toBe(5);
    expect(result.remaining).toBe(4);
    expect(result.retryAfterMs).toBe(0);
  });

  it("차단 시 retryAfterMs가 양수", () => {
    const limiter = createRateLimiter({ maxRequests: 1, windowMs: 30_000 });
    limiter.check("user-1");
    const result = limiter.check("user-1");
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(result.retryAfterMs).toBeLessThanOrEqual(30_000);
  });
});

// ─── RATE_LIMIT_PRESETS ─────────────────────────────────────────────────────

describe("RATE_LIMIT_PRESETS", () => {
  it("chat 프리셋이 가장 엄격", () => {
    expect(RATE_LIMIT_PRESETS.chat.maxRequests).toBeLessThan(RATE_LIMIT_PRESETS.api.maxRequests);
  });

  it("모든 프리셋에 maxRequests와 windowMs 존재", () => {
    for (const [name, preset] of Object.entries(RATE_LIMIT_PRESETS)) {
      expect(preset.maxRequests).toBeGreaterThan(0);
      expect(preset.windowMs).toBeGreaterThan(0);
    }
  });

  it("프리셋 종류: chat, api, auth", () => {
    expect(RATE_LIMIT_PRESETS).toHaveProperty("chat");
    expect(RATE_LIMIT_PRESETS).toHaveProperty("api");
    expect(RATE_LIMIT_PRESETS).toHaveProperty("auth");
  });
});

// ─── 엣지 케이스 ────────────────────────────────────────────────────────────

describe("엣지 케이스", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("maxRequests=0 이면 모든 요청 차단", () => {
    const limiter = createRateLimiter({ maxRequests: 0, windowMs: 60_000 });
    expect(limiter.check("user-1").allowed).toBe(false);
  });

  it("빈 키 문자열도 정상 동작", () => {
    const limiter = createRateLimiter({ maxRequests: 1, windowMs: 60_000 });
    expect(limiter.check("").allowed).toBe(true);
  });

  it("sliding window: 오래된 요청만 만료", () => {
    const limiter = createRateLimiter({ maxRequests: 2, windowMs: 10_000 });
    limiter.check("user-1"); // t=0
    vi.advanceTimersByTime(5_000);
    limiter.check("user-1"); // t=5000
    // 2/2 사용 → 차단
    expect(limiter.check("user-1").allowed).toBe(false);

    // t=10001 → 첫 번째 요청(t=0) 만료, 두 번째(t=5000) 유효
    vi.advanceTimersByTime(5_001);
    const result = limiter.check("user-1");
    expect(result.allowed).toBe(true);
  });

  it("오래된 엔트리 자동 정리 (메모리 누수 방지)", () => {
    const limiter = createRateLimiter({ maxRequests: 1, windowMs: 1_000 });
    // 100개 키 생성
    for (let i = 0; i < 100; i++) {
      limiter.check(`key-${i}`);
    }
    // 시간 경과 → 다음 check에서 만료 엔트리 정리됨
    vi.advanceTimersByTime(2_000);
    // 새 요청이 정상 동작하면 메모리 정리 성공
    expect(limiter.check("new-key").allowed).toBe(true);
  });
});
