/**
 * A tiny in-process cache for *public* reads (PROMPT 26).
 *
 * ## Why this exists at all
 *
 * The storefront reads the same few rows on every home-page load — the active hero
 * banners, the hero copy, the "how it works" steps. They change when an
 * administrator edits content, which is rare, and they are the same for every
 * visitor, which makes them the one thing worth caching. Nothing here is
 * per-user: a private payload must never be stored under a shared key.
 *
 * ## Why it is invalidated on write and not left to expire
 *
 * The acceptance criterion is "admin edits show on the public site immediately".
 * A TTL alone cannot promise that — an edit thirty milliseconds after a read would
 * be invisible for the rest of the window. So every CMS write calls
 * `invalidatePublicCache()`, and the TTL is only a backstop for a missed call.
 *
 * ## Why a plain `Map` and not an LRU
 *
 * The key space is bounded by the content the platform has (a handful of
 * placements, a fixed set of block keys), so eviction policy buys nothing. If a
 * future caller passes unbounded keys, `PUBLIC_CACHE_MAX_KEYS` is the guard that
 * keeps a runaway from becoming a leak.
 */

type Entry = { value: unknown; expiresAt: number };

const store = new Map<string, Entry>();

/** Backstop only: a write path that forgets to invalidate must not cache forever. */
const DEFAULT_TTL_MS = 30_000;

/** A hard ceiling, so an unbounded key space cannot grow without limit. */
const PUBLIC_CACHE_MAX_KEYS = 500;

/**
 * Read through the cache, or compute and store the value.
 *
 * `loader` runs only on a miss, so a cached public read costs no database query —
 * which is the entire point.
 */
export async function cachedPublic<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) return hit.value as T;

  const value = await loader();
  if (store.size >= PUBLIC_CACHE_MAX_KEYS && !store.has(key)) {
    // Drop the oldest insertion; insertion order is what a `Map` preserves.
    const oldest = store.keys().next();
    if (!oldest.done) store.delete(oldest.value);
  }
  store.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

/**
 * Drop cached public reads.
 *
 * Called with no argument by every CMS write — the simplest rule is the most
 * reliable one, and the key space is small enough that clearing it wholesale is
 * cheaper than reasoning about which placement a banner belonged to.
 */
export function invalidatePublicCache(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/** Test seam: the cache is process-global, so a test must be able to reset it. */
export function __resetPublicCacheForTests(): void {
  store.clear();
}
