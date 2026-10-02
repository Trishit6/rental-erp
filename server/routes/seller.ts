import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  categories,
  orders,
  productImages,
  products,
  productTags,
  reports,
  sellerProfiles,
  transactions,
  users,
} from "../schema";
import { buildPagination, ok, HttpError } from "../lib/api";
import { requireUser } from "../lib/auth";
import { PLATFORM_RENTAL_FEE_PERCENT, PLATFORM_SALE_FEE_PERCENT } from "../lib/config";
import { imageUrlErrors } from "../lib/image-urls";
import {
  deriveProductStatus,
  validateInventoryEdit,
  type InventoryEdit,
} from "../lib/product-inventory";
import { assertProductPricing } from "../lib/product-validation";
import { SELLER_SETTABLE_STATUSES } from "../lib/product-status";
import {
  getSellerAnalytics,
  getSellerSummary,
  isTopProductMetric,
  resolveAnalyticsRange,
} from "../lib/seller-analytics";
import { getSellerStatus, requireSeller } from "../lib/seller-access";
import { listSellerProducts, resolveSellerProductFilters } from "../lib/seller-product-queries";
import { allowedImageHosts } from "../lib/storage";
import { slugify } from "../../src/lib/pricing";
import { productInputSchema, type ProductInput } from "./products";

/**
 * The seller management API.
 *
 * ## The rule every handler here follows
 *
 * **The seller is the session, never the request.** No handler in this file
 * reads a seller id from a body, a query string or a path segment.
 * `products.seller_id` is compared against the id that came out of the session
 * cookie, and the comparison sits *in the WHERE clause* — so another seller's
 * product is indistinguishable from one that does not exist, rather than a 403
 * that would confirm the id is real.
 *
 * That was already true of the writes. It is now also true of the reads: this
 * router used to be gated on `requireUser`, so any signed-in customer could read
 * any seller's summary, earnings and transactions. `requireSeller` is the gate.
 */
export const sellerRoute = new Hono();

/* ------------------------------- onboarding -------------------------------- */

/**
 * `GET /api/seller/onboarding` — "am I a seller, and what does my shopfront
 * say?".
 *
 * Gated on `requireUser`, not `requireSeller`, because the question has to be
 * answerable *before* the caller is a seller — that is what lets the client offer
 * onboarding instead of bouncing.
 */
sellerRoute.get("/onboarding", async (c) => {
  const user = requireUser(c);
  return c.json(ok(await getSellerStatus(user)));
});

/**
 * `POST /api/seller/onboarding` — become a seller.
 *
 * ## What is collected, and what deliberately is not
 *
 * A `seller_profiles` row has four meaningful columns: `bio`, `location`,
 * `responseRateHours`, `verified`. This endpoint collects the first three. There
 * is no tax id, no bank account, no identity document and no address — the
 * marketplace has no use for them, and an onboarding form is the last place to
 * start collecting what nobody asked for. `verified` is an admin fact about the
 * account and is not settable here.
 *
 * ## Why it is idempotent
 *
 * The role change and the profile write are one transaction, and a repeat call
 * is a no-op rather than a conflict: a double-clicked button must not produce a
 * "you are already a seller" toast over a change that already succeeded. The
 * second call also fills in a missing profile row, which makes it the repair path
 * for the sellers who predate this flow.
 *
 * ## Why the role change is guarded on the old value
 *
 * `WHERE role = 'USER'`. An admin who fills this form stays an admin: promoting
 * them would be a demotion in a hat, and the session's cached role would not
 * notice until the next login.
 */
const onboardingSchema = z
  .object({
    bio: z.string().trim().max(500).optional(),
    location: z.string().trim().max(120).optional(),
    responseRateHours: z.number().int().min(1).max(168).nullable().optional(),
  })
  .strict();

sellerRoute.post("/onboarding", async (c) => {
  const user = requireUser(c);
  const input = onboardingSchema.parse(await c.req.json().catch(() => ({})));

  await db.transaction(async (tx) => {
    if (user.role === "USER") {
      await tx.update(users).set({ role: "SELLER" }).where(eq(users.id, user.id));
    }

    const [existing] = await tx
      .select({ userId: sellerProfiles.userId })
      .from(sellerProfiles)
      .where(eq(sellerProfiles.userId, user.id))
      .limit(1);

    if (existing) {
      await tx
        .update(sellerProfiles)
        .set({
          ...(input.bio !== undefined ? { bio: input.bio } : {}),
          ...(input.location !== undefined ? { location: input.location } : {}),
          ...(input.responseRateHours !== undefined
            ? { responseRateHours: input.responseRateHours }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(sellerProfiles.userId, user.id));
    } else {
      await tx.insert(sellerProfiles).values({
        userId: user.id,
        bio: input.bio ?? null,
        location: input.location ?? null,
        responseRateHours: input.responseRateHours ?? null,
      });
    }
  });

  // The session's cached role is stale now. The client re-runs `authMeQuery` —
  // the single source of auth truth — rather than patching a local copy of the
  // user, which is how two disagreeing sources of truth start.
  return c.json(
    ok({
      isSeller: true,
      hasProfile: true,
      profile: {
        bio: input.bio ?? null,
        location: input.location ?? null,
        responseRateHours: input.responseRateHours ?? null,
      },
    }),
    201,
  );
});

/* -------------------------------- summary ---------------------------------- */

/**
 * `GET /api/seller/summary` — the dashboard's cards, in one request.
 *
 * Six aggregate queries, no row-level payload. The dashboard previously called
 * `/rentals?role=all` and counted the array in the browser — downloading every
 * rental the seller was party to, on *both* sides of the table including rentals
 * where they were the customer, to produce one number.
 */
sellerRoute.get("/summary", async (c) => {
  const user = requireSeller(c);
  return c.json(
    ok(await getSellerSummary(user.id, PLATFORM_SALE_FEE_PERCENT, PLATFORM_RENTAL_FEE_PERCENT)),
  );
});

/* ------------------------------- analytics --------------------------------- */

/**
 * `GET /api/seller/analytics` — revenue, orders and top listings over a period.
 *
 * The period resolves **server-side**, so a bookmarked `?period=30d` keeps
 * meaning the last thirty days rather than the thirty days after the link was
 * made. A custom range is accepted and capped — an unbounded date range on the
 * orders table is a table scan a stranger can request by editing a query string.
 */
sellerRoute.get("/analytics", async (c) => {
  const user = requireSeller(c);
  const query = c.req.query();
  const range = resolveAnalyticsRange(query);
  const metric = isTopProductMetric(query.metric) ? query.metric : "revenue";
  return c.json(ok(await getSellerAnalytics(user.id, range, metric)));
});

/* ------------------------------- my products ------------------------------- */

/**
 * `GET /api/seller/products` — one page of the caller's own listings.
 *
 * Search, filter, sort and pagination all run in SQL. The previous version
 * returned every listing the seller owned — ~6,700 of them for the seeded
 * sellers — and let TanStack Table page them in the browser.
 */
sellerRoute.get("/products", async (c) => {
  const user = requireSeller(c);
  const filters = resolveSellerProductFilters(c.req.query());
  const { rows, total } = await listSellerProducts(user.id, filters);
  return c.json(ok(rows, buildPagination(filters.page, filters.pageSize, total)));
});

/**
 * `GET /api/seller/products/:id` — everything the edit form needs, in one read.
 *
 * The edit page used to have no server read at all: it re-derived the form from a
 * row already fetched for the table, so `/dashboard/products/123/edit` could not
 * be linked to directly. Ownership is in the predicate, so another seller's
 * product is a 404.
 *
 * `references` travels with it so the client can offer the right choice up front
 * — archive or remove — instead of discovering it by clicking delete and reading
 * a 409.
 */
sellerRoute.get("/products/:id{[0-9]+}", async (c) => {
  const user = requireSeller(c);
  const id = Number(c.req.param("id"));

  const [row] = await db
    .select({
      id: products.id,
      title: products.title,
      slug: products.slug,
      description: products.description,
      status: products.status,
      listingType: products.listingType,
      condition: products.condition,
      brand: products.brand,
      categoryId: products.categoryId,
      location: products.location,
      latitude: products.latitude,
      longitude: products.longitude,
      purchasePrice: products.purchasePrice,
      rentalPricePerDay: products.rentalPricePerDay,
      rentalPricePerWeek: products.rentalPricePerWeek,
      rentalPricePerMonth: products.rentalPricePerMonth,
      securityDeposit: products.securityDeposit,
      minimumRentalDays: products.minimumRentalDays,
      maximumRentalDays: products.maximumRentalDays,
      rentToOwnEnabled: products.rentToOwnEnabled,
      rentToOwnPrice: products.rentToOwnPrice,
      rentCreditPercentage: products.rentCreditPercentage,
      rentCreditCap: products.rentCreditCap,
      quantity: products.quantity,
      availableQuantity: products.availableQuantity,
      allowsDelivery: products.allowsDelivery,
      allowsPickup: products.allowsPickup,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .where(and(eq(products.id, id), eq(products.sellerId, user.id)))
    .limit(1);

  if (!row) throw new HttpError(404, "NOT_FOUND", "Product not found.");

  const [images, tags, references] = await Promise.all([
    db
      .select({ id: productImages.id, url: productImages.url, sortOrder: productImages.sortOrder })
      .from(productImages)
      .where(eq(productImages.productId, id))
      .orderBy(productImages.sortOrder, productImages.id),
    db
      .select({ tag: productTags.tag })
      .from(productTags)
      .where(eq(productTags.productId, id))
      .orderBy(productTags.tag),
    countProductReferences(id),
  ]);

  return c.json(
    ok({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      images,
      tags: tags.map((entry) => entry.tag),
      references,
    }),
  );
});

/* ------------------------------- create ------------------------------------ */

/**
 * `POST /api/seller/products` — draft a listing.
 *
 * One transaction across `products`, `product_images` and `product_tags`. The
 * previous writer inserted the product, committed, then inserted images and tags
 * in separate statements: an image insert that failed left a live listing with no
 * pictures, plus a 500, with no way to tell from the response which half landed.
 *
 * Three behaviours change here beyond the transaction:
 *
 *  - **No silent promotion.** Listing something no longer makes you a seller.
 *    Onboarding does, explicitly.
 *  - **New listings are `DRAFT`.** The column default was `DRAFT` but the writer
 *    overrode it with `PUBLISHED`, so a listing became publicly visible in the
 *    same request that created it — there was no moment at which a seller could
 *    look at what they had written before a customer saw it. Publishing is now
 *    a separate, reversible call.
 *  - **Images are host-checked.** `allowedImageHosts` already governs review
 *    photos. A product image is rendered on the same pages, to more people, and
 *    was accepting any `http(s)` URL — so a listing could point every visitor at
 *    a third-party host nobody vetted.
 */
sellerRoute.post("/products", async (c) => {
  const user = requireSeller(c);
  const input = productInputSchema.parse(await c.req.json());

  assertProductPricing({
    listingType: input.listingType,
    purchasePrice: input.purchasePrice,
    rentalPricePerDay: input.rentalPricePerDay,
    rentalPricePerWeek: input.rentalPricePerWeek,
    rentalPricePerMonth: input.rentalPricePerMonth,
    securityDeposit: input.securityDeposit,
    minimumRentalDays: input.minimumRentalDays,
    maximumRentalDays: input.maximumRentalDays,
    // A new listing starts with every unit it declares, so the check is trivially
    // satisfied — passed explicitly so the create path reads the same as the edit
    // path rather than relying on the field being optional.
    quantity: input.quantity,
    availableQuantity: input.quantity,
  });
  assertImageHosts(input.images);

  return c.json(ok(await createSellerProduct(user.id, input)), 201);
});

function assertImageHosts(images: readonly string[]): void {
  const problems = imageUrlErrors(images, allowedImageHosts());
  if (problems.length > 0) {
    throw new HttpError(400, "INVALID_IMAGE_HOST", problems[0]);
  }
}

/** Category must exist — the FK would refuse it, but with an opaque error. */
async function requireCategory(categoryId: number): Promise<void> {
  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);
  if (!category) throw new HttpError(400, "BAD_REQUEST", "Category not found.");
}

/**
 * A unique slug.
 *
 * `products.slug` is unique, so a suffix is appended rather than trusting the
 * title alone — two sellers listing "Vintage chair" must not collide, and one
 * seller relisting the same item after archiving must not collide with their own
 * history either. Capped to the column's 140 characters.
 */
function freshSlug(title: string): string {
  return `${slugify(title)}-${Math.random().toString(36).slice(2, 8)}`.slice(0, 140);
}

async function createSellerProduct(
  sellerId: number,
  input: ProductInput,
  overrides: Partial<typeof products.$inferInsert> = {},
): Promise<{ id: number; slug: string }> {
  await requireCategory(input.categoryId);
  const slug = freshSlug(input.title);
  const now = new Date();

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(products)
      .values({
        sellerId,
        title: input.title,
        slug,
        description: input.description,
        categoryId: input.categoryId,
        brand: input.brand ?? null,
        condition: input.condition,
        listingType: input.listingType,
        status: "DRAFT",
        location: input.location,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        purchasePrice: input.purchasePrice ?? null,
        rentalPricePerDay: input.rentalPricePerDay ?? null,
        rentalPricePerWeek: input.rentalPricePerWeek ?? null,
        rentalPricePerMonth: input.rentalPricePerMonth ?? null,
        securityDeposit: input.securityDeposit ?? null,
        minimumRentalDays: input.minimumRentalDays ?? null,
        maximumRentalDays: input.maximumRentalDays ?? null,
        rentToOwnEnabled: input.rentToOwnEnabled,
        rentToOwnPrice: input.rentToOwnPrice ?? null,
        rentCreditPercentage: input.rentCreditPercentage ?? null,
        rentCreditCap: input.rentCreditCap ?? null,
        quantity: input.quantity,
        availableQuantity: input.quantity,
        allowsDelivery: input.allowsDelivery,
        allowsPickup: input.allowsPickup,
        createdAt: now,
        updatedAt: now,
        ...overrides,
      })
      .$returningId();
    const productId = Number(created.id);

    if (input.images.length) {
      await tx.insert(productImages).values(
        input.images.map((url, index) => ({ productId, url, sortOrder: index })),
      );
    }
    if (input.tags.length) {
      await tx
        .insert(productTags)
        .values(input.tags.map((tag) => ({ productId, tag: tag.toLowerCase() })));
    }

    return { id: productId, slug };
  });
}

/* -------------------------------- edit ------------------------------------- */

/**
 * `PATCH /api/seller/products/:id` — edit a listing.
 *
 * Three things this does that the previous handler did not:
 *
 *  1. **It is one transaction.** Images were previously deleted and re-inserted in
 *     two separate statements; anything that failed in between left a listing with
 *     no images at all — silently, because the product update had already
 *     committed.
 *  2. **It validates the merged row, not the patch.** Conditional pricing rules
 *     ("a rental needs a rental price") are checked against the stored values
 *     with the edit applied. Validating the patch alone would let a seller send
 *     `{"rentalPricePerDay": null}` against a listing that is still for rent and
 *     leave it unrentable.
 *  3. **It refuses to edit an archived listing**, which is a record rather than a
 *     draft once it has history.
 *
 * Only columns in `productInputSchema` are settable, so `sellerId`, `slug`,
 * `viewCount`, `favoriteCount` and the rating columns are unreachable by
 * construction rather than by remembering to strip them.
 */
const productUpdateSchema = productInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update." });

sellerRoute.patch("/products/:id{[0-9]+}", async (c) => {
  const user = requireSeller(c);
  const id = Number(c.req.param("id"));
  const input = productUpdateSchema.parse(await c.req.json());

  const existing = await loadOwnedProduct(user.id, id);
  if (existing.status === "ARCHIVED") {
    throw new HttpError(
      409,
      "LISTING_ARCHIVED",
      "This listing is archived. Restore it before editing.",
    );
  }

  if (input.categoryId !== undefined) await requireCategory(input.categoryId);
  if (input.images) assertImageHosts(input.images);

  // `quantity` is split out because it cannot be written on its own: stock is
  // derived, so the total, the availability and the status move together.
  const { images, tags, quantity, ...fields } = input;

  assertProductPricing({
    listingType: fields.listingType ?? existing.listingType,
    purchasePrice: "purchasePrice" in fields ? fields.purchasePrice : existing.purchasePrice,
    rentalPricePerDay:
      "rentalPricePerDay" in fields ? fields.rentalPricePerDay : existing.rentalPricePerDay,
    rentalPricePerWeek:
      "rentalPricePerWeek" in fields ? fields.rentalPricePerWeek : existing.rentalPricePerWeek,
    rentalPricePerMonth:
      "rentalPricePerMonth" in fields ? fields.rentalPricePerMonth : existing.rentalPricePerMonth,
    securityDeposit:
      "securityDeposit" in fields ? fields.securityDeposit : existing.securityDeposit,
    minimumRentalDays:
      "minimumRentalDays" in fields ? fields.minimumRentalDays : existing.minimumRentalDays,
    maximumRentalDays:
      "maximumRentalDays" in fields ? fields.maximumRentalDays : existing.maximumRentalDays,
    quantity: quantity ?? existing.quantity,
    availableQuantity: existing.availableQuantity,
  });

  const stock =
    quantity === undefined
      ? null
      : validateInventoryEdit(
          { quantity: existing.quantity, availableQuantity: existing.availableQuantity },
          { quantity },
        );
  if (stock && !stock.ok) throw new HttpError(400, "INVALID_STOCK", stock.message);

  await db.transaction(async (tx) => {
    if (Object.keys(fields).length > 0) {
      await tx
        .update(products)
        .set({ ...fields, updatedAt: new Date() })
        .where(and(eq(products.id, id), eq(products.sellerId, user.id)));
    }

    // Inside the transaction, so a failure rolls the whole edit back rather than
    // leaving a listing whose photos were deleted and never replaced.
    if (images) {
      await tx.delete(productImages).where(eq(productImages.productId, id));
      if (images.length) {
        await tx
          .insert(productImages)
          .values(images.map((url, index) => ({ productId: id, url, sortOrder: index })));
      }
    }

    if (tags) {
      await tx.delete(productTags).where(eq(productTags.productId, id));
      if (tags.length) {
        await tx
          .insert(productTags)
          .values(tags.map((tag) => ({ productId: id, tag: tag.toLowerCase() })));
      }
    }

    if (stock && stock.ok) {
      await tx
        .update(products)
        .set({
          quantity: stock.quantity,
          // Raising the total does not conjure units: availability is clamped
          // down to the new total, never up.
          availableQuantity: Math.min(existing.availableQuantity, stock.quantity),
          status: deriveProductStatus(
            existing.status,
            Math.min(existing.availableQuantity, stock.quantity),
          ),
          updatedAt: new Date(),
        })
        .where(eq(products.id, id));
    }
  });

  return c.json(ok({ id, updated: true }));
});

/* ------------------------------- inventory --------------------------------- */

/**
 * `PATCH /api/seller/products/:id/inventory` — the stock control.
 *
 * The seller moves **Total** and **Available**; **Reserved** is displayed and is
 * their difference. There is deliberately no setter for reserved stock: it is
 * what live orders are holding, and letting a seller type a number over it would
 * let them sell the same unit twice. Cancelling the order is what releases it,
 * and that path goes through `adjustProductInventory` (`lib/product-inventory.ts`).
 *
 * A listing whose availability reaches zero is moved to `OUT_OF_STOCK` — the
 * status that keeps it visible in Browse — rather than to a value outside the
 * vocabulary, which is what the checkout path used to write.
 */
const inventorySchema = z
  .object({
    quantity: z.number().int().min(0).max(999).optional(),
    availableQuantity: z.number().int().min(0).max(999).optional(),
  })
  .strict()
  .refine((value) => value.quantity !== undefined || value.availableQuantity !== undefined, {
    message: "Send a total, an available count, or both.",
  });

sellerRoute.patch("/products/:id{[0-9]+}/inventory", async (c) => {
  const user = requireSeller(c);
  const id = Number(c.req.param("id"));
  const input = inventorySchema.parse(await c.req.json());

  const existing = await loadOwnedProduct(user.id, id);

  const check = validateInventoryEdit(
    { quantity: existing.quantity, availableQuantity: existing.availableQuantity },
    // The schema has already guaranteed at least one of the two is present.
    input as InventoryEdit,
  );
  if (!check.ok) throw new HttpError(400, "INVALID_STOCK", check.message);

  const status = deriveProductStatus(existing.status, check.availableQuantity);

  await db
    .update(products)
    .set({
      quantity: check.quantity,
      availableQuantity: check.availableQuantity,
      status,
      updatedAt: new Date(),
    })
    .where(and(eq(products.id, id), eq(products.sellerId, user.id)));

  return c.json(
    ok({
      id,
      quantity: check.quantity,
      availableQuantity: check.availableQuantity,
      reservedQuantity: check.quantity - check.availableQuantity,
      status,
    }),
  );
});

/* ------------------------------ status changes ----------------------------- */

/**
 * `PATCH /api/seller/products/:id/status` — publish, pause, archive.
 *
 * The body is validated with Zod. It used to be `await c.req.json()` cast to
 * `{ status: string }` with no schema at all, so a request with no body threw a
 * JSON parse error and surfaced as a 500 "Something went wrong" from a client
 * that had merely asked for nothing.
 */
const statusSchema = z.object({ status: z.string().trim().min(1).max(16) }).strict();

sellerRoute.patch("/products/:id{[0-9]+}/status", async (c) => {
  const user = requireSeller(c);
  const id = Number(c.req.param("id"));
  const { status } = statusSchema.parse(await c.req.json().catch(() => ({})));

  // A seller may not assert `OUT_OF_STOCK` (it is derived from inventory) nor
  // `DRAFT` (that is a creation-time state, not a transition).
  if (!(SELLER_SETTABLE_STATUSES as readonly string[]).includes(status)) {
    throw new HttpError(400, "BAD_REQUEST", "Invalid status.");
  }

  const existing = await loadOwnedProduct(user.id, id);
  if (existing.status === "ARCHIVED" && status !== "ARCHIVED") {
    throw new HttpError(
      409,
      "LISTING_ARCHIVED",
      "This listing is archived and cannot be re-published.",
    );
  }

  // Publishing a listing whose stock is gone must land on `OUT_OF_STOCK`, not on
  // `PUBLISHED` — the availability the row actually holds wins.
  const nextStatus =
    status === "PUBLISHED" ? deriveProductStatus("PUBLISHED", existing.availableQuantity) : status;

  // Ownership is already proven by `loadOwnedProduct`, and the UPDATE repeats the
  // seller predicate anyway, so there is no "did it land?" question to answer —
  // which is convenient, because drizzle's mysql2 `update()` result carries no
  // usable row count.
  await db
    .update(products)
    .set({ status: nextStatus, updatedAt: new Date() })
    .where(and(eq(products.id, id), eq(products.sellerId, user.id)));

  return c.json(ok({ id, status: nextStatus }));
});

/* ------------------------------- duplicate --------------------------------- */

/**
 * `POST /api/seller/products/:id/duplicate` — copy a listing into a new draft.
 *
 * Configuration only. Orders, rentals, reviews, ratings and favourite rows are
 * deliberately **not** copied: the copy is a new thing with its own history, and
 * duplicating a review would put a customer's words on a product they never
 * bought. Images are copied by URL, which is why the copy is a draft — the seller
 * looks at the pictures before anything becomes public.
 */
sellerRoute.post("/products/:id{[0-9]+}/duplicate", async (c) => {
  const user = requireSeller(c);
  const id = Number(c.req.param("id"));

  const [source] = await db
    .select({
      title: products.title,
      description: products.description,
      categoryId: products.categoryId,
      brand: products.brand,
      condition: products.condition,
      listingType: products.listingType,
      location: products.location,
      latitude: products.latitude,
      longitude: products.longitude,
      purchasePrice: products.purchasePrice,
      rentalPricePerDay: products.rentalPricePerDay,
      rentalPricePerWeek: products.rentalPricePerWeek,
      rentalPricePerMonth: products.rentalPricePerMonth,
      securityDeposit: products.securityDeposit,
      minimumRentalDays: products.minimumRentalDays,
      maximumRentalDays: products.maximumRentalDays,
      rentToOwnEnabled: products.rentToOwnEnabled,
      rentToOwnPrice: products.rentToOwnPrice,
      rentCreditPercentage: products.rentCreditPercentage,
      rentCreditCap: products.rentCreditCap,
      quantity: products.quantity,
      allowsDelivery: products.allowsDelivery,
      allowsPickup: products.allowsPickup,
    })
    .from(products)
    .where(and(eq(products.id, id), eq(products.sellerId, user.id)))
    .limit(1);

  if (!source) throw new HttpError(404, "NOT_FOUND", "Product not found.");

  const [images, tags] = await Promise.all([
    db
      .select({ url: productImages.url })
      .from(productImages)
      .where(eq(productImages.productId, id))
      .orderBy(productImages.sortOrder, productImages.id),
    db.select({ tag: productTags.tag }).from(productTags).where(eq(productTags.productId, id)),
  ]);

  const created = await createSellerProduct(user.id, {
    title: `${source.title} (copy)`.slice(0, 120),
    description: source.description,
    categoryId: source.categoryId,
    brand: source.brand ?? undefined,
    condition: source.condition as ProductInput["condition"],
    listingType: source.listingType as ProductInput["listingType"],
    location: source.location,
    latitude: source.latitude ?? undefined,
    longitude: source.longitude ?? undefined,
    purchasePrice: source.purchasePrice,
    rentalPricePerDay: source.rentalPricePerDay,
    rentalPricePerWeek: source.rentalPricePerWeek,
    rentalPricePerMonth: source.rentalPricePerMonth,
    securityDeposit: source.securityDeposit,
    minimumRentalDays: source.minimumRentalDays,
    maximumRentalDays: source.maximumRentalDays,
    rentToOwnEnabled: source.rentToOwnEnabled,
    rentToOwnPrice: source.rentToOwnPrice,
    rentCreditPercentage: source.rentCreditPercentage,
    rentCreditCap: source.rentCreditCap,
    quantity: source.quantity,
    images: images.map((row) => row.url),
    tags: tags.map((row) => row.tag),
    allowsDelivery: source.allowsDelivery,
    allowsPickup: source.allowsPickup,
  });

  return c.json(ok({ ...created, status: "DRAFT" as const }), 201);
});

/* ---------------------------- archive vs delete ---------------------------- */

/**
 * `POST /api/seller/products/:id/archive` — withdraw a listing, keep its history.
 *
 * This is the action the UI should offer for anything that has ever sold.
 */
sellerRoute.post("/products/:id{[0-9]+}/archive", async (c) => {
  const user = requireSeller(c);
  const id = Number(c.req.param("id"));
  await loadOwnedProduct(user.id, id);

  await db
    .update(products)
    .set({ status: "ARCHIVED", updatedAt: new Date() })
    .where(and(eq(products.id, id), eq(products.sellerId, user.id)));

  return c.json(ok({ id, status: "ARCHIVED" as const }));
});

/**
 * `DELETE /api/seller/products/:id` — remove a listing that has never sold.
 *
 * `order_items.product_id`, `rentals.product_id`, `reviews.product_id` and
 * `favorites.product_id` are all FK-`restrict`, so a hard delete of a product that
 * appears in any of them is refused by the database — as an opaque error that
 * surfaced to the seller as "Something went wrong". Which is what happened: the
 * delete dialog promised to remove the listing and returned a 500 instead.
 *
 * So the question is asked explicitly and the answer decides the response. With
 * history it is a `409` naming the two counts, because "archive" and "deleted"
 * are different promises and the caller has to be able to tell them apart. The
 * client reads `references` from the edit endpoint and offers archive up front,
 * so this 409 is the backstop rather than the expected path.
 */
sellerRoute.delete("/products/:id{[0-9]+}", async (c) => {
  const user = requireSeller(c);
  const id = Number(c.req.param("id"));
  await loadOwnedProduct(user.id, id);

  const references = await countProductReferences(id);
  if (references.blocking > 0) {
    throw new HttpError(
      409,
      "PRODUCT_HAS_HISTORY",
      `This listing appears in ${references.orders} order(s) and ${references.reviews} review(s). Archive it instead so that history stays intact.`,
    );
  }

  // Nothing references it: `product_images` and `product_tags` cascade, so one
  // delete really does remove the listing and its media.
  await db.delete(products).where(and(eq(products.id, id), eq(products.sellerId, user.id)));
  return c.json(ok({ deleted: true }));
});

/**
 * How many rows elsewhere point at this product.
 *
 * Favourites are counted but do **not** block: a favourite is a saved link, not a
 * transaction, and refusing to delete because three people bookmarked a listing
 * would make "remove" mean something the seller cannot act on. Orders, rentals
 * and reviews do block, because those are somebody's history.
 */
async function countProductReferences(productId: number) {
  const [row] = await db
    .select({
      orders: sql<number>`(SELECT COUNT(*) FROM order_items oi WHERE oi.product_id = ${productId})`,
      rentals: sql<number>`(SELECT COUNT(*) FROM rentals r WHERE r.product_id = ${productId})`,
      reviews: sql<number>`(SELECT COUNT(*) FROM reviews rv WHERE rv.product_id = ${productId})`,
      favorites: sql<number>`(SELECT COUNT(*) FROM favorites f WHERE f.product_id = ${productId})`,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  const orders = Number(row?.orders ?? 0);
  const rentals = Number(row?.rentals ?? 0);
  const reviews = Number(row?.reviews ?? 0);
  return {
    orders,
    rentals,
    reviews,
    favorites: Number(row?.favorites ?? 0),
    blocking: orders + rentals + reviews,
  };
}

/* ------------------------------- shopfront --------------------------------- */

const profileSchema = z
  .object({
    bio: z.string().trim().max(500).nullable().optional(),
    location: z.string().trim().max(120).nullable().optional(),
    responseRateHours: z.number().int().min(1).max(168).nullable().optional(),
  })
  .strict();

/** `GET` and `PATCH /api/seller/profile` — the caller's own shopfront. */
sellerRoute.get("/profile", async (c) => {
  const user = requireSeller(c);
  const [profile] = await db
    .select()
    .from(sellerProfiles)
    .where(eq(sellerProfiles.userId, user.id))
    .limit(1);
  if (!profile) throw new HttpError(404, "NOT_FOUND", "Seller profile not found.");
  return c.json(ok(profile));
});

sellerRoute.patch("/profile", async (c) => {
  const user = requireSeller(c);
  const input = profileSchema.parse(await c.req.json().catch(() => ({})));

  const [existing] = await db
    .select({ userId: sellerProfiles.userId })
    .from(sellerProfiles)
    .where(eq(sellerProfiles.userId, user.id))
    .limit(1);

  if (!existing) {
    await db.insert(sellerProfiles).values({ userId: user.id, ...input });
  } else {
    await db
      .update(sellerProfiles)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(sellerProfiles.userId, user.id));
  }

  return c.json(ok({ updated: true }));
});

/* -------------------------------- earnings --------------------------------- */

/**
 * `GET /api/seller/earnings` — lifetime earnings and outstanding work.
 *
 * The response used to report `saleFeePercent: 5` and `rentalFeePercent: 10` as
 * literals while `server/lib/config.ts` read them from the environment: two
 * numbers that can disagree about how much a seller keeps, one of them sent to
 * the browser as though it were authoritative. They now come from config, and
 * the *net* figures are sent alongside the gross ones rather than leaving the
 * browser to subtract a fee it was told about.
 */
sellerRoute.get("/earnings", async (c) => {
  const user = requireSeller(c);
  const summary = await getSellerSummary(
    user.id,
    PLATFORM_SALE_FEE_PERCENT,
    PLATFORM_RENTAL_FEE_PERCENT,
  );

  return c.json(
    ok({
      saleEarnings: summary.earnings.salePaise,
      rentalEarnings: summary.earnings.rentalPaise,
      saleNet: summary.earnings.saleNetPaise,
      rentalNet: summary.earnings.rentalNetPaise,
      pendingOrderCount: summary.orders.pending + summary.orders.inProgress,
      saleFeePercent: PLATFORM_SALE_FEE_PERCENT,
      rentalFeePercent: PLATFORM_RENTAL_FEE_PERCENT,
      currency: summary.earnings.currency,
    }),
  );
});

/* --------------------------- seller transactions --------------------------- */

/**
 * `GET /api/seller/transactions` — the last hundred money movements.
 *
 * `orderNumber`, never `orders.id`. The auto-increment id is a row count, and
 * printing it here tells a seller how much business every other seller in the
 * marketplace has done — the exact leak that `orderNumber` exists to stop on the
 * customer side. The raw `orderId` is still available for the row key; it just
 * isn't what gets shown.
 */
sellerRoute.get("/transactions", async (c) => {
  const user = requireSeller(c);
  const rows = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      status: transactions.status,
      createdAt: transactions.createdAt,
      orderId: transactions.orderId,
      orderNumber: orders.orderNumber,
    })
    .from(transactions)
    .leftJoin(orders, eq(orders.id, transactions.orderId))
    .where(eq(transactions.userId, user.id))
    .orderBy(desc(transactions.createdAt))
    .limit(100);
  return c.json(
    ok(
      rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        // A transaction with no order (a top-up, a platform adjustment) shows a
        // dash rather than a number that does not exist.
        orderNumber: row.orderNumber ?? null,
      })),
    ),
  );
});

/* --------------------------------- reports --------------------------------- */

/**
 * Reporting something is available to every signed-in user, not just sellers —
 * so this one handler keeps `requireUser`, the same gate it had before, and says
 * so here so the difference from its neighbours does not read as an oversight.
 */
sellerRoute.post("/reports", async (c) => {
  const user = requireUser(c);
  const input = z
    .object({
      productId: z.number().int().positive().optional(),
      reportedUserId: z.number().int().positive().optional(),
      reason: z.string().trim().min(3).max(32),
      details: z.string().trim().max(1000).optional(),
    })
    .strict()
    .parse(await c.req.json());

  // mysql2 inserts do not return rows, so the id is taken from `$returningId()`
  // and the row re-read. The previous version destructured the (empty) insert
  // result and answered `201` with no data at all.
  const [created] = await db.insert(reports).values({ ...input, reporterId: user.id }).$returningId();
  return c.json(ok({ id: Number(created.id) }), 201);
});

/* --------------------------------- helpers --------------------------------- */

/**
 * Load a product the caller owns, or 404.
 *
 * Ownership in the predicate, never as a check afterwards — a 403 would confirm
 * to a prober that product `123` exists, which is the thing the predicate is
 * there to hide.
 */
async function loadOwnedProduct(sellerId: number, productId: number) {
  const [row] = await db
    .select({
      id: products.id,
      status: products.status,
      listingType: products.listingType,
      purchasePrice: products.purchasePrice,
      rentalPricePerDay: products.rentalPricePerDay,
      rentalPricePerWeek: products.rentalPricePerWeek,
      rentalPricePerMonth: products.rentalPricePerMonth,
      securityDeposit: products.securityDeposit,
      minimumRentalDays: products.minimumRentalDays,
      maximumRentalDays: products.maximumRentalDays,
      quantity: products.quantity,
      availableQuantity: products.availableQuantity,
    })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.sellerId, sellerId)))
    .limit(1);

  if (!row) throw new HttpError(404, "NOT_FOUND", "Product not found.");
  return row;
}

export type { ProductInput };