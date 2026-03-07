"use client";

import { Component, ReactNode, ErrorInfo } from "react";

interface Props {
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
  readonly label?: string;  // 어느 컴포넌트에서 발생했는지 식별용
}

interface State {
  readonly hasError: boolean;
  readonly error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 프로덕션에서는 에러 로깅 서비스로 전송 가능
    console.error(`[ErrorBoundary:${this.props.label ?? "unknown"}]`, error, info.componentStack);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: 32, color: "#9CA3AF",
        }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#F9FAFB", marginBottom: 8 }}>
            {this.props.label ? `${this.props.label}에서 오류 발생` : "예상치 못한 오류가 발생했습니다"}
          </div>
          <div style={{
            fontSize: 11, color: "#4B5563", fontFamily: "monospace",
            background: "rgba(0,0,0,0.3)", borderRadius: 8,
            padding: "8px 16px", marginBottom: 20, maxWidth: 480,
            wordBreak: "break-all", textAlign: "center",
          }}>
            {this.state.error?.message ?? "알 수 없는 오류"}
          </div>
          <button
            onClick={this.reset}
            style={{
              padding: "8px 20px", borderRadius: 8, border: "none",
              background: "#8B5CF6", color: "#fff",
              cursor: "pointer", fontSize: 13, fontWeight: 600,
            }}
          >
            다시 시도
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
