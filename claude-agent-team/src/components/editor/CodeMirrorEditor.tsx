"use client";

/**
 * CodeMirrorEditor — CodeMirror 6 기반 코드 에디터
 *
 * 비유: Monaco가 풀사이즈 피아노라면, CodeMirror 6은 미디 키보드.
 * 대시보드에 피아노를 들여놓을 필요 없다. 가볍고 빠르게.
 */

import { useRef, useEffect } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { detectLanguage, type LanguageName } from "./language-map";

interface CodeMirrorEditorProps {
  readonly value: string;
  readonly filePath: string;
  readonly onChange?: (value: string) => void;
  readonly readOnly?: boolean;
}

/** 언어 이름 → CodeMirror 확장 매핑 */
function getLanguageExtension(lang: LanguageName) {
  switch (lang) {
    case "javascript":
      return javascript({ jsx: true });
    case "typescript":
      return javascript({ jsx: true, typescript: true });
    case "json":
      return json();
    case "markdown":
      return markdown();
    case "css":
      return css();
    case "html":
      return html();
    case "python":
      return python();
    default:
      return [];
  }
}

export default function CodeMirrorEditor({
  value,
  filePath,
  onChange,
  readOnly = false,
}: CodeMirrorEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // 에디터 초기화 + filePath 변경 시 재생성
  useEffect(() => {
    if (!containerRef.current) return;

    const lang = detectLanguage(filePath);

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        oneDark,
        getLanguageExtension(lang),
        EditorView.editable.of(!readOnly),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && onChange) {
            onChange(update.state.doc.toString());
          }
        }),
      ],
    });

    // 기존 에디터 정리
    if (viewRef.current) {
      viewRef.current.destroy();
    }

    viewRef.current = new EditorView({
      state,
      parent: containerRef.current,
    });

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
    // filePath 변경 시 에디터 재생성 (다른 파일을 열 때)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, readOnly]);

  // value가 외부에서 변경될 때 (에디터 내부 변경이 아닌 경우)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== value) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      data-testid="codemirror-editor"
      style={{
        flex: 1,
        overflow: "auto",
        fontSize: 13,
        lineHeight: 1.5,
      }}
    />
  );
}
