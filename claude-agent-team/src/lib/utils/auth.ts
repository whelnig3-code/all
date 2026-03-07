/**
 * 공유 인증 모듈
 * HTTP 미들웨어(server.ts)와 Socket.IO 핸드셰이크(socket-server.ts)에서 공통 사용
 */

/** jm_auth 쿠키 값 추출 */
function extractJmAuthCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  return cookieHeader
    .split(";")
    .find((c) => c.trim().startsWith("jm_auth="))
    ?.trim()
    .slice("jm_auth=".length);
}

/** production 모드 + DASHBOARD_SECRET 설정 여부에 따른 인증 필요 여부 */
function isAuthRequired(): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  return !!process.env.DASHBOARD_SECRET;
}

/**
 * HTTP 요청 인증 검사 (Bearer 토큰 또는 jm_auth 쿠키)
 * server.ts의 createServer 핸들러에서 사용
 */
export function checkHttpAuth(
  authorizationHeader: string | undefined,
  cookieHeader: string | undefined,
): boolean {
  if (!isAuthRequired()) return true;
  const secret = process.env.DASHBOARD_SECRET!;

  if (authorizationHeader === `Bearer ${secret}`) return true;

  return extractJmAuthCookie(cookieHeader) === secret;
}

/**
 * Socket.IO 핸드셰이크 인증 검사 (raw 토큰 또는 jm_auth 쿠키)
 * socket-server.ts의 io.use() 미들웨어에서 사용
 */
export function checkSocketAuth(
  authToken: string | undefined,
  cookieHeader: string | undefined,
): boolean {
  if (!isAuthRequired()) return true;
  const secret = process.env.DASHBOARD_SECRET!;

  if (authToken === secret) return true;

  return extractJmAuthCookie(cookieHeader) === secret;
}
