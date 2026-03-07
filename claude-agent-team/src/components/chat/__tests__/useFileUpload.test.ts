import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFileUpload } from "../useFileUpload";

function createMockFile(name: string, size: number, type: string): File {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type });
}

describe("useFileUpload", () => {
  it("초기 상태: attachments가 빈 배열", () => {
    const { result } = renderHook(() => useFileUpload());
    expect(result.current.attachments).toEqual([]);
  });

  it("addFiles로 이미지 파일을 추가할 수 있다", async () => {
    const { result } = renderHook(() => useFileUpload());
    const file = createMockFile("photo.png", 1024, "image/png");

    await act(async () => {
      await result.current.addFiles([file]);
    });

    expect(result.current.attachments).toHaveLength(1);
    expect(result.current.attachments[0].name).toBe("photo.png");
    expect(result.current.attachments[0].type).toBe("image");
  });

  it("addFiles로 텍스트 파일을 추가할 수 있다", async () => {
    const { result } = renderHook(() => useFileUpload());
    const file = createMockFile("readme.md", 512, "text/markdown");

    await act(async () => {
      await result.current.addFiles([file]);
    });

    expect(result.current.attachments).toHaveLength(1);
    expect(result.current.attachments[0].type).toBe("text");
  });

  it("5MB 초과 이미지는 거부된다", async () => {
    const { result } = renderHook(() => useFileUpload());
    const bigFile = createMockFile("huge.png", 6 * 1024 * 1024, "image/png");

    await act(async () => {
      await result.current.addFiles([bigFile]);
    });

    expect(result.current.attachments).toHaveLength(0);
    expect(result.current.error).toContain("5MB");
  });

  it("1MB 초과 텍스트는 거부된다", async () => {
    const { result } = renderHook(() => useFileUpload());
    const bigText = createMockFile("huge.md", 2 * 1024 * 1024, "text/plain");

    await act(async () => {
      await result.current.addFiles([bigText]);
    });

    expect(result.current.attachments).toHaveLength(0);
    expect(result.current.error).toContain("1MB");
  });

  it("최대 5개까지만 첨부 가능", async () => {
    const { result } = renderHook(() => useFileUpload());
    const files = Array.from({ length: 6 }, (_, i) =>
      createMockFile(`file${i}.txt`, 100, "text/plain")
    );

    await act(async () => {
      await result.current.addFiles(files);
    });

    expect(result.current.attachments).toHaveLength(5);
  });

  it("removeFile로 특정 파일을 제거할 수 있다", async () => {
    const { result } = renderHook(() => useFileUpload());
    const file1 = createMockFile("a.txt", 100, "text/plain");
    const file2 = createMockFile("b.txt", 100, "text/plain");

    await act(async () => {
      await result.current.addFiles([file1, file2]);
    });

    expect(result.current.attachments).toHaveLength(2);

    act(() => {
      result.current.removeFile(0);
    });

    expect(result.current.attachments).toHaveLength(1);
    expect(result.current.attachments[0].name).toBe("b.txt");
  });

  it("clearFiles로 모든 파일을 제거할 수 있다", async () => {
    const { result } = renderHook(() => useFileUpload());
    const file = createMockFile("test.txt", 100, "text/plain");

    await act(async () => {
      await result.current.addFiles([file]);
    });

    act(() => {
      result.current.clearFiles();
    });

    expect(result.current.attachments).toEqual([]);
  });
});
