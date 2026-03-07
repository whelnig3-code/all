/**
 * language-map.ts — 파일 확장자 → 언어 매핑
 *
 * 비유: 도서관의 분류 카드처럼, 파일 이름을 보고 어떤 언어인지 판별한다.
 */

export type LanguageName =
  | "javascript"
  | "typescript"
  | "json"
  | "markdown"
  | "css"
  | "html"
  | "python"
  | "plaintext";

const EXTENSION_MAP: Record<string, LanguageName> = {
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".json": "json",
  ".jsonc": "json",
  ".md": "markdown",
  ".mdx": "markdown",
  ".css": "css",
  ".scss": "css",
  ".less": "css",
  ".html": "html",
  ".htm": "html",
  ".xml": "html",
  ".svg": "html",
  ".py": "python",
  ".pyw": "python",
};

/** 파일 경로에서 언어를 감지. 알 수 없으면 plaintext 반환 */
export function detectLanguage(filePath: string): LanguageName {
  const lastDotIndex = filePath.lastIndexOf(".");
  if (lastDotIndex === -1) return "plaintext";
  const ext = filePath.slice(lastDotIndex).toLowerCase();
  return EXTENSION_MAP[ext] ?? "plaintext";
}
