import { describe, it, expect } from "vitest";
import { detectLanguage } from "../language-map";

describe("detectLanguage", () => {
  it(".ts → typescript", () => {
    expect(detectLanguage("example.ts")).toBe("typescript");
  });

  it(".tsx → typescript", () => {
    expect(detectLanguage("component.tsx")).toBe("typescript");
  });

  it(".json → json", () => {
    expect(detectLanguage("package.json")).toBe("json");
  });

  it(".md → markdown", () => {
    expect(detectLanguage("README.md")).toBe("markdown");
  });

  it(".py → python", () => {
    expect(detectLanguage("script.py")).toBe("python");
  });

  it(".css → css", () => {
    expect(detectLanguage("styles.css")).toBe("css");
  });

  it(".html → html", () => {
    expect(detectLanguage("index.html")).toBe("html");
  });

  it("확장자 없는 파일 → plaintext", () => {
    expect(detectLanguage("Dockerfile")).toBe("plaintext");
  });

  it("알 수 없는 확장자 → plaintext", () => {
    expect(detectLanguage("data.xyz")).toBe("plaintext");
  });
});
