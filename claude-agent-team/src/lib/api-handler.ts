import { NextRequest } from "next/server";
import { AppError } from "./errors";
import { createModuleLogger } from "@/lib/logger";
import {
  createRateLimiter,
  getRateLimitKey,
  rateLimitHeaders,
  type RateLimitConfig,
} from "./rate-limiter";
import { getTenantIdFromRequest } from "@/lib/tenant/request-helpers";

const log = createModuleLogger("api-handler");

type ApiHandler = (req: NextRequest, context?: unknown) => Promise<Response>;

export function withErrorHandler(handler: ApiHandler): ApiHandler {
  return async (req: NextRequest, context?: unknown) => {
    try {
      return await handler(req, context);
    } catch (err) {
      if (err instanceof AppError) {
        return Response.json(
          {
            error: {
              code: err.code,
              message: err.message,
              ...(err.details ? { details: err.details } : {}),
            },
          },
          { status: err.statusCode }
        );
      }

      log.error({ err }, "Unexpected error");
      return Response.json(
        { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
        { status: 500 }
      );
    }
  };
}

/**
 * Rate Limit + Error Handler 미들웨어 (조합형)
 *
 * 비유: 놀이공원 입구에 경비원(rate limit)과 안내원(error handler)을 함께 배치.
 * 경비원이 먼저 입장 가능 여부를 확인하고, 통과하면 안내원이 안내.
 *
 * @param handler API 핸들러
 * @param config Rate Limit 설정 (기본값: api 프리셋)
 */
export function withRateLimit(
  handler: ApiHandler,
  config?: Partial<RateLimitConfig>
): ApiHandler {
  const limiter = createRateLimiter(config);

  return withErrorHandler(async (req: NextRequest, context?: unknown) => {
    const key = getRateLimitKey(req, getTenantIdFromRequest(req));
    const result = limiter.check(key);
    const headers = rateLimitHeaders(result);

    if (!result.allowed) {
      return Response.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
            retryAfterMs: result.retryAfterMs,
          },
        },
        { status: 429, headers },
      );
    }

    // Rate limit 통과 → 원래 핸들러 실행, 응답에 rate limit 헤더 추가
    const response = await handler(req, context);

    // 기존 Response에 헤더 추가 (불변 패턴: 새 Response 생성)
    const body = await response.arrayBuffer();
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        ...Object.fromEntries(response.headers.entries()),
        ...headers,
      },
    });
  });
}
