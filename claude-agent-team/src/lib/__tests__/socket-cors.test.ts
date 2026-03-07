import { describe, it, expect } from "vitest";

/**
 * Socket.IO CORS 설정 로직 순수 함수 테스트
 *
 * buildCorsConfig()를 테스트하여 env에 따른 CORS 분기를 검증합니다.
 */

interface CorsConfig {
  origin: string | false;
  methods: string[];
  credentials: boolean;
}

// socket-server.ts에서 추출할 순수 함수 (테스트 대상)
function buildCorsConfig(allowedOrigin?: string): CorsConfig {
  if (allowedOrigin) {
    return { origin: allowedOrigin, methods: ["GET", "POST"], credentials: true };
  }
  // 미설정 시: CORS 비활성화 (same-origin만 허용), credentials 비활성화
  return { origin: false, methods: ["GET", "POST"], credentials: false };
}

describe("buildCorsConfig", () => {
  it("ALLOWED_ORIGIN 미설정 시 origin: false, credentials: false", () => {
    const config = buildCorsConfig(undefined);
    expect(config.origin).toBe(false);
    expect(config.credentials).toBe(false);
  });

  it("ALLOWED_ORIGIN 설정 시 해당 origin, credentials: true", () => {
    const config = buildCorsConfig("https://my-app.example.com");
    expect(config.origin).toBe("https://my-app.example.com");
    expect(config.credentials).toBe(true);
  });

  it("methods는 항상 GET, POST", () => {
    const withOrigin = buildCorsConfig("https://foo.com");
    const withoutOrigin = buildCorsConfig(undefined);
    expect(withOrigin.methods).toEqual(["GET", "POST"]);
    expect(withoutOrigin.methods).toEqual(["GET", "POST"]);
  });
});
