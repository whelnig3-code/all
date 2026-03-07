"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io as socketIO } from "socket.io-client";

interface TerminalLine {
  id: number;
  type: "prompt" | "output" | "error";
  text: string;
}

// ANSI 이스케이프 코드 제거
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[mGKHFJABCDSTlu]/g, "").replace(/\r/g, "");
}

let lineIdCounter = 0;

export default function TerminalPanel() {
  const [lines, setLines] = useState<TerminalLine[]>([
    { id: lineIdCounter++, type: "output", text: "JM Agent Terminal — 연결 중...\n" },
  ]);
  const [input, setInput] = useState("");
  const [cwd, setCwd] = useState("~");
  const [isRunning, setIsRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [connected, setConnected] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const socketRef = useRef<any>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addLine = useCallback((type: TerminalLine["type"], text: string) => {
    setLines((prev) => [...prev, { id: lineIdCounter++, type, text }]);
  }, []);

  // 자동 스크롤
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [lines]);

  // Socket.IO 연결
  useEffect(() => {
    // withCredentials: jm_auth 쿠키 자동 첨부 (외부 접속 시 인증 쿠키 전달)
    const manager = socketIO({ path: "/socket.io", autoConnect: false, transports: ["websocket", "polling"], withCredentials: true });
    const terminal = manager.io.socket("/terminal");
    socketRef.current = terminal;

    terminal.on("connect", () => {
      setConnected(true);
    });

    terminal.on("terminal:ready", ({ cwd: initCwd }: { cwd: string }) => {
      setCwd(initCwd);
      setLines([{ id: lineIdCounter++, type: "output", text: `터미널 준비됨 — ${initCwd}\n` }]);
    });

    terminal.on("terminal:output", ({ data }: { data: string }) => {
      const cleaned = stripAnsi(data);
      if (!cleaned) return;
      setLines((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.type === "output") {
          return [...prev.slice(0, -1), { ...last, text: last.text + cleaned }];
        }
        return [...prev, { id: lineIdCounter++, type: "output", text: cleaned }];
      });
    });

    terminal.on("terminal:done", ({ code, cwd: newCwd }: { code: number; cwd: string }) => {
      setCwd(newCwd);
      setIsRunning(false);
      if (code !== 0) {
        addLine("error", `[종료 코드: ${code}]\n`);
      }
    });

    terminal.on("disconnect", () => {
      setConnected(false);
      addLine("error", "\n[연결 끊김]\n");
    });

    terminal.on("connect_error", () => {
      addLine("error", "\n[연결 오류 — 재시도 중...]\n");
    });

    manager.connect();

    return () => {
      terminal.disconnect();
      manager.disconnect();
    };
  }, [addLine]);

  const shortCwd = cwd.length > 40 ? "..." + cwd.slice(-37) : cwd;

  const handleSubmit = useCallback(() => {
    const cmd = input.trim();
    if (!cmd || isRunning || !connected) return;

    setHistory((prev) => [cmd, ...prev.slice(0, 99)]);
    setHistoryIdx(-1);
    addLine("prompt", `${shortCwd} $ ${cmd}`);
    setInput("");
    setIsRunning(true);
    socketRef.current?.emit("terminal:command", { command: cmd });
  }, [input, isRunning, connected, addLine, shortCwd]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHistoryIdx((prev) => {
        const next = Math.min(prev + 1, history.length - 1);
        setInput(history[next] ?? "");
        return next;
      });
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHistoryIdx((prev) => {
        const next = Math.max(prev - 1, -1);
        setInput(next === -1 ? "" : history[next] ?? "");
        return next;
      });
    } else if (e.key === "c" && e.ctrlKey) {
      e.preventDefault();
      if (isRunning) {
        socketRef.current?.emit("terminal:interrupt");
        addLine("error", "^C\n");
        setIsRunning(false);
      }
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      setLines([]);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#0A0A0B",
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
        fontSize: 13,
      }}
      onClick={() => inputRef.current?.focus()}
    >
      {/* 헤더 */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        flexShrink: 0,
        background: "#0C0C0F",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>⌨️</span>
          <span style={{ fontSize: 12, color: "#9CA3AF", fontWeight: 600 }}>터미널</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: connected ? "#22C55E" : "#EF4444",
          }} />
          <span style={{ fontSize: 10, color: "#4B5563" }}>{connected ? "연결됨" : "연결 중..."}</span>
          <button
            onClick={(e) => { e.stopPropagation(); setLines([]); }}
            style={{ background: "none", border: "none", color: "#4B5563", cursor: "pointer", fontSize: 11, padding: "2px 6px", borderRadius: 4 }}
            title="화면 지우기 (Ctrl+L)"
          >
            지우기
          </button>
        </div>
      </div>

      {/* 출력 영역 */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "12px 16px",
        lineHeight: 1.6,
        cursor: "text",
      }}>
        {lines.map((line) => (
          <div
            key={line.id}
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              color: line.type === "prompt"
                ? "#A78BFA"
                : line.type === "error"
                  ? "#F87171"
                  : "#D1D5DB",
              marginBottom: line.type === "prompt" ? 2 : 0,
            }}
          >
            {line.text}
          </div>
        ))}
        {isRunning && (
          <div style={{ color: "#6B7280", display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E", animation: "pulse-glow 1s ease-in-out infinite" }} />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 입력 영역 */}
      <div style={{
        borderTop: "1px solid rgba(255,255,255,0.06)",
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexShrink: 0,
        background: "#0C0C0F",
      }}>
        <span style={{ color: "#A78BFA", fontSize: 12, flexShrink: 0, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {shortCwd} $
        </span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!connected}
          placeholder={connected ? "" : "연결 대기 중..."}
          autoFocus
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#F5F5F5",
            fontFamily: "inherit",
            fontSize: 13,
            caretColor: "#A78BFA",
          }}
        />
        {isRunning && (
          <button
            onClick={() => {
              socketRef.current?.emit("terminal:interrupt");
              addLine("error", "^C\n");
              setIsRunning(false);
            }}
            style={{
              background: "rgba(239,68,68,0.15)",
              border: "1px solid rgba(239,68,68,0.3)",
              color: "#F87171",
              cursor: "pointer",
              fontSize: 10,
              padding: "2px 8px",
              borderRadius: 4,
              flexShrink: 0,
            }}
          >
            Ctrl+C
          </button>
        )}
      </div>
    </div>
  );
}
