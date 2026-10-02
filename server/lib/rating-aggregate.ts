import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { products, reviews } from "../schema";
import { PUBLIC_REVIEW_STATUSES, reviewColumns } from "./review-queries";

/**
 * Product rating aggregates.
 *
 * ## Why this exists separately
 *
 * Three surfaces need the same three numbers — the product card badge, the
 * product page's rating summary and the seller's profile — and they must never
 * be able to disagree. Rather than let each of them run its own `AVG` with its
 * own idea of which reviews count, they all call in here.
 *
 * ## What counts
 *
 * Only reviews in a public status. A hidden review must stop contributing to the
 * average the moment a moderator hides it, otherwise the badge would keep
 * advertising a rating nobody is allowed to read.
 *
 * ## Why the write path recomputes rather than increments
 *
 * `products.ratingAverage` is a cached aggregate for the badge, and the obvious
 * implementation — `average = average + (new - old) / n` — drifts. A single
 * mistyped denominator leaves a permanent error that no later write repairs.
 * Recomputing from the same aggregate this file already runs is one extra
 * indexed query on a write path that happens a handful of times per day, and it
 * is exact by construction.
 */

export type RatingDistribution = { stars: number; count: number; share: number }[];

export type ProductRatingSummary = {
  average: number;
  count: number;
  /** Always five buckets, 5 → 1, so the bars never change height on load. */
  distribution: RatingDistribution;
  /** Share of reviews at 5 stars, 0–1. The "72%" figure on the summary. */
  fiveStarShare: number;
  purchaseCount: number;
  rentalCount: number;
};

const EMPTY_SUMMARY: ProductRatingSummary = {
  average: 0,
  count: 0,
  distribution: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: 0, share: 0 })),
  fiveStarShare: 0,
  purchaseCount: 0,
  rentalCount: 0,
};

/** Turn per-rating counts into the full five-bucket shape, shares included. */
export function buildDistribution(counts: Map<number, number>): RatingDistribution {
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  return [5, 4, 3, 2, 1].map((stars) => {
    const count = counts.get(stars) ?? 0;
    return { stars, count, share: total > 0 ? count / total : 0 };
  });
}

/**
 * The product's rating summary, from the database.
 *
 * Two `GROUP BY rating` queries rather than loading the reviews: the whole point
 * is that a product with four thousand reviews costs the same as one with four.
 * `purchaseCount`/`rentalCount` come from a second grouping because they are a
 * different column, and they back the "Verified Purchases / Verified Rentals"
 * filter chips — so a shopper can see that rentals are actually reviewed here
 * before filtering to them.
 */
export async function getProductRatingSummary(productId: number): Promise<ProductRatingSummary> {
  const publicStatuses = [...PUBLIC_REVIEW_STATUSES];

  const [rows] = await Promise.all([
    db
      .select({
        rating: reviews.rating,
        count: sql<number>`COUNT(*)`,
        purchaseCount: sql<number>`SUM(CASE WHEN ${reviews.purchaseType} = 'RENTAL' THEN 1 ELSE 0 END)`,
      })
      .from(reviews)
      .where(and(eq(reviews.productId, productId), inArray(reviews.status, publicStatuses)))
      .groupBy(reviews.rating),
  ]);

  if (!rows.length) return { ...EMPTY_SUMMARY, distribution: buildDistribution(new Map()) };

  const counts = new Map(rows.map((row) => [Number(row.rating), Number(row.count)]));
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  const weighted = rows.reduce((sum, row) => sum + Number(row.rating) * Number(row.count), 0);

  return {
    average: total > 0 ? Number((weighted / total).toFixed(2)) : 0,
    count: total,
    distribution: buildDistribution(counts),
    fiveStarShare: total > 0 ? (counts.get(5) ?? 0) / total : 0,
    purchaseCount: rows.reduce((sum, row) => sum + (total - Number(row.purchaseCount)), 0),
    rentalCount: rows.reduce((sum, row) => sum + Number(row.purchaseCount), 0),
  };
}

/**
 * Refresh a product's cached rating columns.
 *
 * Called after any write that changes the published set — create, edit, delete,
 * a moderation hide or restore. Recomputed from `getProductRatingSummary` so the
 * badge, the summary block and the review list can never drift apart.
 */
export async function refreshProductRating(productId: number): Promise<ProductRatingSummary> {
  const summary = await getProductRatingSummary(productId);
  await db
    .update(products)
    .set({ ratingAverage: summary.average, ratingCount: summary.count })
    .where(eq(products.id, productId));
  return summary;
}

/**
 * Refresh every affected product's cached rating.
 *
 * A delete takes the review's product with it, and an edit that changes only
 * text still has to leave the numbers alone — so callers pass the products whose
 * published set actually moved, rather than re-aggregating the world.
 */
export async function refreshProductRatings(productIds: number[]): Promise<void> {
  const unique = [...new Set(productIds.filter((id) => Number.isInteger(id) && id > 0))];
  for (const productId of unique) {
    await refreshProductRating(productId);
  }
}

/** The projection shared by every review read, re-exported for route files. */
export { reviewColumns };
