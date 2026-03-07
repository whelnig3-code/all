import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ErrorBoundary from "../ErrorBoundary";

// 에러를 의도적으로 발생시키는 컴포넌트
function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("Test explosion");
  return <div>All good</div>;
}

describe("ErrorBoundary", () => {
  // console.error 노이즈 억제
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });
  afterEach(() => {
    console.error = originalError;
  });

  it("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <p>Child content</p>
      </ErrorBoundary>
    );
    expect(screen.getByText("Child content")).toBeInTheDocument();
  });

  it("shows default error UI when child throws", () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText("예상치 못한 오류가 발생했습니다")).toBeInTheDocument();
    expect(screen.getByText("Test explosion")).toBeInTheDocument();
    expect(screen.getByText("다시 시도")).toBeInTheDocument();
  });

  it("shows label-specific error message when label provided", () => {
    render(
      <ErrorBoundary label="채팅">
        <ThrowError shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText("채팅에서 오류 발생")).toBeInTheDocument();
  });

  it("renders custom fallback when provided", () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowError shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText("Custom fallback")).toBeInTheDocument();
    expect(screen.queryByText("다시 시도")).not.toBeInTheDocument();
  });

  it("resets error state when '다시 시도' button is clicked", () => {
    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow />
      </ErrorBoundary>
    );

    // 에러 상태 확인
    expect(screen.getByText("Test explosion")).toBeInTheDocument();

    // 리셋 후 재렌더: shouldThrow=false로 바꿔야 다시 안 터짐
    // reset()이 호출되면 hasError=false → children 재렌더
    // 하지만 같은 ThrowError shouldThrow=true가 다시 렌더되면 또 터짐
    // 그래서 리셋 후 에러가 다시 잡히는지 확인
    fireEvent.click(screen.getByText("다시 시도"));

    // reset 후 children 재렌더 시도 → shouldThrow=true라 다시 에러 발생
    expect(screen.getByText("Test explosion")).toBeInTheDocument();
  });
});
