import { describe, it, expect } from "vitest";
import {
  getCurrentAbortController,
  setCurrentAbortController,
} from "../agent-state";

describe("AbortController 관리", () => {
  it("초기 상태는 null", () => {
    setCurrentAbortController(null);
    expect(getCurrentAbortController()).toBeNull();
  });

  it("set 후 get 반환", () => {
    const ctrl = new AbortController();
    setCurrentAbortController(ctrl);
    expect(getCurrentAbortController()).toBe(ctrl);
    // cleanup
    setCurrentAbortController(null);
  });

  it("새 컨트롤러 설정 시 이전 컨트롤러가 자동 abort", () => {
    const old = new AbortController();
    const next = new AbortController();

    setCurrentAbortController(old);
    expect(old.signal.aborted).toBe(false);

    setCurrentAbortController(next);
    expect(old.signal.aborted).toBe(true);
    expect(next.signal.aborted).toBe(false);

    // cleanup
    setCurrentAbortController(null);
  });

  it("null로 set 시 이전 컨트롤러 abort 안 함", () => {
    const ctrl = new AbortController();
    setCurrentAbortController(ctrl);
    setCurrentAbortController(null);
    // null 설정은 단순 클리어이므로 abort하지 않음
    expect(ctrl.signal.aborted).toBe(false);
  });
});
