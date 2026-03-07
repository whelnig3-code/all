import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CustomAgentForm from "../CustomAgentForm";

describe("CustomAgentForm", () => {
  it("폼 필드가 모두 렌더링된다", () => {
    render(<CustomAgentForm onSave={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByPlaceholderText("예: QA 테스터")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("예: qa-tester")).toBeInTheDocument();
    expect(screen.getByText("시스템 프롬프트")).toBeInTheDocument();
    expect(screen.getByText("저장")).toBeInTheDocument();
    expect(screen.getByText("취소")).toBeInTheDocument();
  });

  it("필수 필드가 비어있으면 저장 버튼이 비활성화된다", () => {
    render(<CustomAgentForm onSave={vi.fn()} onCancel={vi.fn()} />);

    const saveButton = screen.getByText("저장");
    expect(saveButton).toBeDisabled();
  });

  it("유효 데이터 입력 시 onSave가 호출된다", () => {
    const onSave = vi.fn();
    render(<CustomAgentForm onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("예: QA 테스터"), { target: { value: "QA Tester" } });
    fireEvent.change(screen.getByPlaceholderText("예: qa-tester"), { target: { value: "qa-tester" } });
    fireEvent.change(screen.getByPlaceholderText("이 에이전트의 역할을 설명하세요"), { target: { value: "테스트 전문가" } });
    fireEvent.change(
      screen.getByPlaceholderText("이 에이전트에게 부여할 역할과 지시사항을 작성하세요 (최소 10자)"),
      { target: { value: "당신은 QA 테스터입니다. 테스트를 작성하고 검증하세요." } },
    );

    const saveButton = screen.getByText("저장");
    expect(saveButton).not.toBeDisabled();
    fireEvent.click(saveButton);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("취소 버튼 클릭 시 onCancel이 호출된다", () => {
    const onCancel = vi.fn();
    render(<CustomAgentForm onSave={vi.fn()} onCancel={onCancel} />);

    fireEvent.click(screen.getByText("취소"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
