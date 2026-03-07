import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MobileHeader from "../MobileHeader";

describe("MobileHeader", () => {
  it("햄버거 버튼이 렌더링된다", () => {
    render(<MobileHeader onMenuToggle={vi.fn()} />);
    expect(screen.getByLabelText("메뉴 열기")).toBeInTheDocument();
  });

  it("햄버거 클릭 시 onMenuToggle이 호출된다", () => {
    const onMenuToggle = vi.fn();
    render(<MobileHeader onMenuToggle={onMenuToggle} />);
    fireEvent.click(screen.getByLabelText("메뉴 열기"));
    expect(onMenuToggle).toHaveBeenCalledTimes(1);
  });

  it("JM AGENTS 타이틀이 렌더링된다", () => {
    render(<MobileHeader onMenuToggle={vi.fn()} />);
    expect(screen.getByText("JM AGENTS")).toBeInTheDocument();
  });
});
