/**
 * /api/auth — 대시보드 인증 엔드포인트
 *
 * POST: 토큰/API 키 검증 후 HttpOnly 쿠키 발급 (로그인)
 * DELETE: 쿠키 삭제 (로그아웃)
 *
 * 비유: 아파트 정문. 관리소장(DASHBOARD_SECRET)은 마스터키로,
 * 입주자(테넌트)는 카드키(API 키)로 입장한다.
 */

import { NextRequest, NextResponse } from "next/server";
import { loginSchema } from "@/lib/schemas";
import { createRateLimiter, getClientIp, rateLimitHeaders, RATE_LIMIT_PRESETS } from "@/lib/rate-limiter";
import { findTenantByApiKey } from "@/lib/tenant/tenant-store";

// 브루트포스 방지: 분당 5회 제한
const authLimiter = createRateLimiter(RATE_LIMIT_PRESETS.auth);

/**
 * POST /api/auth
 * Body: { token?: string, apiKey?: string }
 *
 * 1. token → DASHBOARD_SECRET 관리자 로그인
 * 2. apiKey → 테넌트 API 키 로그인 (멀티 테넌트 모드)
 */
export async function POST(req: NextRequest) {
  // Rate Limit 체크 (브루트포스 방지)
  const ip = getClientIp(req);
  const rateResult = authLimiter.check(ip);
  if (!rateResult.allowed) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요." } },
      { status: 429, headers: rateLimitHeaders(rateResult) },
    );
  }

  const secret = process.env.DASHBOARD_SECRET;

  // DASHBOARD_SECRET 미설정 시 인증 불필요 (로컬 개발)
  if (!secret) {
    return NextResponse.json({ ok: true, message: "auth disabled (DASHBOARD_SECRET not set)" });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: {} } },
      { status: 400 },
    );
  }

  const parsed = loginSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid input", details: parsed.error.flatten() } },
      { status: 400 },
    );
  }

  const isRemote = process.env.ENABLE_REMOTE_ACCESS === "true";
  const isProduction = process.env.NODE_ENV === "production";
  const cookieOptions = {
    httpOnly: true,
    secure: isRemote || isProduction,
    sameSite: "strict" as const,
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  };

  // ── 분기 1: API 키 로그인 (테넌트) ─────────────────────────────────
  if (parsed.data.apiKey) {
    const tenant = await findTenantByApiKey(parsed.data.apiKey);
    if (!tenant || !tenant.active) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    const res = NextResponse.json({
      ok: true,
      tenant: { id: tenant.id, name: tenant.name },
    });
    // jm_auth 쿠키: 인증 확인용 (기존 server.ts 인증 로직과 호환)
    res.cookies.set("jm_auth", secret, cookieOptions);
    // jm_tenant 쿠키: 테넌트 식별용
    res.cookies.set("jm_tenant", tenant.id, cookieOptions);
    return res;
  }

  // ── 분기 2: DASHBOARD_SECRET 관리자 로그인 ──────────────────────────
  if (parsed.data.token !== secret) {
    console.log(`[SECURITY] AUTH_API_FAILED ip=${req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "unknown"}`);
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("jm_auth", secret, cookieOptions);
  return res;
}

/**
 * DELETE /api/auth
 * 로그아웃: jm_auth + jm_tenant 쿠키 삭제
 */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("jm_auth");
  res.cookies.delete("jm_tenant");
  return res;
}
