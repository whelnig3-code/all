import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildCacheKey,
  createInMemoryCache,
  cacheAside,
  invalidateByPrefix,
  CACHE_TTL,
  type CacheAdapter,
  type CacheEntry,
} from "../cache";

describe("buildCacheKey", () => {
  it("generates namespaced keys 'namespace:id'", () => {
    const key = buildCacheKey("project", "abc-123");
    expect(key).toBe("project:abc-123");
  });

  it("handles empty strings", () => {
    const key = buildCacheKey("", "");
    expect(key).toBe(":");
  });

  it("handles special characters in namespace and id", () => {
    const key = buildCacheKey("agent-state", "user/session-1");
    expect(key).toBe("agent-state:user/session-1");
  });
});

describe("createInMemoryCache", () => {
  let cache: CacheAdapter;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = createInMemoryCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("get returns null for missing key", async () => {
    const result = await cache.get("nonexistent");
    expect(result).toBeNull();
  });

  it("set then get returns value", async () => {
    await cache.set("key1", { name: "test" }, 10_000);
    const result = await cache.get<{ readonly name: string }>("key1");
    expect(result).toEqual({ name: "test" });
  });

  it("TTL expiration - value unavailable after TTL", async () => {
    await cache.set("key1", "hello", 5_000);

    // Before expiration
    const before = await cache.get("key1");
    expect(before).toBe("hello");

    // Advance past TTL
    vi.advanceTimersByTime(5_001);

    const after = await cache.get("key1");
    expect(after).toBeNull();
  });

  it("delete removes entry", async () => {
    await cache.set("key1", "value1", 10_000);
    const deleted = await cache.delete("key1");
    expect(deleted).toBe(true);

    const result = await cache.get("key1");
    expect(result).toBeNull();
  });

  it("delete returns false for missing key", async () => {
    const deleted = await cache.delete("nonexistent");
    expect(deleted).toBe(false);
  });

  it("has returns true for existing non-expired key", async () => {
    await cache.set("key1", "value1", 10_000);
    const result = await cache.has("key1");
    expect(result).toBe(true);
  });

  it("has returns false for missing key", async () => {
    const result = await cache.has("nonexistent");
    expect(result).toBe(false);
  });

  it("has returns false for expired key", async () => {
    await cache.set("key1", "value1", 5_000);
    vi.advanceTimersByTime(5_001);

    const result = await cache.has("key1");
    expect(result).toBe(false);
  });

  it("clear removes all entries", async () => {
    await cache.set("key1", "v1", 10_000);
    await cache.set("key2", "v2", 10_000);
    await cache.set("key3", "v3", 10_000);

    await cache.clear();

    expect(await cache.get("key1")).toBeNull();
    expect(await cache.get("key2")).toBeNull();
    expect(await cache.get("key3")).toBeNull();
    expect(await cache.size()).toBe(0);
  });

  it("size returns count of non-expired entries", async () => {
    await cache.set("key1", "v1", 10_000);
    await cache.set("key2", "v2", 10_000);
    await cache.set("key3", "v3", 10_000);

    const count = await cache.size();
    expect(count).toBe(3);
  });

  it("expired entries not counted in size", async () => {
    await cache.set("key1", "v1", 3_000);
    await cache.set("key2", "v2", 10_000);
    await cache.set("key3", "v3", 3_000);

    vi.advanceTimersByTime(3_001);

    const count = await cache.size();
    expect(count).toBe(1);
  });

  it("get cleans up expired entry on access", async () => {
    await cache.set("key1", "v1", 3_000);

    vi.advanceTimersByTime(3_001);

    // Accessing expired key should clean it up
    const result = await cache.get("key1");
    expect(result).toBeNull();

    // After cleanup, has should also return false
    const exists = await cache.has("key1");
    expect(exists).toBe(false);
  });
});

describe("cacheAside", () => {
  let cache: CacheAdapter;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = createInMemoryCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("cache miss calls fetchFn and stores result", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ id: 1, name: "Project A" });

    const result = await cacheAside(cache, "project:1", 10_000, fetchFn);

    expect(fetchFn).toHaveBeenCalledOnce();
    expect(result).toEqual({ id: 1, name: "Project A" });

    // Verify it was cached
    const cached = await cache.get("project:1");
    expect(cached).toEqual({ id: 1, name: "Project A" });
  });

  it("cache hit returns cached value without calling fetchFn", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ id: 1, name: "Project A" });

    // First call: cache miss
    await cacheAside(cache, "project:1", 10_000, fetchFn);

    // Second call: cache hit
    const result = await cacheAside(cache, "project:1", 10_000, fetchFn);

    expect(fetchFn).toHaveBeenCalledOnce();
    expect(result).toEqual({ id: 1, name: "Project A" });
  });

  it("after TTL expires, calls fetchFn again", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ id: 1, version: 1 })
      .mockResolvedValueOnce({ id: 1, version: 2 });

    // First call
    const first = await cacheAside(cache, "project:1", 5_000, fetchFn);
    expect(first).toEqual({ id: 1, version: 1 });

    // Advance past TTL
    vi.advanceTimersByTime(5_001);

    // Second call after expiry
    const second = await cacheAside(cache, "project:1", 5_000, fetchFn);
    expect(second).toEqual({ id: 1, version: 2 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("fetchFn error propagates and does not cache errors", async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValue(new Error("Database connection failed"));

    await expect(
      cacheAside(cache, "project:1", 10_000, fetchFn),
    ).rejects.toThrow("Database connection failed");

    // Verify nothing was cached
    const cached = await cache.get("project:1");
    expect(cached).toBeNull();
  });
});

describe("invalidateByPrefix", () => {
  let cache: CacheAdapter;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = createInMemoryCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("deletes all keys matching prefix", async () => {
    await cache.set("project:1", "p1", 10_000);
    await cache.set("project:2", "p2", 10_000);
    await cache.set("agent:1", "a1", 10_000);

    const deleted = await invalidateByPrefix(cache, "project:");
    expect(deleted).toBe(2);

    expect(await cache.get("project:1")).toBeNull();
    expect(await cache.get("project:2")).toBeNull();
    expect(await cache.get("agent:1")).toBe("a1");
  });

  it("returns 0 when no keys match", async () => {
    await cache.set("agent:1", "a1", 10_000);

    const deleted = await invalidateByPrefix(cache, "project:");
    expect(deleted).toBe(0);
  });
});

describe("CACHE_TTL", () => {
  it("has correct preset values", () => {
    expect(CACHE_TTL.AGENT_STATE).toBe(5_000);
    expect(CACHE_TTL.CONVERSATION_LIST).toBe(30_000);
    expect(CACHE_TTL.PROJECT).toBe(60_000);
    expect(CACHE_TTL.AGENT_STATS).toBe(10_000);
  });

  it("values are readonly", () => {
    // TypeScript enforces this at compile time via `as const`,
    // runtime verification that the object shape is correct
    const keys = Object.keys(CACHE_TTL);
    expect(keys).toContain("AGENT_STATE");
    expect(keys).toContain("CONVERSATION_LIST");
    expect(keys).toContain("PROJECT");
    expect(keys).toContain("AGENT_STATS");
    expect(keys).toHaveLength(4);
  });
});
