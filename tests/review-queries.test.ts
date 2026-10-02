import { describe, expect, it } from "vitest";
import type { SQL } from "drizzle-orm";
import {
  PURCHASE_TYPE_LABELS,
  REVIEW_PURCHASE_TYPES,
  REVIEW_RATINGS,
  REVIEW_RATING_LABELS,
  REVIEW_SORTS,
  REVIEW_SORT_LABELS,
  REVIEW_STATUSES,
  REVIEW_STATUS_LABELS,
  type ReviewSort,
} from "../src/features/reviews/types";
import {
  buildReviewSort,
  checkReviewEligibility,
  isReviewPurchaseType,
  isReviewSort,
  isReviewStatus,
  parseReviewImages,
  PUBLIC_REVIEW_STATUSES,
  purchaseTypeForLine,
  resolveReviewFilters,
  REVIEWABLE_ORDER_STATUSES,
  REVIEWABLE_RENTAL_STATUSES,
  REVIEW_PURCHASE_TYPES as SERVER_REVIEW_PURCHASE_TYPES,
  REVIEW_SORTS as SERVER_REVIEW_SORTS,
  REVIEW_STATUSES as SERVER_REVIEW_STATUSES,
  reviewBelongsTo,
  reviewImageUrlError,
  ratingSummaryShape,
  MAX_REVIEW_IMAGES,
} from "../server/lib/review-queries";

/**
 * The review vocabulary is declared twice — once for the client
 * (`src/features/reviews/types.ts`) and once for the server
 * (`server/lib/review-queries.ts`) — for the same reason the listing statuses and
 * the product filters are: `src/lib/pricing.ts` is the only `src/` file in the
 * server tsconfig, and widening that is a bigger change than a test.
 *
 * So the mirror is deliberate, and **this test is what makes it safe**. Adding a
 * status on the server and forgetting the client now fails here instead of
 * rendering a blank chip — the failure mode the duplication was worth accepting.
 */

/* -------------------------------- vocabulary -------------------------------- */

describe("review vocabulary is identical on both sides of the wire", () => {
  it("lists the same statuses, in the same order", () => {
    expect([...SERVER_REVIEW_STATUSES]).toEqual([...REVIEW_STATUSES]);
  });

  it("lists the same purchase types", () => {
    expect([...SERVER_REVIEW_PURCHASE_TYPES]).toEqual([...REVIEW_PURCHASE_TYPES]);
  });

  it("lists the same sorts, in the same order", () => {
    expect([...SERVER_REVIEW_SORTS]).toEqual([...REVIEW_SORTS]);
  });

  it("has a label for every value it offers", () => {
    // A missing label renders an empty chip — which looks like a filter that does
    // nothing rather than a bug, so it is worth asserting directly.
    for (const status of REVIEW_STATUSES) expect(REVIEW_STATUS_LABELS[status]).toBeTruthy();
    for (const sort of REVIEW_SORTS) expect(REVIEW_SORT_LABELS[sort]).toBeTruthy();
    for (const type of REVIEW_PURCHASE_TYPES) expect(PURCHASE_TYPE_LABELS[type]).toBeTruthy();
    for (const stars of REVIEW_RATINGS) expect(REVIEW_RATING_LABELS[stars]).toBeTruthy();
  });
});

describe("only published reviews are public", () => {
  it("excludes every moderation state from public reads", () => {
    expect([...PUBLIC_REVIEW_STATUSES]).toEqual(["PUBLISHED"]);
  });

  it("does not treat hidden as a public state", () => {
    // The product-page WHERE clause is built from `PUBLIC_REVIEW_STATUSES`; if
    // HIDDEN were in it, a moderator's decision would be routable around by
    // anyone who noticed.
    expect(PUBLIC_REVIEW_STATUSES).not.toContain("HIDDEN");
    expect(PUBLIC_REVIEW_STATUSES).not.toContain("PENDING");
  });
});

describe("type guards", () => {
  it("accepts only real statuses", () => {
    for (const status of REVIEW_STATUSES) expect(isReviewStatus(status)).toBe(true);
    expect(isReviewStatus("ACTIVE")).toBe(false);
    expect(isReviewStatus("")).toBe(false);
    expect(isReviewStatus(null)).toBe(false);
  });

  it("accepts only real sorts", () => {
    for (const sort of REVIEW_SORTS) expect(isReviewSort(sort)).toBe(true);
    expect(isReviewSort("recommended")).toBe(false);
    expect(isReviewSort(undefined)).toBe(false);
  });

  it("accepts only real purchase types", () => {
    expect(isReviewPurchaseType("PURCHASE")).toBe(true);
    expect(isReviewPurchaseType("RENTAL")).toBe(true);
    expect(isReviewPurchaseType("BUY")).toBe(false);
  });
});

/* --------------------------------- filters ---------------------------------- */

describe("resolveReviewFilters degrades instead of throwing", () => {
  it("falls back to the defaults for a nonsense query", () => {
    // These arrive from a URL. A mistyped `?sort=popular` must produce a usable
    // list, not a route-level 400 over a hand-edited link.
    const filters = resolveReviewFilters({ sort: "popular", rating: "9", page: "-4" });
    expect(filters.sort).toBe("relevant");
    expect(filters.rating).toBeNull();
    expect(filters.page).toBe(1);
  });

  it("keeps values it recognises", () => {
    const filters = resolveReviewFilters({
      sort: "helpful",
      rating: "4",
      purchaseType: "RENTAL",
      page: "3",
      pageSize: "20",
    });
    expect(filters).toEqual({
      sort: "helpful",
      rating: 4,
      purchaseType: "RENTAL",
      page: 3,
      pageSize: 20,
    });
  });

  it("ignores a purchase type it does not know", () => {
    expect(resolveReviewFilters({ purchaseType: "MIXED" }).purchaseType).toBeNull();
  });

  it("survives an empty and a missing query alike", () => {
    expect(resolveReviewFilters({}).sort).toBe("relevant");
    expect(resolveReviewFilters(undefined).sort).toBe("relevant");
  });
});

/**
 * The column names an ordering actually references.
 *
 * A drizzle `SQL` object is a linked structure, not a string — serialising one
 * throws on the table↔column cycle — so the assertions below read `queryChunks`
 * and collect the columns. That is also a more precise assertion than matching a
 * generated string would be: it checks *which column* is ordered on rather than
 * that some text happened to appear.
 */
function orderedColumns(clause: SQL): string[] {
  const names: string[] = [];
  for (const chunk of clause.queryChunks) {
    if (chunk && typeof chunk === "object" && "name" in chunk && "table" in chunk) {
      names.push(chunk.name as string);
    }
  }
  return names;
}

describe("buildReviewSort produces an ordering for every offered sort", () => {
  it("never returns an empty ordering", () => {
    // An empty ORDER BY means "whatever MariaDB feels like", which makes page 2
    // repeat rows from page 1. Every sort has to pin at least one column.
    for (const sort of REVIEW_SORTS) {
      expect(buildReviewSort(sort as ReviewSort).length).toBeGreaterThan(0);
    }
  });

  it("breaks ties on every ordering, so pages are deterministic", () => {
    // Two reviews sharing a score must have a fixed order or pagination repeats
    // and drops rows. `id` is the last term on each.
    for (const sort of REVIEW_SORTS) {
      const last = buildReviewSort(sort as ReviewSort).at(-1)!;
      expect(orderedColumns(last)).toContain("id");
    }
  });

  it("puts verified transactions first when sorting by relevance", () => {
    expect(orderedColumns(buildReviewSort("relevant")[0]!)).toContain("is_verified_purchase");
  });

  it("orders by recency for newest, and by the score itself for the rest", () => {
    expect(orderedColumns(buildReviewSort("newest")[0]!)).toContain("created_at");
    expect(orderedColumns(buildReviewSort("helpful")[0]!)).toContain("helpful_count");
    expect(orderedColumns(buildReviewSort("highest")[0]!)).toContain("rating");
    expect(orderedColumns(buildReviewSort("lowest")[0]!)).toContain("rating");
  });

  it("falls back to the relevant ordering for an unknown sort", () => {
    expect(buildReviewSort("nonsense" as ReviewSort)).toEqual(buildReviewSort("relevant"));
  });
});

/* ------------------------------- eligibility -------------------------------- */

describe("checkReviewEligibility", () => {
  it("allows a purchase once it is delivered", () => {
    for (const status of REVIEWABLE_ORDER_STATUSES) {
      expect(
        checkReviewEligibility({
          purchaseType: "PURCHASE",
          orderStatus: status,
          rentalStatus: null,
          alreadyReviewed: false,
        }).eligible,
      ).toBe(true);
    }
  });

  it("allows a rental once it has been returned", () => {
    for (const status of REVIEWABLE_RENTAL_STATUSES) {
      expect(
        checkReviewEligibility({
          purchaseType: "RENTAL",
          orderStatus: "COMPLETED",
          rentalStatus: status,
          alreadyReviewed: false,
        }).eligible,
      ).toBe(true);
    }
  });

  it("does not allow a paid-but-undelivered order to be reviewed", () => {
    // The reviewer has not experienced the item yet. `PAID` is also legacy, which
    // is why it is absent from the vocabulary entirely.
    const check = checkReviewEligibility({
      purchaseType: "PURCHASE",
      orderStatus: "PAID",
      rentalStatus: null,
      alreadyReviewed: false,
    });
    expect(check.eligible).toBe(false);
    if (!check.eligible) expect(check.code).toBe("REVIEW_NOT_ELIGIBLE");
  });

  it("does not allow a rental still in progress", () => {
    // Judged on how it came back — and an `OVERDUE` rental is mid-dispute, not a
    // settled opinion.
    for (const status of ["CONFIRMED", "ACTIVE", "RETURN_PENDING", "OVERDUE", "DISPUTED"]) {
      expect(
        checkReviewEligibility({
          purchaseType: "RENTAL",
          orderStatus: "COMPLETED",
          rentalStatus: status,
          alreadyReviewed: false,
        }).eligible,
      ).toBe(false);
    }
  });

  it("reports already-reviewed ahead of any state check", () => {
    // Otherwise a customer who deleted nothing but whose order moved backwards
    // would be told to wait rather than that they have already reviewed it.
    const check = checkReviewEligibility({
      purchaseType: "PURCHASE",
      orderStatus: "CONFIRMED",
      rentalStatus: null,
      alreadyReviewed: true,
    });
    expect(check.eligible).toBe(false);
    if (!check.eligible) expect(check.code).toBe("ALREADY_REVIEWED");
  });

  it("always explains a refusal in a sentence a person can act on", () => {
    const refusal = checkReviewEligibility({
      purchaseType: "PURCHASE",
      orderStatus: "SHIPPED",
      rentalStatus: null,
      alreadyReviewed: false,
    });
    if (refusal.eligible) throw new Error("expected a refusal");
    expect(refusal.message).toMatch(/delivered/i);
  });

  it("refuses a rental with no rental row at all", () => {
    // A `mode: "RENT"` line with no `rentals` row is inconsistent data; it must
    // fail closed rather than fall through to the purchase rule.
    const check = checkReviewEligibility({
      purchaseType: "RENTAL",
      orderStatus: "COMPLETED",
      rentalStatus: null,
      alreadyReviewed: false,
    });
    expect(check.eligible).toBe(false);
  });
});

describe("purchaseTypeForLine", () => {
  it("trusts the rental row over the mode", () => {
    expect(purchaseTypeForLine({ mode: "BUY", rentalId: 7 })).toBe("RENTAL");
  });

  it("reads a RENT line as a rental even with no rental row", () => {
    expect(purchaseTypeForLine({ mode: "RENT", rentalId: null })).toBe("RENTAL");
  });

  it("reads everything else as a purchase", () => {
    expect(purchaseTypeForLine({ mode: "BUY", rentalId: null })).toBe("PURCHASE");
    expect(purchaseTypeForLine({ mode: null, rentalId: null })).toBe("PURCHASE");
  });
});

/* --------------------------------- helpers ---------------------------------- */

describe("reviewBelongsTo", () => {
  it("compares against the author", () => {
    expect(reviewBelongsTo(4, { userId: 4 })).toBe(true);
    expect(reviewBelongsTo(4, { userId: 5 })).toBe(false);
  });
});

describe("ratingSummaryShape", () => {
  it("rounds to two decimals", () => {
    expect(ratingSummaryShape(4.3333, 3)).toEqual({ average: 4.33, count: 3 });
  });

  it("reports zero for an empty set rather than an average of nothing", () => {
    expect(ratingSummaryShape(0, 0)).toEqual({ average: 0, count: 0 });
  });
});

describe("parseReviewImages", () => {
  it("reads a stored array", () => {
    expect(parseReviewImages(JSON.stringify(["https://cdn.example/a.jpg"]))).toEqual([
      "https://cdn.example/a.jpg",
    ]);
  });

  it("degrades to no photos rather than throwing while rendering", () => {
    // A malformed value must not take a product page down with it.
    expect(parseReviewImages("not json")).toEqual([]);
    expect(parseReviewImages(null)).toEqual([]);
    expect(parseReviewImages('{"not":"an array"}')).toEqual([]);
  });

  it("drops non-string entries", () => {
    expect(parseReviewImages(JSON.stringify(["https://cdn.example/a.jpg", 42, null]))).toEqual([
      "https://cdn.example/a.jpg",
    ]);
  });

  it("caps the list even if the stored value was written elsewhere", () => {
    const many = Array.from({ length: MAX_REVIEW_IMAGES + 5 }, (_, i) => `https://cdn.example/${i}.jpg`);
    expect(parseReviewImages(JSON.stringify(many))).toHaveLength(MAX_REVIEW_IMAGES);
  });
});

describe("reviewImageUrlError", () => {
  const hosts = ["cdn.revaro.app", "images.unsplash.com"];

  it("accepts a host this deployment trusts", () => {
    expect(reviewImageUrlError("https://cdn.revaro.app/a.jpg", hosts)).toBeNull();
    expect(reviewImageUrlError("https://images.unsplash.com/photo-1", hosts)).toBeNull();
  });

  it("refuses an arbitrary third-party host", () => {
    // Otherwise a review turns a product page into a request for content nobody
    // vetted, plus a beacon under the reviewer's control.
    expect(reviewImageUrlError("https://tracker.example/pixel.gif", hosts)).toMatch(/Revaro/i);
  });

  it("refuses a non-http scheme", () => {
    expect(reviewImageUrlError("javascript:alert(1)", hosts)).toMatch(/http/i);
  });

  it("refuses something that is not a URL at all", () => {
    expect(reviewImageUrlError("not a url", hosts)).toBeTruthy();
  });

  it("skips the host check when no hosts are configured", () => {
    expect(reviewImageUrlError("https://cdn.revaro.app/a.jpg", [])).toBeNull();
  });
});