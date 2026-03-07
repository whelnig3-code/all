"use client";

import { memo, useState, useEffect } from "react";
import { ChatMessage as ChatMessageType } from "@/types";
import { AGENTS_CONFIG } from "@/config/agents";
import { renderMarkdown } from "@/lib/utils/markdown";

interface ChatMessageProps {
  message: ChatMessageType;
}

// 코드 블록 접기 기준: 줄 수가 이 값을 초과하면 기본 접힘 상태
const CODE_COLLAPSE_THRESHOLD = 20;

// ── highlight.js 타입 (CDN으로 로드, window.hljs) ──────────────────────────
declare global {
  interface Window {
    hljs?: {
      highlight: (code: string, opts: { language: string }) => { value: string };
      highlightAuto: (code: string) => { value: string };
      getLanguage: (lang: string) => unknown;
    };
  }
}

/** 코드를 highlight.js로 하이라이팅 (CDN 로드 완료 시) */
function highlightCode(code: string, lang: string): string {
  try {
    const hljs = window.hljs;
    if (!hljs) return code;
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    return hljs.highlightAuto(code).value;
  } catch {
    return code;
  }
}

// renderMarkdown is now imported from @/lib/utils/markdown

// ─── 코드 블록 컴포넌트 ────────────────────────────────────────────────────────
function CodeBlock({ lang, children }: { lang: string; children: string }) {
  const [copied, setCopied] = useState(false);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const lineCount = children.split("\n").length;
  const isLong = lineCount > CODE_COLLAPSE_THRESHOLD;
  const [collapsed, setCollapsed] = useState(isLong);

  // CDN 로드 후 하이라이팅 적용
  useEffect(() => {
    if (window.hljs) {
      setHighlighted(highlightCode(children, lang));
    } else {
      // hljs 아직 로드 안됨 → 이벤트로 대기
      const onLoad = () => setHighlighted(highlightCode(children, lang));
      window.addEventListener("hljsLoaded", onLoad);
      return () => window.removeEventListener("hljsLoaded", onLoad);
    }
  }, [children, lang]);

  const handleCopy = () => {
    navigator.clipboard.writeText(children).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      style={{
        background: "#0D1117",
        borderRadius: 8,
        margin: "8px 0",
        border: "1px solid rgba(255,255,255,0.08)",
        overflow: "hidden",
      }}
    >
      {/* 코드 블록 헤더: 언어 배지 + 접기/펼치기 + 복사 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 12px",
          borderBottom: collapsed ? "none" : "1px solid rgba(255,255,255,0.06)",
          background: "rgba(255,255,255,0.03)",
        }}
      >
        {/* 언어 배지 */}
        <span
          style={{
            fontSize: 10,
            color: "#6B7280",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {lang || "code"}
        </span>

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {/* 접기/펼치기 버튼 (긴 코드만) */}
          {isLong && (
            <button
              onClick={() => setCollapsed((c) => !c)}
              style={{
                background: "none",
                border: "none",
                color: "#9CA3AF",
                cursor: "pointer",
                fontSize: 11,
                padding: "2px 6px",
              }}
            >
              {collapsed ? "펼치기" : "접기"}
            </button>
          )}
          {/* 복사 버튼 */}
          <button
            onClick={handleCopy}
            style={{
              background: "none",
              border: "none",
              color: copied ? "#22C55E" : "#9CA3AF",
              cursor: "pointer",
              fontSize: 11,
              padding: "2px 6px",
            }}
          >
            {copied ? "복사됨" : "복사"}
          </button>
        </div>
      </div>

      {/* 코드 내용 */}
      {!collapsed && (
        <pre
          style={{
            margin: 0,
            padding: "12px 16px",
            overflowX: "auto",
            fontSize: 13,
            lineHeight: 1.6,
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            color: "#E5E7EB",
          }}
        >
          {highlighted ? (
            <code
              className={`hljs language-${lang || "plaintext"}`}
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
          ) : (
            <code>{children}</code>
          )}
        </pre>
      )}
    </div>
  );
}

// ─── 메인 ChatMessage 컴포넌트 ───────────────────────────────────────────────
function ChatMessageComponent({ message }: ChatMessageProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  // 에이전트 설정 조회 (아이콘, 색상)
  const agentConfig = message.agentId
    ? AGENTS_CONFIG[message.agentId as keyof typeof AGENTS_CONFIG]
    : null;

  // 마크다운에서 코드 블록을 분리하여 CodeBlock 컴포넌트로 렌더링
  const renderContent = (content: string) => {
    const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let idx = 0;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      // 코드 블록 앞 텍스트 처리
      if (match.index > lastIndex) {
        const textPart = content.slice(lastIndex, match.index);
        parts.push(
          <div
            key={`text-${idx++}`}
            className="markdown-body"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(textPart) }}
          />
        );
      }
      // 코드 블록 처리
      parts.push(
        <CodeBlock key={`code-${idx++}`} lang={match[1]} >
          {match[2].trim()}
        </CodeBlock>
      );
      lastIndex = match.index + match[0].length;
    }

    // 나머지 텍스트 처리
    if (lastIndex < content.length) {
      const remaining = content.slice(lastIndex);
      parts.push(
        <div
          key={`text-${idx++}`}
          className="markdown-body"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(remaining) }}
        />
      );
    }

    return parts.length > 0 ? parts : (
      <div
        className="markdown-body"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
      />
    );
  };

  if (isSystem) {
    return (
      <div
        style={{
          textAlign: "center",
          color: "#6B7280",
          fontSize: 12,
          padding: "4px 0",
        }}
      >
        {message.content}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: isUser ? "row-reverse" : "row",
        alignItems: "flex-start",
        gap: 10,
        marginBottom: 16,
      }}
    >
      {/* 에이전트 아이콘 (사용자 메시지는 생략) */}
      {!isUser && (
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: agentConfig?.color
              ? `${agentConfig.color}22`
              : "rgba(139,92,246,0.15)",
            border: `1px solid ${agentConfig?.color ?? "#8B5CF6"}44`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            flexShrink: 0,
          }}
        >
          {agentConfig?.icon ?? "🤖"}
        </div>
      )}

      {/* 메시지 버블 */}
      <div
        style={{
          maxWidth: "80%",
          background: isUser
            ? "rgba(139,92,246,0.15)"
            : "rgba(255,255,255,0.04)",
          border: `1px solid ${isUser ? "rgba(139,92,246,0.3)" : "rgba(255,255,255,0.08)"}`,
          borderRadius: isUser ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
          padding: "10px 14px",
        }}
      >
        {/* 에이전트 이름 */}
        {!isUser && agentConfig && (
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: agentConfig.color,
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {agentConfig.name}
          </div>
        )}

        {/* 메시지 내용 */}
        {renderContent(message.content)}

        {/* 스트리밍 커서 */}
        {message.isStreaming && (
          <span className="streaming-cursor" />
        )}

        {/* 타임스탬프 */}
        <div
          style={{
            fontSize: 10,
            color: "#4B5563",
            marginTop: 4,
            textAlign: isUser ? "left" : "right",
          }}
        >
          {message.timestamp.toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    </div>
  );
}

export default memo(ChatMessageComponent);
