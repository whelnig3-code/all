import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// CodeMirror는 jsdom에서 완전히 동작하지 않으므로,
// CodeEditorPanel의 UI 로직(툴바, 경로 입력, 변경 파일 목록)을 테스트한다.
// dynamic import를 모킹하여 CodeMirrorEditor를 간단한 textarea로 대체

vi.mock("next/dynamic", () => ({
  default: () => {
    const MockEditor = ({ value, onChange, filePath }: { value: string; onChange?: (v: string) => void; filePath: string }) => (
      <textarea
        data-testid="mock-codemirror"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        data-filepath={filePath}
      />
    );
    MockEditor.displayName = "MockCodeMirrorEditor";
    return MockEditor;
  },
}));

import CodeEditorPanel from "../CodeEditorPanel";

describe("CodeEditorPanel", () => {
  it("경로 입력 필드가 렌더링된다", () => {
    render(
      <CodeEditorPanel
        initialFilePath={null}
        onFilePathChange={vi.fn()}
        changedFiles={[]}
      />
    );
    expect(screen.getByPlaceholderText(/파일 경로 입력/)).toBeInTheDocument();
  });

  it("파일 경로 없을 때 안내 메시지를 표시한다", () => {
    render(
      <CodeEditorPanel
        initialFilePath={null}
        onFilePathChange={vi.fn()}
        changedFiles={[]}
      />
    );
    expect(screen.getByText(/파일 경로를 입력하거나/)).toBeInTheDocument();
  });

  it("최근 변경 파일이 있고 파일 경로가 없을 때 변경 파일 목록을 표시한다", () => {
    render(
      <CodeEditorPanel
        initialFilePath={null}
        onFilePathChange={vi.fn()}
        changedFiles={[
          { path: "src/index.ts", action: "modify" as const, agentId: "dev", timestamp: Date.now() },
        ]}
      />
    );
    expect(screen.getByText("index.ts")).toBeInTheDocument();
  });

  it("저장 버튼이 렌더링된다", () => {
    render(
      <CodeEditorPanel
        initialFilePath={null}
        onFilePathChange={vi.fn()}
        changedFiles={[]}
      />
    );
    expect(screen.getByText("저장")).toBeInTheDocument();
  });

  it("파일 경로 없을 때 저장 버튼이 비활성화된다", () => {
    render(
      <CodeEditorPanel
        initialFilePath={null}
        onFilePathChange={vi.fn()}
        changedFiles={[]}
      />
    );
    expect(screen.getByText("저장")).toBeDisabled();
  });
});
