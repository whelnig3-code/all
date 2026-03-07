import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FileUploadButton from "../FileUploadButton";

describe("FileUploadButton", () => {
  it("📎 버튼이 렌더링된다", () => {
    render(<FileUploadButton onFiles={vi.fn()} />);
    expect(screen.getByLabelText("파일 첨부")).toBeInTheDocument();
  });

  it("disabled일 때 클릭 불가", () => {
    render(<FileUploadButton onFiles={vi.fn()} disabled />);
    expect(screen.getByLabelText("파일 첨부")).toBeDisabled();
  });

  it("숨겨진 file input이 존재한다", () => {
    const { container } = render(<FileUploadButton onFiles={vi.fn()} />);
    const input = container.querySelector('input[type="file"]');
    expect(input).toBeInTheDocument();
    expect(input).not.toBeVisible();
  });
});
