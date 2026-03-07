import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import WorkflowPanel from "../WorkflowPanel";

// fetch mock
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  // 기본 응답: 워크플로우 1개
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      workflows: [
        {
          id: "wf-1",
          name: "코드 리뷰 파이프라인",
          description: "개발 → 리뷰",
          steps: ["developer", "reviewer"],
          createdAt: "2026-03-01T00:00:00Z",
          updatedAt: "2026-03-01T00:00:00Z",
        },
      ],
    }),
  });
});

describe("WorkflowPanel", () => {
  it("워크플로우 목록을 렌더링한다", async () => {
    render(<WorkflowPanel />);

    await waitFor(() => {
      expect(screen.getByText("코드 리뷰 파이프라인")).toBeInTheDocument();
    });
  });

  it("실행 버튼이 렌더링된다", async () => {
    const onRun = vi.fn();
    render(<WorkflowPanel onRunWorkflow={onRun} />);

    await waitFor(() => {
      expect(screen.getByText("▶ 실행")).toBeInTheDocument();
    });
  });

  it("실행 버튼 클릭 시 onRunWorkflow 호출", async () => {
    const onRun = vi.fn();
    render(<WorkflowPanel onRunWorkflow={onRun} />);

    await waitFor(() => {
      expect(screen.getByText("▶ 실행")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("▶ 실행"));
    expect(onRun).toHaveBeenCalledWith(["developer", "reviewer"]);
  });

  it("새 워크플로우 버튼이 생성 폼을 표시한다", async () => {
    render(<WorkflowPanel />);

    fireEvent.click(screen.getByText("+ 새 워크플로우"));

    expect(screen.getByPlaceholderText("워크플로우 이름")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("설명 (선택)")).toBeInTheDocument();
  });
});
