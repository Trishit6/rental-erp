import { Router } from "../lib/http";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { products, reviews, sellerProfiles, users } from "../schema";
import { ok, HttpError } from "../lib/api";
import { PUBLIC_REVIEW_STATUSES } from "../lib/review-queries";
import { PUBLIC_PRODUCT_STATUSES } from "../lib/product-status";

/**
 * The **public** seller shopfront.
 *
 * ## Why this left `/api/seller/*`
 *
 * `GET /api/seller/profile/:id` was a public read sitting inside the router that
 * everything else in `/api/seller` gates on. That worked only because that
 * router gated on `requireUser`, i.e. it did not gate at all. The moment the
 * seller API started checking the caller's role — which it has to, or "a customer
 * must not reach /seller" is enforced only by a hidden button — the public
 * profile would have inherited a 403 for the visitors it exists to serve.
 *
 * So it lives at `/api/sellers/:id`, where the absence of a guard is a decision
 * rather than an accident. The seller *management* API stays guarded; the
 * shopfront stays open.
 */
export const sellersRoute = new Router();

sellersRoute.get("/:id{[0-9]+}", async (c) => {
  const id = Number(c.req.param("id"));
  const [seller] = await db
    .select({
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      verified: users.verified,
      createdAt: users.createdAt,
    })
    .from(users)
    // A user who is not a seller has no shopfront, whatever `products.seller_id`
    // happens to say. The role is the authorization answer.
    .where(and(eq(users.id, id), inArray(users.role, ["SELLER", "ADMIN"])))
    .limit(1);

  if (!seller) throw new HttpError(404, "NOT_FOUND", "Seller not found.");

  const [profile] = await db
    .select({ bio: sellerProfiles.bio })
    .from(sellerProfiles)
    .where(eq(sellerProfiles.userId, id))
    .limit(1);

  const [listingCount] = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(products)
    .where(and(eq(products.sellerId, id), inArray(products.status, [...PUBLIC_PRODUCT_STATUSES])));

  // Published reviews only. A hidden review is not part of a seller's public
  // reputation, so it must not move the number shown next to their name — the
  // same list the product page and `rating-aggregate.ts` count from.
  const [ratingAgg] = await db
    .select({
      avg: sql<number>`COALESCE(AVG(${reviews.rating}), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(reviews)
    .where(and(eq(reviews.sellerId, id), inArray(reviews.status, [...PUBLIC_REVIEW_STATUSES])));

  return c.json(
    ok({
      id: seller.id,
      name: seller.name,
      avatarUrl: seller.avatarUrl,
      verified: seller.verified,
      joinedAt: seller.createdAt.toISOString(),
      bio: profile?.bio ?? null,
      listingCount: Number(listingCount.value),
      ratingAverage: Math.round(Number(ratingAgg.avg) * 10) / 10,
      ratingCount: Number(ratingAgg.count),
    }),
  );
});
