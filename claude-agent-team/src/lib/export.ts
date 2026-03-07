interface ExportMessage {
  role: "user" | "assistant";
  content: string;
  agentId?: string;
}

interface ExportOptions {
  title: string;
  messages: readonly ExportMessage[];
  exportedAt?: string;
}

/**
 * 대화를 Markdown 형식으로 변환
 * 비유: 채팅 기록을 깔끔한 회의록으로 정리하는 것
 *
 * 순수 함수 — 부수 효과 없음, 동일 입력에 동일 출력 보장.
 */
export function exportConversationToMarkdown(options: ExportOptions): string {
  const { title, messages, exportedAt } = options;
  const lines: readonly string[] = buildLines(title, messages, exportedAt);
  return lines.join("\n");
}

// ─── 내부 헬퍼 (순수) ─────────────────────────────────────────────────────────

function buildLines(
  title: string,
  messages: readonly ExportMessage[],
  exportedAt?: string,
): string[] {
  return [
    ...buildHeader(title, messages.length, exportedAt),
    ...buildBody(messages),
  ];
}

function buildHeader(
  title: string,
  messageCount: number,
  exportedAt?: string,
): string[] {
  return [
    `# ${title}`,
    "",
    `> Exported: ${exportedAt ?? new Date().toISOString()}`,
    `> Messages: ${messageCount}`,
    "",
    "---",
    "",
  ];
}

function buildBody(messages: readonly ExportMessage[]): string[] {
  if (messages.length === 0) {
    return ["*No messages*"];
  }

  return messages.flatMap((msg) => formatMessage(msg));
}

function formatMessage(msg: ExportMessage): string[] {
  const speaker =
    msg.role === "user" ? "**User**" : `**${msg.agentId ?? "Assistant"}**`;

  return [
    `### ${speaker}`,
    "",
    msg.content,
    "",
    "---",
    "",
  ];
}
