import { Router } from "../lib/http";
import { z } from "zod";
import { and, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import {
  orderItems,
  orders,
  products,
  rentals,
  reviewHelpfulVotes,
  reviews,
  users,
} from "../schema";
import { buildPagination, HttpError, ok } from "../lib/api";
import { resolveProduct } from "./products";
import {
  buildReviewPublicFilters,
  buildReviewSort,
  checkReviewEligibility,
  isReviewStatus,
  MAX_REVIEW_IMAGES,
  parseReviewImages,
  PUBLIC_REVIEW_STATUSES,
  purchaseTypeForLine,
  resolveReviewFilters,
  REVIEW_PURCHASE_TYPES,
  REVIEW_SORTS,
  REVIEW_STATUSES,
  reviewColumns,
  reviewImageUrlError,
  type ReviewPurchaseType,
  type ReviewStatus,
} from "../lib/review-queries";
import { getProductRatingSummary, refreshProductRating } from "../lib/rating-aggregate";
import { allowedImageHosts } from "../lib/storage";
import { requireAdmin, requireUser } from "../lib/auth";
import { notificationEventKey } from "../lib/notification-events";
import { notify } from "../lib/notifications";

/**
 * Product reviews and ratings.
 *
 * ## The one rule everything else serves
 *
 * **A review is a statement about a transaction, so the server has to find that
 * transaction first.** Every write below takes an `orderItemId`, resolves the
 * line through `order_items → orders`, and checks that the *session user* owns
 * it, that the order is in a state that makes it reviewable, and that no review
 * exists for that line yet. Nothing about the claim is taken from the request:
 * `userId`, `sellerId`, `purchaseType`, `isVerifiedPurchase` and `isPublished`
 * are all derived or read from the row.
 *
 * That is why `POST /api/reviews` is a single ordered lookup rather than a
 * validate-then-insert: there is no point at which an unverified review exists,
 * not even transiently.
 *
 * ## Ownership is never a 403 on someone else's *review*
 *
 * A review id that is not yours is reported as `404`, the same as an id that
 * does not exist. A `403` would confirm the id is real, which is precisely what
 * an IDOR probe is testing for. The one exception is a *seller* acting on a
 * review of their own listing, which is a real permission and is checked against
 * the listing's `sellerId` rather than the review's author.
 */
export const reviewsRoute = new Router();

/* --------------------------------- helpers -------------------------------- */

/**
 * Reviewer-supplied photos. Validated for shape *and* host here, before they can
 * reach the database: `MAX_REVIEW_IMAGES` because a review is not a gallery, and
 * `allowedImageHosts` so a review cannot turn a product page into a beacon for
 * an arbitrary third-party host.
 */
const reviewImagesSchema = z
  .array(z.string().trim().url().max(500))
  .max(MAX_REVIEW_IMAGES)
  .optional()
  .default([]);

/**
 * The review body.
 *
 * `.strict()` is load-bearing rather than decorative: an extra key is a `400`,
 * not something quietly stripped. That is what makes "the client sent
 * `isVerifiedPurchase: true` and we ignored it" a *provable* property of this
 * endpoint instead of a claim in a comment — the schema has no field for it, so
 * the request is refused outright.
 */
const reviewCreateSchema = z
  .object({
    orderItemId: z.number().int().positive(),
    rating: z.number().int().min(1).max(5),
    title: z.string().trim().max(120).optional(),
    comment: z.string().trim().min(10, "Tell other people a little more.").max(2000),
    images: reviewImagesSchema,
  })
  .strict();

/** An edit touches only what the author wrote — never its rating's effect. */
const reviewUpdateSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    title: z.string().trim().max(120).nullable().optional(),
    comment: z.string().trim().min(10, "Tell other people a little more.").max(2000),
    images: reviewImagesSchema,
  })
  .strict();

const reviewReplySchema = z
  .object({
    body: z.string().trim().min(2).max(1000),
  })
  .strict();

/**
 * My-reviews, the seller's view and the moderation queue share one filterable,
 * paginated list — same `.catch()` discipline as the product list, so a mistyped
 * status in a URL degrades to the full list rather than a 400.
 */
const reviewListSchema = z.object({
  status: z.string().trim().nullish().catch(null),
  rating: z.coerce.number().int().min(1).max(5).nullish().catch(null),
  page: z.coerce.number().int().min(1).catch(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).catch(20).default(20),
});

function assertReviewImages(urls: string[]): void {
  if (urls.length > MAX_REVIEW_IMAGES) {
    throw new HttpError(
      400,
      "TOO_MANY_IMAGES",
      `A review can carry up to ${MAX_REVIEW_IMAGES} photos.`,
    );
  }
  const hosts = allowedImageHosts();
  for (const url of urls) {
    const problem = reviewImageUrlError(url, hosts);
    if (problem) throw new HttpError(400, "INVALID_REVIEW_IMAGE", problem);
  }
}

/** Rows the list endpoint returns, joined to their author and listing. */
function reviewListSelection(viewerId: number | null) {
  return {
    ...reviewColumns,
    authorName: users.name,
    authorAvatar: users.avatarUrl,
    productTitle: products.title,
    productSlug: products.slug,
    /** `true` when *this* viewer has already marked the review helpful. */
    viewerMarkedHelpful: viewerId
      ? sql<number>`EXISTS(SELECT 1 FROM review_helpful_votes v
                           WHERE v.review_id = ${reviews.id} AND v.user_id = ${viewerId})`
      : sql<number>`0`,
    /**
     * Whether the viewer wrote this review — resolved in SQL alongside the row so
     * a card can decide whether to offer Edit/Delete without a second request.
     */
    viewerOwnsReview: viewerId ? sql<number>`${reviews.userId} = ${viewerId}` : sql<number>`0`,
  };
}

/**
 * One review, with everything a card renders.
 *
 * `leftJoin` on the product so a removed listing degrades to a review with no
 * link rather than deleting the customer's words from the page.
 */
async function loadReviewRow(reviewId: number, viewerId: number | null) {
  const [row] = await db
    .select(reviewListSelection(viewerId))
    .from(reviews)
    .innerJoin(users, eq(reviews.userId, users.id))
    .leftJoin(products, eq(reviews.productId, products.id))
    .where(eq(reviews.id, reviewId))
    .limit(1);
  return row ?? null;
}

type ReviewRow = NonNullable<Awaited<ReturnType<typeof loadReviewRow>>>;

/** The wire shape. Normalised here so every endpoint returns the same thing. */
function toReviewPayload(row: ReviewRow) {
  return {
    id: row.id,
    rating: row.rating,
    title: row.title,
    comment: row.comment,
    purchaseType: row.purchaseType as ReviewPurchaseType,
    // The badge is a *fact about the row*, not a claim by the client: it is true
    // here precisely because the backend resolved the order line on write.
    isVerifiedPurchase: row.isVerifiedPurchase,
    status: row.status as ReviewStatus,
    isEdited: row.isEdited,
    helpfulCount: row.helpfulCount,
    viewerMarkedHelpful: Boolean(row.viewerMarkedHelpful),
    images: parseReviewImages(row.images),
    sellerReply: row.sellerReply,
    sellerRepliedAt: row.sellerRepliedAt ? row.sellerRepliedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    author: {
      id: row.userId,
      name: row.authorName,
      avatarUrl: row.authorAvatar,
    },
    product: {
      id: row.productId,
      title: row.productTitle,
      slug: row.productSlug,
    },
    /** Only the author sees Edit/Delete; everyone else gets the same card. */
    viewerOwnsReview: Boolean(row.viewerOwnsReview),
    orderItemId: row.orderItemId,
  };
}

/* --------------------------- product review list ---------------------------- */

/**
 * `GET /api/reviews/product/:idOrSlug` — the product page's review section.
 *
 * Filtered, sorted and paginated in SQL, and answered together with the
 * aggregate summary and the viewer's own eligibility in **one** request. Three
 * separate calls would be three round trips for data that has to be consistent
 * with itself — a summary counting reviews the list has filtered out is a bug
 * waiting to happen.
 *
 * The eligibility block is what makes "Write a Review" honest: the button is
 * rendered from *this* answer, so it appears exactly when the server would
 * accept the submission.
 */
reviewsRoute.get("/product/:idOrSlug", async (c) => {
  const viewer = c.get("user");
  const viewerId = viewer?.id ?? null;

  const resolved = await resolveProduct(c.req.param("idOrSlug"));
  if (!resolved) throw new HttpError(404, "NOT_FOUND", "Product not found.");

  const productId = resolved.product.id;
  const filters = resolveReviewFilters(c.req.query());

  const where = and(...buildReviewPublicFilters({ ...filters, productId }));

  const [rows, [{ total }], summary] = await Promise.all([
    db
      .select(reviewListSelection(viewerId))
      .from(reviews)
      .innerJoin(users, eq(reviews.userId, users.id))
      .leftJoin(products, eq(reviews.productId, products.id))
      .where(where)
      .orderBy(...buildReviewSort(filters.sort))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    db.select({ total: count() }).from(reviews).where(where),
    getProductRatingSummary(productId),
  ]);

  return c.json(
    ok(
      {
        items: rows.map(toReviewPayload),
        summary,
        filters,
        /** Which of the viewer's own orders can be reviewed, if any. */
        eligibility: viewerId ? await loadViewerEligibility(viewerId, productId) : null,
      },
      buildPagination(filters.page, filters.pageSize, Number(total)),
    ),
  );
});

/**
 * The viewer's reviewable order lines for one product.
 *
 * One query over `order_items → orders → rentals`, resolved by the shared
 * eligibility rule rather than by a status list written here. Returns the line
 * that would be reviewed, so the form posts an `orderItemId` the server already
 * agrees is valid — and the *only* thing it posts.
 */
async function loadViewerEligibility(viewerId: number, productId: number) {
  const lines = await db
    .select({
      orderItemId: orderItems.id,
      orderId: orderItems.orderId,
      mode: orderItems.mode,
      titleSnapshot: orderItems.titleSnapshot,
      orderStatus: orders.status,
      orderNumber: orders.orderNumber,
      createdAt: orderItems.createdAt,
      rentalId: rentals.id,
      rentalStatus: rentals.status,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .leftJoin(rentals, eq(rentals.orderItemId, orderItems.id))
    .where(and(eq(orderItems.productId, productId), eq(orders.userId, viewerId)))
    .orderBy(desc(orderItems.id));

  if (!lines.length) return { canReview: false as const, reason: null, lines: [] };

  const itemIds = lines.map((line) => line.orderItemId);
  const reviewed = await db
    .select({ orderItemId: reviews.orderItemId, reviewId: reviews.id })
    .from(reviews)
    .where(inArray(reviews.orderItemId, itemIds));
  const reviewByItem = new Map(reviewed.map((row) => [row.orderItemId, row.reviewId]));

  const resolvedLines = lines.map((line) => {
    const purchaseType = purchaseTypeForLine({ mode: line.mode, rentalId: line.rentalId });
    const existingReviewId = reviewByItem.get(line.orderItemId) ?? null;
    const check = checkReviewEligibility({
      purchaseType,
      orderStatus: line.orderStatus,
      rentalStatus: line.rentalStatus,
      alreadyReviewed: existingReviewId !== null,
    });

    return {
      orderItemId: line.orderItemId,
      orderId: line.orderId,
      orderNumber: line.orderNumber,
      title: line.titleSnapshot,
      purchaseType,
      eligible: check.eligible,
      /** Present only when `eligible` is false — why, in a sentence. */
      reason: check.eligible ? null : check.message,
      /** The line's existing review, so the UI can offer Edit instead of Write. */
      existingReviewId,
      purchaseDate: line.createdAt.toISOString(),
    };
  });

  const open = resolvedLines.find((line) => line.eligible);
  return {
    canReview: Boolean(open),
    reason: open ? null : (resolvedLines[0]?.reason ?? null),
    /** The line to write about — the first eligible one. */
    orderItemId: open?.orderItemId ?? null,
    purchaseType: open?.purchaseType ?? null,
    lines: resolvedLines,
  };
}

/* --------------------------------- create ---------------------------------- */

/**
 * `POST /api/reviews` — write a review.
 *
 * One ordered transaction:
 *
 *  1. Resolve `orderItemId` through `order_items → orders` **with the session
 *     user in the WHERE clause**. Another customer's order line is a 404 here,
 *     not a 403 — the same answer as a line that does not exist.
 *  2. Ask `checkReviewEligibility` whether the order's state permits a review.
 *  3. Insert with `userId`/`sellerId`/`purchaseType`/`isVerifiedPurchase` taken
 *     from the resolved row, never from the body.
 *  4. Refresh the product's cached rating and notify the seller.
 *
 * The unique index on `reviews.order_item_id` is the backstop for step 2: two
 * tabs submitting the same line at once race the pre-check, and the loser gets a
 * `409` translated into the same "already reviewed" message.
 */
reviewsRoute.post("/", async (c) => {
  const user = requireUser(c);
  const input = reviewCreateSchema.parse(await c.req.json().catch(() => ({})));
  assertReviewImages(input.images);

  // Ownership in the lookup predicate — see the module comment on 404 vs 403.
  const [line] = await db
    .select({
      orderItemId: orderItems.id,
      orderId: orderItems.orderId,
      productId: orderItems.productId,
      sellerId: orderItems.sellerId,
      mode: orderItems.mode,
      titleSnapshot: orderItems.titleSnapshot,
      orderStatus: orders.status,
      rentalId: rentals.id,
      rentalStatus: rentals.status,
      productSlug: products.slug,
      productTitle: products.title,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(products, eq(orderItems.productId, products.id))
    .leftJoin(rentals, eq(rentals.orderItemId, orderItems.id))
    .where(and(eq(orderItems.id, input.orderItemId), eq(orders.userId, user.id)))
    .limit(1);

  if (!line) throw new HttpError(404, "NOT_FOUND", "That order line was not found.");

  const purchaseType = purchaseTypeForLine({ mode: line.mode, rentalId: line.rentalId });
  const [existing] = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(eq(reviews.orderItemId, line.orderItemId))
    .limit(1);
  if (existing) {
    throw new HttpError(409, "ALREADY_REVIEWED", "You've already reviewed this item.");
  }

  const check = checkReviewEligibility({
    purchaseType,
    orderStatus: line.orderStatus,
    rentalStatus: line.rentalStatus,
    alreadyReviewed: false,
  });
  if (!check.eligible) throw new HttpError(409, check.code, check.message);

  try {
    // `$returningId()` because a MariaDB insert returns no rows, so the id has to
    // come back explicitly before the re-select below.
    const [inserted] = await db
      .insert(reviews)
      .values({
        userId: user.id,
        productId: line.productId,
        sellerId: line.sellerId,
        orderId: line.orderId,
        orderItemId: line.orderItemId,
        rentalId: line.rentalId,
        purchaseType,
        rating: input.rating,
        title: input.title ?? null,
        comment: input.comment,
        // Verified *because* the order above resolved to this user — the flag is
        // the server's conclusion, not a parameter.
        isVerifiedPurchase: true,
        images: input.images.length ? JSON.stringify(input.images) : null,
      })
      .$returningId();

    const reviewId = Number(inserted.id);
    await refreshProductRating(line.productId);
    // Keyed on the review, which the unique index on `order_items`-scoped reviews
    // guarantees is one-per-purchase — so a retried submission cannot tell the seller
    // twice about the same words.
    await notify(db, {
      userId: line.sellerId,
      type: "REVIEW_RECEIVED",
      title: "New review received",
      body: `${user.name} left a ${input.rating}-star ${purchaseType === "RENTAL" ? "rental" : "purchase"} review of ${line.productTitle}.`,
      context: {
        productId: line.productId,
        productSlug: line.productSlug,
        orderId: line.orderId,
        rentalId: line.rentalId,
        orderNumber: null,
      },
      eventKey: notificationEventKey("REVIEW_RECEIVED", reviewId),
      // Seller-side destination: the seller's own reviews workspace, not the public
      // product page the customer's review renders on.
      link: "/dashboard/reviews",
    });

    const created = await loadReviewRow(reviewId, user.id);
    return c.json(ok(created ? toReviewPayload(created) : null), 201);
  } catch (error) {
    // The unique index won the race between two tabs. Report the same thing the
    // pre-check would have, so the client has one message to handle.
    if (error instanceof Error && error.message.includes("Duplicate entry")) {
      throw new HttpError(409, "ALREADY_REVIEWED", "You've already reviewed this item.");
    }
    throw error;
  }
});

/* ---------------------------------- read ----------------------------------- */

/**
 * `GET /api/reviews/:id` — one review. Visible if published, or if it's yours.
 *
 * ## Why the id is constrained to digits
 *
 * `/mine`, `/seller` and `/moderation` are registered *after* this handler, and a
 * router matches in registration order — so a bare `/:id` swallows all three:
 * `GET /api/reviews/mine` matches `/:id` with `id = "mine"`, the id fails to parse,
 * and the endpoint a signed-in customer needs answers 404. The literal routes are
 * never reached, and nothing about the failure points at route ordering.
 *
 * The regex makes the collision impossible rather than merely absent today: `:id`
 * can only ever match digits, so no literal path can be captured by it no matter
 * what is registered later. `tests/review-routes.test.ts` asserts every documented
 * path resolves, so a future rename cannot silently reintroduce the shadowing.
 */
reviewsRoute.get("/:id{[0-9]+}", async (c) => {
  const viewer = c.get("user");
  const reviewId = parseReviewId(c.req.param("id"));

  const row = await loadReviewRow(reviewId, viewer?.id ?? null);
  // A hidden review is a 404 for everyone but its author — otherwise the
  // moderation decision would only apply to the list, not to a shared link.
  if (!row || (row.status !== "PUBLISHED" && row.userId !== viewer?.id)) {
    throw new HttpError(404, "NOT_FOUND", "Review not found.");
  }
  return c.json(ok(toReviewPayload(row)));
});

/* ---------------------------------- edit ----------------------------------- */

/**
 * `PATCH /api/reviews/:id` — edit your own review.
 *
 * Ownership is resolved before anything is written, and `isEdited` is set by the
 * server. Editing never re-verifies: the order that proved the review is still
 * the same one, so `isVerifiedPurchase` is deliberately left alone.
 */
reviewsRoute.patch("/:id{[0-9]+}", async (c) => {
  const user = requireUser(c);
  const reviewId = parseReviewId(c.req.param("id"));
  const input = reviewUpdateSchema.parse(await c.req.json().catch(() => ({})));
  assertReviewImages(input.images);

  const [existing] = await db
    .select({
      id: reviews.id,
      userId: reviews.userId,
      productId: reviews.productId,
      images: reviews.images,
    })
    .from(reviews)
    .where(and(eq(reviews.id, reviewId), eq(reviews.userId, user.id)))
    .limit(1);

  // Another user's review is a 404: confirming it exists would leak its id space.
  if (!existing) throw new HttpError(404, "NOT_FOUND", "Review not found.");

  await db
    .update(reviews)
    .set({
      rating: input.rating,
      title: input.title ?? null,
      comment: input.comment,
      images: input.images.length ? JSON.stringify(input.images) : null,
      isEdited: true,
      updatedAt: new Date(),
    })
    .where(eq(reviews.id, reviewId));

  // Only the rating affects the aggregate, but recomputing is exact and cheap.
  await refreshProductRating(existing.productId);

  const row = await loadReviewRow(reviewId, user.id);
  return c.json(ok(row ? toReviewPayload(row) : null));
});

/* --------------------------------- delete ---------------------------------- */

/**
 * `DELETE /api/reviews/:id` — remove your own review.
 *
 * The unique index on `order_item_id` is what lets the line be reviewed again:
 * deleting the review frees the line, so "delete" is a genuine reversal rather
 * than a permanently spent opportunity.
 */
reviewsRoute.delete("/:id{[0-9]+}", async (c) => {
  const user = requireUser(c);
  const reviewId = parseReviewId(c.req.param("id"));

  const [existing] = await db
    .select({ id: reviews.id, productId: reviews.productId })
    .from(reviews)
    .where(and(eq(reviews.id, reviewId), eq(reviews.userId, user.id)))
    .limit(1);
  if (!existing) throw new HttpError(404, "NOT_FOUND", "Review not found.");

  await db.delete(reviews).where(eq(reviews.id, reviewId));
  await refreshProductRating(existing.productId);

  return c.json(ok({ deleted: true, reviewId }));
});

/* -------------------------------- helpful ---------------------------------- */

/**
 * `POST /api/reviews/:id/helpful` — toggle "this helped".
 *
 * The (review, user) primary key is the entire anti-inflation rule: a second
 * vote from the same person is a constraint violation, and toggling off deletes
 * the row. The denormalised `helpfulCount` is kept in step in the same
 * transaction, so a list can sort by it without a correlated COUNT per row.
 *
 * Voting on your own review is refused — not because it is exploitable (the
 * unique key already stops repeats) but because a self-vote is not information.
 */
reviewsRoute.post("/:id{[0-9]+}/helpful", async (c) => {
  const user = requireUser(c);
  const reviewId = parseReviewId(c.req.param("id"));

  const [row] = await db
    .select({
      id: reviews.id,
      userId: reviews.userId,
      productId: reviews.productId,
      status: reviews.status,
    })
    .from(reviews)
    .where(eq(reviews.id, reviewId))
    .limit(1);
  if (!row || row.status !== "PUBLISHED")
    throw new HttpError(404, "NOT_FOUND", "Review not found.");
  if (row.userId === user.id) {
    throw new HttpError(409, "SELF_REVIEW_VOTE", "You can't mark your own review as helpful.");
  }

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ reviewId: reviewHelpfulVotes.reviewId })
      .from(reviewHelpfulVotes)
      .where(and(eq(reviewHelpfulVotes.reviewId, reviewId), eq(reviewHelpfulVotes.userId, user.id)))
      .limit(1);

    if (existing) {
      await tx
        .delete(reviewHelpfulVotes)
        .where(
          and(eq(reviewHelpfulVotes.reviewId, reviewId), eq(reviewHelpfulVotes.userId, user.id)),
        );
      await tx
        .update(reviews)
        .set({ helpfulCount: sql`GREATEST(${reviews.helpfulCount} - 1, 0)` })
        .where(eq(reviews.id, reviewId));
      return { markedHelpful: false };
    }

    try {
      await tx.insert(reviewHelpfulVotes).values({ reviewId, userId: user.id });
    } catch (error) {
      // Two taps in the same millisecond: the unique key caught it.
      if (error instanceof Error && error.message.includes("Duplicate entry")) {
        throw new HttpError(
          409,
          "ALREADY_MARKED_HELPFUL",
          "You've already marked this as helpful.",
        );
      }
      throw error;
    }
    await tx
      .update(reviews)
      .set({ helpfulCount: sql`${reviews.helpfulCount} + 1` })
      .where(eq(reviews.id, reviewId));
    return { markedHelpful: true };
  });

  const [updated] = await db
    .select({ helpfulCount: reviews.helpfulCount })
    .from(reviews)
    .where(eq(reviews.id, reviewId))
    .limit(1);

  return c.json(ok({ reviewId, helpfulCount: updated?.helpfulCount ?? 0, ...result }));
});

/* ------------------------------ seller reply ------------------------------- */

/**
 * `POST /api/reviews/:id/reply` — the seller answers once, publicly.
 *
 * The permission is checked against the **listing's** `sellerId`, never the
 * review's author: a reply is a statement about the seller's own product, and it
 * must not be a way to edit the customer's words. The original review is never
 * touched by this endpoint.
 */
reviewsRoute.post("/:id{[0-9]+}/reply", async (c) => {
  const user = requireUser(c);
  const reviewId = parseReviewId(c.req.param("id"));
  const input = reviewReplySchema.parse(await c.req.json().catch(() => ({})));

  const [row] = await db
    .select({
      id: reviews.id,
      sellerId: reviews.sellerId,
      userId: reviews.userId,
      productId: reviews.productId,
      productTitle: products.title,
    })
    .from(reviews)
    .innerJoin(products, eq(reviews.productId, products.id))
    .where(eq(reviews.id, reviewId))
    .limit(1);
  if (!row) throw new HttpError(404, "NOT_FOUND", "Review not found.");

  if (row.sellerId !== user.id) {
    throw new HttpError(403, "FORBIDDEN", "You can only reply to reviews of your own listings.");
  }
  if (row.userId === user.id) {
    throw new HttpError(409, "SELF_REVIEW_REPLY", "You cannot reply to your own review.");
  }

  await db
    .update(reviews)
    .set({ sellerReply: input.body, sellerRepliedAt: new Date() })
    .where(eq(reviews.id, reviewId));

  const updated = await loadReviewRow(reviewId, user.id);
  return c.json(ok(updated ? toReviewPayload(updated) : null));
});

/* -------------------------------- my reviews ------------------------------- */

/**
 * `GET /api/reviews/mine` — the signed-in customer's own review history.
 *
 * Scoped by `requireUser` with no id in the path, so "mine" cannot be widened by
 * a parameter. Sorted newest-first and paginated like every other list, because a
 * customer with a long order history has exactly as many reviews as orders.
 */
reviewsRoute.get("/mine", async (c) => {
  const user = requireUser(c);
  const query = reviewListSchema.parse(c.req.query());

  const conditions: SQL[] = [eq(reviews.userId, user.id)];
  if (isReviewStatus(query.status)) conditions.push(eq(reviews.status, query.status));
  if (typeof query.rating === "number") conditions.push(eq(reviews.rating, query.rating));

  const where = and(...conditions);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select(reviewListSelection(user.id))
      .from(reviews)
      .innerJoin(users, eq(reviews.userId, users.id))
      .leftJoin(products, eq(reviews.productId, products.id))
      .where(where)
      .orderBy(desc(reviews.createdAt), desc(reviews.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ total: count() }).from(reviews).where(where),
  ]);

  return c.json(
    ok(rows.map(toReviewPayload), buildPagination(query.page, query.pageSize, Number(total))),
  );
});

/* ------------------------------ seller reviews ----------------------------- */

/**
 * `GET /api/reviews/seller` — reviews of the caller's own listings.
 *
 * The `EXISTS` subquery is what makes "only my products" a database fact rather
 * than a filter applied after the fact: a seller cannot page their way into
 * another seller's reviews, and the count that drives the pagination is counted
 * under the same predicate as the rows.
 *
 * Hidden reviews are included here (with their status) — a seller is entitled to
 * know a review exists and that it was moderated, but the customer-facing
 * product page is unaffected by what they do with that.
 */
reviewsRoute.get("/seller", async (c) => {
  const user = requireUser(c);
  const query = reviewListSchema.parse(c.req.query());

  const owned = sql`(SELECT 1 FROM products p WHERE p.id = ${reviews.productId} AND p.seller_id = ${user.id})`;

  const conditions: SQL[] = [owned];
  if (isReviewStatus(query.status)) conditions.push(eq(reviews.status, query.status));
  if (typeof query.rating === "number") conditions.push(eq(reviews.rating, query.rating));

  const where = and(...conditions);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select(reviewListSelection(user.id))
      .from(reviews)
      .innerJoin(users, eq(reviews.userId, users.id))
      .leftJoin(products, eq(reviews.productId, products.id))
      .where(where)
      .orderBy(desc(reviews.createdAt), desc(reviews.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ total: count() }).from(reviews).where(where),
  ]);

  const productIds = [...new Set(rows.map((row) => row.productId))];
  const [distributions] = await Promise.all([
    db
      .select({
        productId: reviews.productId,
        average: sql<number>`COALESCE(AVG(${reviews.rating}), 0)`,
        count: count(),
      })
      .from(reviews)
      .where(
        and(
          inArray(reviews.productId, productIds),
          inArray(reviews.status, [...PUBLIC_REVIEW_STATUSES]),
        ),
      )
      .groupBy(reviews.productId),
  ]);

  return c.json(
    ok(
      {
        items: rows.map(toReviewPayload),
        /** Per-product aggregates, so the seller's table needs no second request. */
        stats: distributions.map((row) => ({
          productId: row.productId,
          average: Number(Number(row.average).toFixed(2)),
          count: Number(row.count),
        })),
      },
      buildPagination(query.page, query.pageSize, Number(total)),
    ),
  );
});

/* ------------------------------- moderation -------------------------------- */

/**
 * `GET /api/reviews/moderation` — the admin queue.
 *
 * Admin-only and deliberately showing *every* status by default, including
 * hidden ones: a moderator's job is to see what is hidden and decide whether to
 * restore it, so filtering hidden reviews out of their own queue would defeat
 * it. The public product page is unaffected by anything found here.
 */
reviewsRoute.get("/moderation", async (c) => {
  requireAdmin(c);
  const query = reviewListSchema.parse(c.req.query());

  const conditions: SQL[] = [];
  if (isReviewStatus(query.status)) conditions.push(eq(reviews.status, query.status));
  if (typeof query.rating === "number") conditions.push(eq(reviews.rating, query.rating));
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select(reviewListSelection(null))
      .from(reviews)
      .innerJoin(users, eq(reviews.userId, users.id))
      .leftJoin(products, eq(reviews.productId, products.id))
      .where(where)
      .orderBy(desc(reviews.createdAt), desc(reviews.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ total: count() }).from(reviews).where(where),
  ]);

  return c.json(
    ok(rows.map(toReviewPayload), buildPagination(query.page, query.pageSize, Number(total))),
  );
});

/**
 * `PATCH /api/reviews/:id/moderation` — hide or restore a review.
 *
 * Admin-only, and the only place `status` is ever written by anyone but the
 * author-then-moderator path. Restoring is a plain status flip rather than a
 * re-publish flow, because nothing about the review itself changed while it was
 * hidden — only its visibility.
 *
 * Both directions refresh the product's cached rating, because hiding a review
 * must immediately change the average the product card advertises.
 */
reviewsRoute.patch("/:id{[0-9]+}/moderation", async (c) => {
  requireAdmin(c);
  const reviewId = parseReviewId(c.req.param("id"));
  const input = z
    .object({ status: z.enum(REVIEW_STATUSES) })
    .strict()
    .parse(await c.req.json().catch(() => ({})));

  const [existing] = await db
    .select({ id: reviews.id, productId: reviews.productId })
    .from(reviews)
    .where(eq(reviews.id, reviewId))
    .limit(1);
  if (!existing) throw new HttpError(404, "NOT_FOUND", "Review not found.");

  await db
    .update(reviews)
    .set({ status: input.status, updatedAt: new Date() })
    .where(eq(reviews.id, reviewId));
  await refreshProductRating(existing.productId);

  const row = await loadReviewRow(reviewId, null);
  return c.json(ok(row ? toReviewPayload(row) : null));
});

/**
 * `DELETE /api/reviews/:id/moderation` — remove a review outright.
 *
 * The destructive sibling of hiding, kept separate on purpose: hiding is
 * reversible and a moderator should reach for it first. Deleting is only for
 * content that should not exist at all, and it frees the order line for review
 * again just as the author's own delete does.
 */
reviewsRoute.delete("/:id{[0-9]+}/moderation", async (c) => {
  requireAdmin(c);
  const reviewId = parseReviewId(c.req.param("id"));

  const [existing] = await db
    .select({ id: reviews.id, productId: reviews.productId })
    .from(reviews)
    .where(eq(reviews.id, reviewId))
    .limit(1);
  if (!existing) throw new HttpError(404, "NOT_FOUND", "Review not found.");

  await db.delete(reviews).where(eq(reviews.id, reviewId));
  await refreshProductRating(existing.productId);

  return c.json(ok({ deleted: true, reviewId }));
});

/* --------------------------------- helpers --------------------------------- */

function parseReviewId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, "NOT_FOUND", "Review not found.");
  return id;
}

export {
  buildReviewPublicFilters,
  buildReviewSort,
  MAX_REVIEW_IMAGES,
  PUBLIC_REVIEW_STATUSES,
  REVIEW_PURCHASE_TYPES,
  REVIEW_SORTS,
  REVIEW_STATUSES,
};
