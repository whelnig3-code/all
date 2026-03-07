import { marked } from "marked";

/** 마크다운 문자열을 HTML로 변환 (동기, side-effect 없음) */
export function renderMarkdown(text: string): string {
  try {
    return marked.parse(text, { breaks: true, gfm: true }) as string;
  } catch {
    return text;
  }
}
