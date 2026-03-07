import { describe, it, expect } from "vitest";
import path from "path";
import { resolveSafePath } from "../path-security";

describe("resolveSafePath", () => {
  const base = path.resolve("/project/base");

  it("blocks ../../etc/passwd traversal", () => {
    expect(() => resolveSafePath("../../etc/passwd", base)).toThrow();
  });

  it("blocks absolute path outside base", () => {
    expect(() => resolveSafePath("/etc/passwd", base)).toThrow();
  });

  it("allows relative path within base", () => {
    const result = resolveSafePath("docs/readme.md", base);
    expect(result).toBe(path.normalize(path.join(base, "docs/readme.md")));
  });

  it("allows absolute path inside base", () => {
    const inside = path.join(base, "src/file.ts");
    const result = resolveSafePath(inside, base);
    expect(result).toBe(path.normalize(inside));
  });

  it("throws on empty path", () => {
    expect(() => resolveSafePath("", base)).toThrow();
  });

  it("blocks backslash traversal (..\\..\\etc\\passwd)", () => {
    expect(() => resolveSafePath("..\\..\\etc\\passwd", base)).toThrow();
  });
});
