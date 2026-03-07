/**
 * rate-limiter.ts — Sliding Window Rate Limiter
 *
 * 비유: 놀이공원 입장 게이트. 시간당 N명까지만 입장 허용하고,
 * 시간이 지나면 자동으로 카운트가 리셋된다. 각 방문자(IP/키)는
 * 독립적인 카운터를 가진다.
 *
 * 특징:
 * - Sliding Window: 고정 구간이 아닌 각 요청 시점 기준 N초 내 요청 수 계산
 * - In-Memory: 서버 재시작 시 리셋 (단일 인스턴스 기준)
 * - 자동 정리: 만료된 엔트리를 주기적으로 정리하여 메모리 누수 방지
 * - 순수 함수 패턴: side-effect는 Map 내부로 격리
 */

// ─── 타입 정의 ──────────────────────────────────────────────────────────────

/** Rate Limiter 설정 */
export interface RateLimitConfig {
  /** 윈도우 내 허용 최대 요청 수 */
  readonly maxRequests: number;
  /** 윈도우 크기 (밀리초) */
  readonly windowMs: number;
}

/** Rate Limit 체크 결과 */
export interface RateLimitResult {
  /** 요청 허용 여부 */
  readonly allowed: boolean;
  /** 윈도우 내 허용 최대 요청 수 */
  readonly limit: number;
  /** 남은 요청 수 */
  readonly remaining: number;
  /** 차단 시 재시도까지 대기 시간 (ms), 허용 시 0 */
  readonly retryAfterMs: number;
}

/** Rate Limiter 인스턴스 */
export interface RateLimiter {
  /** 키(IP 등)에 대한 요청 허용 여부 확인 + 카운트 증가 */
  readonly check: (key: string) => RateLimitResult;
  /** 특정 키의 카운트 초기화 */
  readonly reset: (key: string) => void;
}

// ─── 프리셋 ─────────────────────────────────────────────────────────────────

/** 엔드포인트별 Rate Limit 프리셋 */
export const RATE_LIMIT_PRESETS: Record<string, RateLimitConfig> = {
  /** /api/chat — Claude API 호출, 가장 비용이 높으므로 엄격 */
  chat: { maxRequests: 10, windowMs: 60_000 },
  /** /api/* 일반 CRUD — 적당한 수준 */
  api: { maxRequests: 60, windowMs: 60_000 },
  /** /api/auth — 브루트포스 방지, 매우 엄격 */
  auth: { maxRequests: 5, windowMs: 60_000 },
} as const;

// ─── 자동 정리 상수 ──────────────────────────────────────────────────────────

/** 정리 주기: N번 check() 호출마다 만료 엔트리 정리 */
const CLEANUP_INTERVAL = 100;

// ─── 팩토리 함수 ────────────────────────────────────────────────────────────

/**
 * Rate Limiter 인스턴스를 생성합니다.
 *
 * @param config 설정 (기본값: api 프리셋)
 * @returns RateLimiter 인스턴스
 */
export function createRateLimiter(config?: Partial<RateLimitConfig>): RateLimiter {
  const { maxRequests, windowMs }: RateLimitConfig = {
    maxRequests: config?.maxRequests ?? RATE_LIMIT_PRESETS.api.maxRequests,
    windowMs: config?.windowMs ?? RATE_LIMIT_PRESETS.api.windowMs,
  };

  // 키별 요청 타임스탬프 배열 (sliding window의 핵심 데이터)
  const store = new Map<string, number[]>();
  let checkCount = 0;

  /**
   * 만료된 타임스탬프를 필터링하여 현재 윈도우 내 요청만 반환
   */
  function getActiveTimestamps(key: string, now: number): readonly number[] {
    const timestamps = store.get(key);
    if (!timestamps) return [];
    const cutoff = now - windowMs;
    return timestamps.filter((t) => t > cutoff);
  }

  /**
   * 주기적으로 만료된 키를 정리 (메모리 누수 방지)
   */
  function cleanup(now: number): void {
    const cutoff = now - windowMs;
    for (const [key, timestamps] of store) {
      const active = timestamps.filter((t) => t > cutoff);
      if (active.length === 0) {
        store.delete(key);
      } else {
        store.set(key, active);
      }
    }
  }

  function check(key: string): RateLimitResult {
    const now = Date.now();
    checkCount++;

    // 주기적 정리
    if (checkCount % CLEANUP_INTERVAL === 0) {
      cleanup(now);
    }

    const activeTimestamps = getActiveTimestamps(key, now);
    const currentCount = activeTimestamps.length;

    // 제한 초과 → 차단
    if (currentCount >= maxRequests) {
      // 가장 오래된 요청이 만료될 때까지 대기
      const oldest = activeTimestamps[0] ?? now;
      const retryAfterMs = Math.max(0, (oldest + windowMs) - now);
      return {
        allowed: false,
        limit: maxRequests,
        remaining: 0,
        retryAfterMs,
      };
    }

    // 허용 → 타임스탬프 추가
    const updated = [...activeTimestamps, now];
    store.set(key, [...updated]);

    return {
      allowed: true,
      limit: maxRequests,
      remaining: maxRequests - updated.length,
      retryAfterMs: 0,
    };
  }

  function reset(key: string): void {
    store.delete(key);
  }

  return { check, reset };
}

// ─── 테넌트 인식 키 생성 ─────────────────────────────────────────────────────

/**
 * Rate limit 키를 생성합니다.
 * 멀티 테넌트 모드에서는 tenantId 기반, 그 외에는 IP 기반.
 */
export function getRateLimitKey(req: Request, tenantId?: string): string {
  if (tenantId) return `tenant:${tenantId}`;
  return getClientIp(req);
}

// ─── 미들웨어 헬퍼 (Next.js API Route용) ────────────────────────────────────

/**
 * NextRequest에서 클라이언트 IP를 추출합니다.
 * X-Forwarded-For → X-Real-IP → fallback "anonymous" 순서.
 */
export function getClientIp(req: Request): string {
  const forwarded = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "anonymous";
}

/**
 * Rate Limit 결과를 HTTP 응답 헤더로 변환합니다.
 * RFC 6585 / IETF draft-ietf-httpapi-ratelimit-headers 준수.
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
  };
  if (!result.allowed) {
    headers["Retry-After"] = String(Math.ceil(result.retryAfterMs / 1000));
  }
  return headers;
}

// ─── 순수 함수 export (테스트 호환) ──────────────────────────────────────────

/**
 * 단일 체크 — 외부에서 limiter 인스턴스 없이 사용 가능한 순수 함수 래퍼.
 * 내부적으로 글로벌 싱글턴 사용 (편의용).
 */
const _defaultLimiter = createRateLimiter();

export function checkRateLimit(key: string): RateLimitResult {
  return _defaultLimiter.check(key);
}
