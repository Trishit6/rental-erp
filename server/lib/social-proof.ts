/**
 * Social-proof events (U4 effect 03) — the **privacy rules** the feed must
 * pass through before it leaves the server, kept pure so they are testable
 * without a database.
 *
 * The feed exists to make the marketplace feel alive; everything it could
 * leak does the opposite of that. The U4 spec fixes the guards, and each has
 * a reason:
 *
 *  - **Delay ≥ 10 minutes.** A "someone just bought X" toast narrates a
 *    stranger's purchase to whoever is watching; a delay keeps it from being
 *    a real-time tracking surface.
 *  - **Window ≤ 24 h.** Older events stop feeling current and start feeling
 *    like a replay.
 *  - **No names, no ids, no timestamps.** Raw event ages are allowed only as
 *    coarse buckets; the client can render "12 min ago" but could never deduce
 *    a purchase history.
 *  - **City only with k = 3.** One event saying "in Pune" points at one
 *    stranger's door; three events sharing a city is a neighbourhood, not a
 *    person.
 *  - **Feed empties below 5.** A proof feed of one or two events tells the
 *    visitor exactly how empty the marketplace is — worse than silence.
 */
export const SOCIAL_PROOF_DELAY_MS = 10 * 60_000;
export const SOCIAL_PROOF_WINDOW_MS = 24 * 60 * 60_000;
export const SOCIAL_PROOF_CITY_K = 3;
export const SOCIAL_PROOF_MIN_EVENTS = 5;

export type SocialProofKind = "rented" | "bought" | "listed";

/** The coarse age bucket the client renders — the only time signal it sees. */
export type SocialProofBucket = "10-30 min" | "1 h" | "today";

export type RawProofEvent = {
  kind: SocialProofKind;
  productId: number;
  productTitle: string;
  productSlug: string;
  image: string | null;
  /** The product's (seller's) stored location, e.g. "Pune, Maharashtra". */
  location: string | null;
  /** When the listing was published or the order was paid. */
  happenedAt: number;
};

export type ProofEvent = {
  kind: SocialProofKind;
  productTitle: string;
  productSlug: string;
  image: string | null;
  city: string | null;
  bucket: SocialProofBucket;
};

/** Age → bucket. Ages below the delay never reach this (caller filters). */
export function bucketForAge(ageMs: number): SocialProofBucket {
  if (ageMs <= 30 * 60_000) return "10-30 min";
  if (ageMs <= 60 * 60_000) return "1 h";
  return "today";
}

/** The first comma segment of a stored location, trimmed and bounded. */
export function coarseCity(location: string | null): string | null {
  if (!location) return null;
  const city = location.split(",")[0]?.trim();
  if (!city) return null;
  return city.length > 60 ? city.slice(0, 60) : city;
}

/**
 * One event per (kind, product): a product bought in three orders today is
 * "someone bought it" once, not a burst that tracks popularity in realtime.
 */
export function dedupeEvents(events: readonly RawProofEvent[]): RawProofEvent[] {
  const best = new Map<string, RawProofEvent>();
  for (const event of events) {
    const key = `${event.kind}:${event.productId}`;
    const existing = best.get(key);
    if (!existing || event.happenedAt > existing.happenedAt) best.set(key, event);
  }
  return [...best.values()];
}

/**
 * Apply every privacy rule and project the public shape.
 *
 * The order matters: filter window and delay per event, then decide city
 * visibility on the *surviving* events (a city promoted by events outside the
 * window would publish where the window has only one), then apply the global
 * threshold. Sorting is by recency; the caller may cap the list length.
 */
export function buildPublicProofFeed(
  raw: readonly RawProofEvent[],
  now: number,
  options?: Partial<{
    delayMs: number;
    windowMs: number;
    cityK: number;
    minEvents: number;
  }>,
): ProofEvent[] {
  const { delayMs, windowMs, cityK, minEvents } = {
    delayMs: SOCIAL_PROOF_DELAY_MS,
    windowMs: SOCIAL_PROOF_WINDOW_MS,
    cityK: SOCIAL_PROOF_CITY_K,
    minEvents: SOCIAL_PROOF_MIN_EVENTS,
    ...options,
  };

  const fresh = raw
    .map((event) => ({ event, age: now - event.happenedAt }))
    .filter(({ age }) => age >= delayMs && age <= windowMs);

  const cityCounts = new Map<string, number>();
  for (const { event } of fresh) {
    const city = coarseCity(event.location);
    if (city) cityCounts.set(city, (cityCounts.get(city) ?? 0) + 1);
  }

  const projected = fresh
    .sort((a, b) => b.event.happenedAt - a.event.happenedAt)
    .map(({ event, age }): ProofEvent => {
      const city = coarseCity(event.location);
      return {
        kind: event.kind,
        productTitle: event.productTitle,
        productSlug: event.productSlug,
        image: event.image,
        city: city && (cityCounts.get(city) ?? 0) >= cityK ? city : null,
        bucket: bucketForAge(age),
      };
    });

  if (projected.length < minEvents) return [];
  return projected;
}
