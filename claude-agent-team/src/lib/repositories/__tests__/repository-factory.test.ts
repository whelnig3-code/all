import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getConversationRepository,
  getMessageRepository,
  getCustomAgentRepository,
  clearRepositoryCache,
} from "../repository-factory";

// 환경변수 모킹
const originalEnv = process.env.STORAGE_BACKEND;

beforeEach(() => {
  clearRepositoryCache();
  process.env.STORAGE_BACKEND = undefined;
});

describe("repository-factory", () => {
  it("기본값(file): getConversationRepository가 파일 기반 리포지토리를 반환한다", async () => {
    const repo = await getConversationRepository();
    expect(repo).toBeDefined();
    expect(typeof repo.findAll).toBe("function");
    expect(typeof repo.create).toBe("function");
  });

  it("기본값(file): getMessageRepository가 파일 기반 리포지토리를 반환한다", async () => {
    const repo = await getMessageRepository();
    expect(repo).toBeDefined();
    expect(typeof repo.findByConversationId).toBe("function");
  });

  it("기본값(file): getCustomAgentRepository가 파일 기반 리포지토리를 반환한다", async () => {
    const repo = await getCustomAgentRepository();
    expect(repo).toBeDefined();
    expect(typeof repo.findAll).toBe("function");
    expect(typeof repo.create).toBe("function");
  });

  it("캐시: 동일한 인스턴스를 반환한다", async () => {
    const repo1 = await getConversationRepository();
    const repo2 = await getConversationRepository();
    expect(repo1).toBe(repo2);
  });

  it("clearRepositoryCache: 캐시를 초기화한다", async () => {
    const repo1 = await getConversationRepository();
    clearRepositoryCache();
    const repo2 = await getConversationRepository();
    // 새 인스턴스이므로 다른 참조
    expect(repo1).not.toBe(repo2);
  });
});
