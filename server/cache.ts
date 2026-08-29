// =============================================================================
// cache.ts — Tiny in-memory response cache for hot read endpoints
// =============================================================================
//
// Purpose:
//   Standings and the picks grid are expensive to compute (aggregations
//   across all users × all games) but only change when a pick is submitted
//   or a week is graded. On game day, ~40 users refresh these endpoints
//   constantly. Caching turns 40 identical Supabase queries per minute
//   into 1–2.
//
// Design:
//   - Simple Map<string, {data, expires}> with per-key TTLs.
//   - Async-safe: coalesces concurrent misses so we don't stampede the DB
//     when a cache entry expires and multiple requests arrive at once.
//   - Explicit invalidation by key prefix on writes (pick submission,
//     grading, admin game edits, etc.).
//
//   In-memory is fine here because the server is a single long-lived Node
//   process (not serverless). If ever migrated to horizontal scale-out,
//   this must be swapped for Redis.
//
// Metrics:
//   Every hit/miss is counted so we can eyeball cache effectiveness in
//   server logs. GET /api/_cache/stats (dev-only, admin-only) exposes them.
// =============================================================================

type Entry = { data: unknown; expires: number };

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

// Simple counters — reset on process restart. Not for production alerting;
// just for eyeballing effectiveness during rollout.
const stats = { hits: 0, misses: 0, invalidations: 0 };

/**
 * Return the cached value for `key` if present and unexpired; otherwise
 * call `fn()`, store its result with `ttlMs` lifetime, and return it.
 *
 * Concurrent misses for the same key share a single in-flight promise, so
 * a cold cache under load produces exactly one downstream call.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) {
    stats.hits++;
    return hit.data as T;
  }

  // Coalesce concurrent misses onto a single promise.
  const existing = inflight.get(key);
  if (existing) {
    stats.hits++; // treat as a hit — we're piggy-backing on someone else's fetch
    return existing as Promise<T>;
  }

  stats.misses++;
  const promise = (async () => {
    try {
      const data = await fn();
      store.set(key, { data, expires: Date.now() + ttlMs });
      return data;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}

/**
 * Drop every cache entry whose key starts with `prefix`. Called from write
 * handlers (pick submission, grading, admin game edits) so the next read
 * recomputes fresh data.
 */
export function invalidate(prefix: string): number {
  let removed = 0;
  // Snapshot keys to a plain array to avoid downlevelIteration issues and
  // to be safe against Map mutation during traversal.
  const allKeys = Array.from(store.keys());
  for (const k of allKeys) {
    if (k.startsWith(prefix)) {
      store.delete(k);
      removed++;
    }
  }
  if (removed > 0) stats.invalidations += removed;
  return removed;
}

/** Read-only stats snapshot for debug endpoints. */
export function cacheStats() {
  const total = stats.hits + stats.misses;
  return {
    ...stats,
    hitRate: total > 0 ? +(stats.hits / total).toFixed(3) : 0,
    entries: store.size,
    inflight: inflight.size,
  };
}

// ---------------------------------------------------------------------------
// Cache-key helpers — centralized so invalidation prefixes stay in sync with
// the keys used in route handlers. Change these carefully.
// ---------------------------------------------------------------------------
export const keys = {
  standings: () => "standings:v1",
  grid: (weekId: number) => `grid:v1:${weekId}`,
  dashboard: (userId: number, weekId: number) =>
    `dashboard:v1:${userId}:${weekId}`,
} as const;

export const prefixes = {
  standings: "standings:",
  grid: "grid:",
  dashboard: "dashboard:",
} as const;
