import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FilePreviewBar from "../FilePreviewBar";
import type { FileAttachment } from "../useFileUpload";

const mockAttachments: FileAttachment[] = [
  { name: "photo.png", size: 2048, type: "image", data: "data:image/png;base64,abc", mimeType: "image/png" },
  { name: "readme.md", size: 512, type: "text", data: "# Hello", mimeType: "text/markdown" },
];

describe("FilePreviewBar", () => {
  it("첨부 파일 이름이 표시된다", () => {
    render(<FilePreviewBar attachments={mockAttachments} onRemove={vi.fn()} />);
    expect(screen.getByText("photo.png")).toBeInTheDocument();
    expect(screen.getByText("readme.md")).toBeInTheDocument();
  });

  it("제거 버튼 클릭 시 onRemove가 호출된다", () => {
    const onRemove = vi.fn();
    render(<FilePreviewBar attachments={mockAttachments} onRemove={onRemove} />);
    fireEvent.click(screen.getByLabelText("photo.png 제거"));
    expect(onRemove).toHaveBeenCalledWith(0);
  });

  it("빈 배열이면 아무것도 렌더링하지 않는다", () => {
    const { container } = render(<FilePreviewBar attachments={[]} onRemove={vi.fn()} />);
    expect(container.querySelector('[data-testid="file-preview-bar"]')).toBeNull();
  });
});
