import { describe, it, expect } from "vitest";
import { classifyBreakpoint, type BreakpointName } from "../responsive-breakpoints";

describe("classifyBreakpoint", () => {
  it("320px → mobile", () => {
    expect(classifyBreakpoint(320)).toBe("mobile");
  });

  it("768px → tablet", () => {
    expect(classifyBreakpoint(768)).toBe("tablet");
  });

  it("1024px → desktop", () => {
    expect(classifyBreakpoint(1024)).toBe("desktop");
  });

  it("1920px → wide", () => {
    expect(classifyBreakpoint(1920)).toBe("wide");
  });

  it("2560px → ultraWide", () => {
    expect(classifyBreakpoint(2560)).toBe("ultraWide");
  });
});
