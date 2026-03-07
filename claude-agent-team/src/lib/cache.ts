/**
 * Cache abstraction layer with Cache-aside pattern.
 *
 * Think of this like a hotel front desk (cache) that keeps frequently
 * requested room keys ready. If the key is available and not expired,
 * you get it instantly. Otherwise, the front desk calls housekeeping
 * (the database) to prepare a fresh one.
 *
 * Provides a CacheAdapter interface so implementations can be swapped
 * (InMemory for development/testing, Redis for production).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Cache entry with TTL tracking */
export interface CacheEntry<T> {
  readonly value: T;
  readonly expiresAt: number; // timestamp ms
  readonly createdAt: number;
}

/** Cache interface (adapter pattern) */
export interface CacheAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  has(key: string): Promise<boolean>;
  clear(): Promise<void>;
  size(): Promise<number>;
}

/**
 * Extended adapter that exposes internal keys for prefix-based invalidation.
 * The base CacheAdapter doesn't expose keys (Redis wouldn't either in a
 * simple interface), so this is only available for InMemory usage.
 */
export interface InMemoryCacheAdapter extends CacheAdapter {
  readonly keys: () => IterableIterator<string>;
}

// ---------------------------------------------------------------------------
// Preset TTL values (ms)
// ---------------------------------------------------------------------------

export const CACHE_TTL = {
  AGENT_STATE: 5_000, // 5 seconds
  CONVERSATION_LIST: 30_000, // 30 seconds
  PROJECT: 60_000, // 60 seconds
  AGENT_STATS: 10_000, // 10 seconds
} as const;

// ---------------------------------------------------------------------------
// Cache key builder
// ---------------------------------------------------------------------------

/**
 * Builds a namespaced cache key to prevent collisions.
 * Like apartment numbers — "building:unit" ensures uniqueness.
 */
export function buildCacheKey(namespace: string, id: string): string {
  return `${namespace}:${id}`;
}

// ---------------------------------------------------------------------------
// InMemory implementation
// ---------------------------------------------------------------------------

function isExpired<T>(entry: CacheEntry<T>, now: number): boolean {
  return now >= entry.expiresAt;
}

/**
 * Creates an in-memory cache backed by a Map.
 *
 * Uses lazy expiration: entries are only removed when accessed after
 * their TTL has elapsed. No background sweep is needed because
 * JavaScript is single-threaded.
 */
export function createInMemoryCache(): InMemoryCacheAdapter {
  const store = new Map<string, CacheEntry<unknown>>();

  const adapter: InMemoryCacheAdapter = {
    async get<T>(key: string): Promise<T | null> {
      const entry = store.get(key);
      if (!entry) {
        return null;
      }
      if (isExpired(entry, Date.now())) {
        store.delete(key);
        return null;
      }
      return entry.value as T;
    },

    async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
      const now = Date.now();
      const entry: CacheEntry<T> = {
        value,
        expiresAt: now + ttlMs,
        createdAt: now,
      };
      store.set(key, entry as CacheEntry<unknown>);
    },

    async delete(key: string): Promise<boolean> {
      return store.delete(key);
    },

    async has(key: string): Promise<boolean> {
      const entry = store.get(key);
      if (!entry) {
        return false;
      }
      if (isExpired(entry, Date.now())) {
        store.delete(key);
        return false;
      }
      return true;
    },

    async clear(): Promise<void> {
      store.clear();
    },

    async size(): Promise<number> {
      const now = Date.now();
      let count = 0;
      for (const [, entry] of store) {
        if (!isExpired(entry, now)) {
          count += 1;
        }
      }
      return count;
    },

    keys(): IterableIterator<string> {
      return store.keys();
    },
  };

  return adapter;
}

// ---------------------------------------------------------------------------
// Cache-aside pattern helper
// ---------------------------------------------------------------------------

/**
 * Implements the cache-aside (lazy-loading) pattern.
 *
 * Like checking your fridge before going to the store:
 * 1. Look in the cache (fridge).
 * 2. If fresh item exists, return it.
 * 3. If not, fetch from the source (store), put it in the cache, then return.
 *
 * Errors from fetchFn propagate without caching — you don't put spoiled
 * food in the fridge.
 */
export async function cacheAside<T>(
  cache: CacheAdapter,
  key: string,
  ttlMs: number,
  fetchFn: () => Promise<T>,
): Promise<T> {
  const cached = await cache.get<T>(key);
  if (cached !== null) {
    return cached;
  }

  const value = await fetchFn();
  await cache.set(key, value, ttlMs);
  return value;
}

// ---------------------------------------------------------------------------
// Invalidation helpers
// ---------------------------------------------------------------------------

/**
 * Deletes all cache entries whose key starts with the given prefix.
 * Returns the number of deleted entries.
 *
 * Like clearing an entire shelf in a warehouse — everything labeled
 * with the same prefix gets removed at once.
 *
 * Note: requires an InMemoryCacheAdapter (or any adapter that exposes keys).
 * For a Redis adapter, you would use SCAN + DEL instead.
 */
export async function invalidateByPrefix(
  cache: CacheAdapter,
  prefix: string,
): Promise<number> {
  // We need access to the internal keys. If the cache exposes them, use them.
  const cacheWithKeys = cache as InMemoryCacheAdapter;
  if (typeof cacheWithKeys.keys !== "function") {
    return 0;
  }

  const keysToDelete: readonly string[] = Array.from(cacheWithKeys.keys()).filter(
    (key) => key.startsWith(prefix),
  );

  let deleted = 0;
  for (const key of keysToDelete) {
    const wasDeleted = await cache.delete(key);
    if (wasDeleted) {
      deleted += 1;
    }
  }

  return deleted;
}
