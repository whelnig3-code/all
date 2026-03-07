"use client";

/**
 * 대시보드 로그인 페이지
 *
 * 비유: 아파트 정문 로비.
 * - 단일 테넌트: 관리소장 키(DASHBOARD_SECRET)만 확인
 * - 멀티 테넌트: 관리소장 키 또는 입주자 카드키(API 키) 중 선택
 */

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

type AuthMode = "admin" | "apiKey";

export default function LoginPage() {
  const [authMode,     setAuthMode]     = useState<AuthMode>("admin");
  const [token,        setToken]        = useState("");
  const [apiKey,       setApiKey]       = useState("");
  const [error,        setError]        = useState("");
  const [loading,      setLoading]      = useState(false);
  const [multiTenant,  setMultiTenant]  = useState(false);
  const inputRef    = useRef<HTMLInputElement>(null);
  const apiKeyRef   = useRef<HTMLInputElement>(null);
  const router      = useRouter();

  // 페이지 로드 시: 멀티 테넌트 모드 확인 + 입력창 포커스
  useEffect(() => {
    fetch("/api/auth/mode")
      .then((r) => r.json())
      .then((data) => {
        if (data.multiTenant) {
          setMultiTenant(true);
          setAuthMode("apiKey");
        }
      })
      .catch(() => {});
    inputRef.current?.focus();
  }, []);

  // 탭 전환 시 포커스 이동
  useEffect(() => {
    if (authMode === "admin") {
      inputRef.current?.focus();
    } else {
      apiKeyRef.current?.focus();
    }
  }, [authMode]);

  const currentValue = authMode === "admin" ? token : apiKey;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentValue.trim()) return;
    setLoading(true);
    setError("");

    const body = authMode === "admin"
      ? { token: currentValue }
      : { apiKey: currentValue };

    try {
      const res = await fetch("/api/auth", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });

      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        const errMsg = authMode === "admin"
          ? "잘못된 접속 토큰입니다. 다시 확인해주세요."
          : "유효하지 않은 API 키입니다. 다시 확인해주세요.";
        setError(errMsg);
        if (authMode === "admin") {
          setToken("");
          inputRef.current?.focus();
        } else {
          setApiKey("");
          apiKeyRef.current?.focus();
        }
      }
    } catch {
      setError("서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }

  const tabStyle = (active: boolean) => ({
    flex: 1,
    padding: "8px 0",
    background: active ? "var(--card-hover)" : "transparent",
    border: "none",
    borderRadius: 6,
    color: active ? "var(--text1)" : "var(--text3)",
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    cursor: "pointer" as const,
    transition: "all 0.15s",
  });

  return (
    <div style={{
      display:         "flex",
      alignItems:      "center",
      justifyContent:  "center",
      minHeight:       "100vh",
      background:      "var(--bg)",
      fontFamily:      "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <div style={{
        background:   "var(--card)",
        border:       "1px solid var(--border)",
        borderRadius: 16,
        padding:      "40px 48px",
        width:        "100%",
        maxWidth:     400,
        boxShadow:    "0 8px 32px rgba(0,0,0,0.4)",
      }}>
        {/* 로고 영역 */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 28, marginBottom: 8, lineHeight: 1 }}>
            🤖
          </div>
          <h1 style={{
            margin: 0, fontSize: 20, fontWeight: 700,
            color: "var(--text1)", letterSpacing: "-0.02em",
          }}>
            JM Agent Team
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text3)" }}>
            {multiTenant
              ? "로그인 방식을 선택하세요"
              : "대시보드 접속 토큰을 입력하세요"}
          </p>
        </div>

        {/* 멀티 테넌트: 탭 전환 */}
        {multiTenant && (
          <div style={{
            display: "flex",
            gap: 4,
            marginBottom: 20,
            padding: 3,
            background: "var(--bg)",
            borderRadius: 8,
          }}>
            <button
              type="button"
              onClick={() => setAuthMode("apiKey")}
              style={tabStyle(authMode === "apiKey")}
            >
              API 키 로그인
            </button>
            <button
              type="button"
              onClick={() => setAuthMode("admin")}
              style={tabStyle(authMode === "admin")}
            >
              관리자 로그인
            </button>
          </div>
        )}

        {/* 로그인 폼 */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            {authMode === "admin" ? (
              <>
                <label style={{
                  display: "block", fontSize: 12, fontWeight: 600,
                  color: "var(--text2)", marginBottom: 6,
                  letterSpacing: "0.04em", textTransform: "uppercase",
                }}>
                  접속 토큰
                </label>
                <input
                  ref={inputRef}
                  type="password"
                  value={token}
                  onChange={e => setToken(e.target.value)}
                  placeholder="DASHBOARD_SECRET 값 입력"
                  disabled={loading}
                  autoComplete="current-password"
                  style={inputStyle(!!error)}
                  onFocus={e => { e.currentTarget.style.borderColor = "var(--accent)"; }}
                  onBlur={e  => { e.currentTarget.style.borderColor = error ? "var(--error)" : "var(--border)"; }}
                />
              </>
            ) : (
              <>
                <label style={{
                  display: "block", fontSize: 12, fontWeight: 600,
                  color: "var(--text2)", marginBottom: 6,
                  letterSpacing: "0.04em", textTransform: "uppercase",
                }}>
                  API 키
                </label>
                <input
                  ref={apiKeyRef}
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="jmat_ 로 시작하는 API 키 입력"
                  disabled={loading}
                  autoComplete="off"
                  style={inputStyle(!!error)}
                  onFocus={e => { e.currentTarget.style.borderColor = "var(--accent)"; }}
                  onBlur={e  => { e.currentTarget.style.borderColor = error ? "var(--error)" : "var(--border)"; }}
                />
              </>
            )}
          </div>

          {/* 에러 메시지 */}
          {error && (
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 10px",
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 6, marginBottom: 16,
            }}>
              <span style={{ fontSize: 14 }}>⚠️</span>
              <span style={{ fontSize: 13, color: "var(--error)" }}>{error}</span>
            </div>
          )}

          {/* 로그인 버튼 */}
          <button
            type="submit"
            disabled={loading || !currentValue.trim()}
            style={{
              width: "100%", padding: "11px 0",
              background: loading || !currentValue.trim() ? "rgba(37,99,235,0.25)" : "var(--accent)",
              color: loading || !currentValue.trim() ? "rgba(37,99,235,0.5)" : "#ffffff",
              border: "none", borderRadius: 8,
              fontSize: 14, fontWeight: 600,
              cursor: loading || !currentValue.trim() ? "not-allowed" : "pointer",
              transition: "background 0.15s, transform 0.1s",
              letterSpacing: "0.01em",
            }}
          >
            {loading ? "인증 중..." : "대시보드 접속"}
          </button>
        </form>

        {/* 하단 안내 */}
        <p style={{
          marginTop: 24, fontSize: 12, color: "var(--text3)",
          textAlign: "center", lineHeight: 1.5,
        }}>
          {authMode === "admin" ? (
            <>
              접속 토큰은{" "}
              <code style={codeStyle}>.env.local</code>의{" "}
              <code style={codeStyle}>DASHBOARD_SECRET</code> 값입니다.
            </>
          ) : (
            <>
              API 키는 관리자에게 발급받은{" "}
              <code style={codeStyle}>jmat_</code> 접두사 키입니다.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

const inputStyle = (hasError: boolean): React.CSSProperties => ({
  width: "100%", padding: "10px 12px",
  background: "var(--bg)",
  border: `1px solid ${hasError ? "var(--error)" : "var(--border)"}`,
  borderRadius: 8, color: "var(--text1)", fontSize: 14,
  outline: "none", boxSizing: "border-box",
  transition: "border-color 0.15s",
});

const codeStyle: React.CSSProperties = {
  color: "var(--text2)", background: "var(--bg)",
  padding: "1px 4px", borderRadius: 3,
};
