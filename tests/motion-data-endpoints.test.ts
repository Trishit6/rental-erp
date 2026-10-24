/**
 * U4 endpoints: the privacy guarantees of the social-proof feed and the
 * projection of featured reviews.
 *
 * The route handlers are thin wrappers over pure filters (`server/lib/social-proof.ts`)
 * and one SQL projection (`server/routes/reviews.ts#featured`); the tests pin the
 * pure rules (which is where a privacy leak could be introduced slowly) and the
 * source-level shape of the projection (which is where a leaked field would be typed).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SOCIAL_PROOF_CITY_K,
  SOCIAL_PROOF_DELAY_MS,
  SOCIAL_PROOF_MIN_EVENTS,
  SOCIAL_PROOF_WINDOW_MS,
  bucketForAge,
  buildPublicProofFeed,
  coarseCity,
  dedupeEvents,
  type RawProofEvent,
} from "../server/lib/social-proof";

const MIN = 60_000;
const NOW = 1_800_000_000_000;

function event(overrides: Partial<RawProofEvent> = {}): RawProofEvent {
  return {
    kind: "bought",
    productId: 1,
    productTitle: "Canon EOS camera",
    productSlug: "canon-eos",
    image: null,
    location: "Pune, Maharashtra",
    happenedAt: NOW - 30 * MIN,
    ...overrides,
  };
}

describe("social-proof privacy rules", () => {
  it("events younger than the 10-minute delay never appear", () => {
    const feed = buildPublicProofFeed(
      Array.from({ length: 8 }, (_, i) =>
        event({ productId: i, happenedAt: NOW - (i === 0 ? SOCIAL_PROOF_DELAY_MS - 1000 : 20 * MIN) }),
      ),
      NOW,
    );
    expect(feed).toHaveLength(7);
    expect(feed.some((e) => e.bucket === undefined)).toBe(false);
  });

  it("an exactly-delay-old event is included (>= delay)", () => {
    const feed = buildPublicProofFeed(
      Array.from({ length: 6 }, (_, i) => event({ productId: i, happenedAt: NOW - SOCIAL_PROOF_DELAY_MS })),
      NOW,
    );
    expect(feed).toHaveLength(6);
    expect(feed.every((e) => e.bucket === "10-30 min")).toBe(true);
  });

  it("events older than 24h are dropped", () => {
    const feed = buildPublicProofFeed(
      Array.from({ length: 10 }, (_, i) =>
        event({ productId: i, happenedAt: NOW - (i < 4 ? SOCIAL_PROOF_WINDOW_MS + 1000 : 60 * MIN) }),
      ),
      NOW,
    );
    expect(feed).toHaveLength(6);
  });

  it("the city appears only when k events share it; rare cities are stripped", () => {
    const raw = [
      ...Array.from({ length: SOCIAL_PROOF_CITY_K }, (_, i) =>
        event({ productId: i, location: "Pune, Maharashtra", happenedAt: NOW - (15 + i) * MIN }),
      ),
      ...Array.from({ length: SOCIAL_PROOF_CITY_K }, (_, i) =>
        event({ productId: 10 + i, location: "Surat, Gujarat", happenedAt: NOW - (15 + i) * MIN }),
      ),
      event({ productId: 20, location: "Surat, Gujarat", happenedAt: NOW - 25 * MIN }),
    ];
    raw.push(event({ productId: 30, location: "Nagpur, Maharashtra", happenedAt: NOW - 30 * MIN }));

    const withFourSurat = buildPublicProofFeed(raw, NOW);
    expect(withFourSurat).toHaveLength(8);
    const cities = withFourSurat.map((e) => e.city);
    expect(cities.filter((c) => c === "Pune")).toHaveLength(3);
    expect(cities.filter((c) => c === "Surat")).toHaveLength(4);
    expect(cities).not.toContain("Nagpur");
  });

  it("the whole feed is empty below the 5-event threshold — silence, not a thin feed", () => {
    const feed = buildPublicProofFeed(
      Array.from({ length: SOCIAL_PROOF_MIN_EVENTS - 1 }, (_, i) =>
        event({ productId: i, happenedAt: NOW - (15 + i) * MIN }),
      ),
      NOW,
    );
    expect(feed).toEqual([]);
  });

  it("nothing in the public shape can identify a person or an instant", () => {
    const feed = buildPublicProofFeed(
      Array.from({ length: 6 }, (_, i) =>
        event({ productId: i, happenedAt: NOW - (15 + i) * MIN, location: "Pune, Maharashtra" }),
      ),
      NOW,
    );
    for (const item of feed) {
      expect(Object.keys(item).sort()).toEqual(["bucket", "city", "image", "kind", "productSlug", "productTitle"]);
      expect(["10-30 min", "1 h", "today"]).toContain(item.bucket);
    }
  });

  it("buckets stay coarse: 30 min → '10-30 min', 45 min → '1 h', 12 h → 'today'", () => {
    expect(bucketForAge(30 * MIN)).toBe("10-30 min");
    expect(bucketForAge(45 * MIN)).toBe("1 h");
    expect(bucketForAge(12 * 60 * MIN)).toBe("today");
  });

  it("coarse city is the first comma segment, or null", () => {
    expect(coarseCity("Pune, Maharashtra")).toBe("Pune");
    expect(coarseCity("Pune")).toBe("Pune");
    expect(coarseCity("   ")).toBeNull();
    expect(coarseCity(null)).toBeNull();
  });

  it("dedupe keeps one event per (kind, product), the most recent", () => {
    const deduped = dedupeEvents([
      event({ productId: 1, happenedAt: NOW - 60 * MIN }),
      event({ productId: 1, happenedAt: NOW - 20 * MIN }),
      event({ kind: "listed", productId: 1, happenedAt: NOW - 90 * MIN }),
    ]);
    expect(deduped).toHaveLength(2);
    const bought = deduped.find((e) => e.kind === "bought");
    expect(bought?.happenedAt).toBe(NOW - 20 * MIN);
  });
});

describe("the featured-reviews projection pins its own shape in source", () => {
  const routeSource = readFileSync(
    join(__dirname, "..", "server", "routes", "reviews.ts"),
    "utf8",
  );

  it("selects only the public fields for /featured", () => {
    // Scan only the SELECT projection (the join line legitimately touches
    // users.id to resolve the author row) and forbid identity fields in it.
    const handler = routeSource.slice(
      routeSource.indexOf('"/featured"'),
      routeSource.indexOf('"/product/:idOrSlug"'),
    );
    const selectStart = handler.indexOf(".select({");
    const selectEnd = handler.indexOf(".from(");
    expect(selectStart).toBeGreaterThan(0);
    expect(selectEnd).toBeGreaterThan(selectStart);
    const projection = handler.slice(selectStart, selectEnd);
    for (const forbidden of ["orderId", "orderItemId", "email", "reviwerId", "userId"]) {
      expect(projection.includes(forbidden), `must not select ${forbidden}`).toBe(false);
    }
    expect(projection.includes("authorName")).toBe(true);
    expect(projection.includes("rating")).toBe(true);
    expect(projection.includes("productSlug")).toBe(true);
  });

  it("gates curated reviews: published, ≥4 stars, verified, 40–220 chars", () => {
    const block = routeSource.slice(routeSource.indexOf('"/featured"'), routeSource.indexOf('"/product/:idOrSlug"'));
    expect(block.includes("PUBLIC_REVIEW_STATUSES")).toBe(true);
    expect(block.includes("gte(reviews.rating, 4)")).toBe(true);
    expect(block.includes("isVerifiedPurchase")).toBe(true);
    expect(block.includes("BETWEEN 40 AND 220")).toBe(true);
  });
});
