import { Hono } from "hono";
import { z } from "zod";
import { and, asc, desc, eq, gte, inArray, like, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { categories, favorites, productImages, products, productTags, sellerProfiles, users } from "../schema";
import { ok, buildPagination, HttpError } from "../lib/api";
import { requireUser } from "../lib/auth";
import { checkRentalAvailability } from "../lib/rental-availability";
import { slugify } from "../../src/lib/pricing";

export const productsRoute = new Hono();
export const categoriesRoute = new Hono();

/* ------------------------------ categories -------------------------------- */

/**
 * Public category taxonomy.
 *
 * Categories are a two-level tree (`parentId`), ordered by `sortOrder` then name.
 * Every response carries a `productCount` — counted in the database, inflated by
 * nothing — and a `subcategoryCount`, so the UI never has to guess a number the API
 * did not send. Inactive categories are invisible here (and to product search), so
 * retiring a category never requires deleting its products.
 */

/** Only the columns the category UI renders — never the whole row. */
const categoryColumns = {
  id: categories.id,
  name: categories.name,
  slug: categories.slug,
  description: categories.description,
  imageUrl: categories.imageUrl,
  icon: categories.icon,
  parentId: categories.parentId,
  sortOrder: categories.sortOrder,
  isFeatured: categories.isFeatured,
};

export type CategoryRow = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  icon: string | null;
  parentId: number | null;
  sortOrder: number;
  isFeatured: boolean;
};

export type CategorySummary = CategoryRow & {
  productCount: number;
  subcategoryCount: number;
};

/** Active categories in display order (parents and subcategories together). */
async function loadActiveCategories(): Promise<CategoryRow[]> {
  return db
    .select(categoryColumns)
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}

/**
 * ACTIVE products per category, aggregated by the database (one `GROUP BY`, never a
 * product list pulled into memory). A parent's displayed count includes its
 * subcategories' products — the number a shopper expects on a parent tile — and the
 * roll-up walks the handful of category rows, not the product table.
 */
async function loadProductCounts(categoryList: CategoryRow[]): Promise<Map<number, number>> {
  const rows = await db
    .select({ categoryId: products.categoryId, total: sql<number>`COUNT(*)` })
    .from(products)
    .where(eq(products.status, "ACTIVE"))
    .groupBy(products.categoryId);

  const direct = new Map(rows.map((row) => [row.categoryId, Number(row.total)]));
  const childrenOf = new Map<number, number[]>();
  for (const category of categoryList) {
    if (category.parentId === null) continue;
    childrenOf.set(category.parentId, [...(childrenOf.get(category.parentId) ?? []), category.id]);
  }

  const totals = new Map<number, number>();
  const sum = (id: number): number => {
    const cached = totals.get(id);
    if (cached !== undefined) return cached;
    const value =
      (direct.get(id) ?? 0) +
      (childrenOf.get(id) ?? []).reduce((running, child) => running + sum(child), 0);
    totals.set(id, value);
    return value;
  };

  for (const category of categoryList) sum(category.id);
  return totals;
}

/** Counts + tree metadata for every supplied category, rolled up over descendants. */
async function categorySummaries(categoryList: CategoryRow[]): Promise<CategorySummary[]> {
  const counts = await loadProductCounts(categoryList);

  const subcategoryCounts = new Map<number, number>();
  for (const category of categoryList) {
    if (category.parentId === null) continue;
    subcategoryCounts.set(category.parentId, (subcategoryCounts.get(category.parentId) ?? 0) + 1);
  }

  return categoryList.map((category) => ({
    ...category,
    productCount: counts.get(category.id) ?? 0,
    subcategoryCount: subcategoryCounts.get(category.id) ?? 0,
  }));
}

/** Resolves a numeric id or a slug — the same tolerance product lookups have. */
async function resolveCategory(idOrSlug: string): Promise<CategoryRow | null> {
  const isNumericId = /^\d{1,12}$/.test(idOrSlug);
  const [row] = await db
    .select(categoryColumns)
    .from(categories)
    .where(
      and(
        eq(categories.isActive, true),
        isNumericId ? eq(categories.id, Number(idOrSlug)) : eq(categories.slug, idOrSlug),
      ),
    )
    .limit(1);
  return row ?? null;
}

const categoryListQuerySchema = z.object({
  /** `?featured=true` is the curated rail; the flag lives in the database. */
  featured: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === "true"),
});

categoriesRoute.get("/", async (c) => {
  const { featured } = categoryListQuerySchema.parse(c.req.query());
  const summaries = await categorySummaries(await loadActiveCategories());
  return c.json(ok(featured ? summaries.filter((row) => row.isFeatured) : summaries));
});

/** Subcategories of a category (active only), each with its own product count. */
categoriesRoute.get("/:idOrSlug/subcategories", async (c) => {
  const resolved = await resolveCategory(c.req.param("idOrSlug"));
  if (!resolved) throw new HttpError(404, "NOT_FOUND", "Category not found.");

  const summaries = await categorySummaries(await loadActiveCategories());
  return c.json(ok(summaries.filter((row) => row.parentId === resolved.id)));
});

/**
 * One category plus its parent, so breadcrumbs render from a single request.
 * Inactive or unknown categories 404 — the client never supplies anything trusted.
 */
categoriesRoute.get("/:idOrSlug", async (c) => {
  const resolved = await resolveCategory(c.req.param("idOrSlug"));
  if (!resolved) throw new HttpError(404, "NOT_FOUND", "Category not found.");

  const summaries = await categorySummaries(await loadActiveCategories());
  const category = summaries.find((row) => row.id === resolved.id)!;
  const parent = category.parentId
    ? (summaries.find((row) => row.id === category.parentId) ?? null)
    : null;

  return c.json(ok({ ...category, parent }));
});

const categorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).optional(),
});

categoriesRoute.post("/", async (c) => {
  requireUser(c);
  const { role } = c.get("user")!;
  if (role !== "ADMIN") throw new HttpError(403, "FORBIDDEN", "Admin access required.");
  const input = categorySchema.parse(await c.req.json());
  const [created] = await db.insert(categories).values({ ...input, slug: slugify(input.name) });
  return c.json(ok(created), 201);
});

categoriesRoute.patch("/:id", async (c) => {
  requireUser(c);
  const { role } = c.get("user")!;
  if (role !== "ADMIN") throw new HttpError(403, "FORBIDDEN", "Admin access required.");
  const id = Number(c.req.param("id"));
  const input = categorySchema.partial().parse(await c.req.json());
  const [updated] = await db
    .update(categories)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(categories.id, id));
  if (!updated) throw new HttpError(404, "NOT_FOUND", "Category not found.");
  return c.json(ok(updated));
});

categoriesRoute.delete("/:id", async (c) => {
  requireUser(c);
  const { role } = c.get("user")!;
  if (role !== "ADMIN") throw new HttpError(403, "FORBIDDEN", "Admin access required.");
  const id = Number(c.req.param("id"));
  await db.delete(categories).where(eq(categories.id, id));
  return c.json(ok({ deleted: true }));
});

/* ------------------------------- listing type ------------------------------ */

export type ProductRow = typeof products.$inferSelect;

export type ProductCard = {
  id: number;
  slug: string;
  title: string;
  location: string;
  categoryId: number;
  categoryName: string;
  condition: string;
  listingType: string;
  status: string;
  purchasePrice: number | null;
  rentalPricePerDay: number | null;
  rentalPricePerWeek: number | null;
  rentalPricePerMonth: number | null;
  securityDeposit: number | null;
  ratingAverage: number;
  ratingCount: number;
  favoriteCount: number;
  viewCount: number;
  primaryImage: string | null;
  distanceKm: number | null;
  availableQuantity: number;
  /** Whether the requesting user has saved this product (false for guests). */
  isFavorited: boolean;
};

/**
 * Whether the *viewer* has saved this product, as a correlated EXISTS.
 *
 * This is how a product list avoids the N+1 "one request per card" pattern: the
 * flag travels with the card the client already fetched. Guests pass no id, and
 * user 0 owns no favourites, so they always receive `false` — the contract is
 * "always present, never wrong" rather than "omitted".
 */
function isFavoritedColumn(viewerId: number | undefined) {
  return sql<number>`EXISTS (
    SELECT 1 FROM favorites fav
    WHERE fav.product_id = ${products.id}
      AND fav.user_id = ${viewerId ?? 0}
  )`;
}

/** The shared card projection; `viewerId` adds the viewer's own saved flag. */
export function productCardColumns(viewerId?: number) {
  return {
    id: products.id,
    slug: products.slug,
    title: products.title,
    location: products.location,
    categoryId: products.categoryId,
    categoryName: categories.name,
    condition: products.condition,
    listingType: products.listingType,
    status: products.status,
    purchasePrice: products.purchasePrice,
    rentalPricePerDay: products.rentalPricePerDay,
    rentalPricePerWeek: products.rentalPricePerWeek,
    rentalPricePerMonth: products.rentalPricePerMonth,
    securityDeposit: products.securityDeposit,
    ratingAverage: products.ratingAverage,
    ratingCount: products.ratingCount,
    favoriteCount: products.favoriteCount,
    viewCount: products.viewCount,
    availableQuantity: products.availableQuantity,
    isFavorited: isFavoritedColumn(viewerId),
    primaryImage: sql<string | null>`(
      SELECT pi.url FROM product_images pi
      WHERE pi.product_id = ${products.id}
      ORDER BY pi.sort_order ASC LIMIT 1
    )`,
  };
}

/**
 * MariaDB hands EXISTS back as `1`/`0`; the API contract is a real boolean, so
 * every card goes through this one mapper rather than each caller coercing it.
 *
 * The `Omit` is load-bearing: a generic spread would otherwise be typed as
 * `T & { isFavorited: boolean }`, which instantiates to `number & boolean` — i.e.
 * `never` — and takes the whole card type down with it.
 */
export function normalizeProductCard<T extends { isFavorited: unknown }>(row: T) {
  return {
    ...row,
    isFavorited: Boolean(row.isFavorited),
  } as Omit<T, "isFavorited"> & { isFavorited: boolean };
}

/* ------------------------------ search + filters ---------------------------- */

// Filter vocabulary and normalizers live in a dependency-free, unit-tested module.
import {
  normalizeConditions,
  normalizeLegacyType,
  normalizePriceRange,
  PRODUCT_AVAILABILITY,
  PRODUCT_MODES,
  PRODUCT_SORTS,
  type ProductMode,
} from "../lib/product-filters";

export const productSearchSchema = z.object({
  // Browse vocabulary (Feature 04).
  search: z.string().trim().max(120).optional(),
  mode: z.enum(PRODUCT_MODES).optional(),
  availability: z.enum(PRODUCT_AVAILABILITY).optional(),
  seller: z.coerce.number().int().positive().optional(),
  // Legacy names other features still send — both work, `search`/`mode` win.
  q: z.string().trim().max(120).optional(),
  type: z.enum(["SALE", "RENT", "BOTH"]).optional(),
  category: z.string().trim().max(60).optional(),
  condition: z.string().trim().max(120).optional(),
  brand: z.string().trim().max(80).optional(),
  tag: z.string().trim().max(40).optional(),
  location: z.string().trim().max(120).optional(),
  /** Paise, not rupees — the client converts. */
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  availableOnly: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
  sort: z.enum(PRODUCT_SORTS).optional().default("recommended"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(20),
});

export type ProductSearchQuery = z.infer<typeof productSearchSchema>;

/**
 * Price bounds are always in paise. The column they apply to follows the mode, so
 * a rent filter never matches against a sale price (and vice versa). With no mode
 * an item matches when either of its prices falls in range.
 */
function priceConditions(
  minPrice: number | undefined,
  maxPrice: number | undefined,
  mode: ProductMode | undefined,
): SQL[] {
  const out: SQL[] = [];

  if (mode === "rent" || mode === "buy") {
    const column = mode === "rent" ? products.rentalPricePerDay : products.purchasePrice;
    if (minPrice !== undefined) out.push(gte(column, minPrice));
    if (maxPrice !== undefined) out.push(lte(column, maxPrice));
    return out;
  }

  if (minPrice !== undefined) {
    out.push(or(gte(products.purchasePrice, minPrice), gte(products.rentalPricePerDay, minPrice))!);
  }
  if (maxPrice !== undefined) {
    out.push(or(lte(products.purchasePrice, maxPrice), lte(products.rentalPricePerDay, maxPrice))!);
  }
  return out;
}

export async function searchProducts(query: ProductSearchQuery, viewerId?: number) {
  const mode = query.mode ?? normalizeLegacyType(query.type);
  const conditions = [eq(products.status, "ACTIVE")];

  const term = query.search ?? query.q;
  if (term) {
    const pattern = `%${term}%`;
    // `like` (not `ilike`): MariaDB has no ILIKE operator, and LIKE is already
    // case-insensitive under the utf8mb4_unicode_ci collation.
    const searchCondition = or(
      like(products.title, pattern),
      like(products.description, pattern),
      like(products.brand, pattern),
      like(products.location, pattern),
      sql`EXISTS (SELECT 1 FROM product_tags pt WHERE pt.product_id = ${products.id} AND pt.tag LIKE ${pattern})`,
    );
    conditions.push(searchCondition!);
  }
  if (query.category) {
    // An inactive category matches nothing — products in a retired category must
    // never be reachable through a category link, even though they stay in stock.
    conditions.push(and(eq(categories.slug, query.category), eq(categories.isActive, true))!);
  }
  if (query.seller !== undefined) {
    conditions.push(eq(products.sellerId, query.seller));
  }

  // Listing mode: rent → rentable (incl. rent+buy), buy → buyable, rent-and-buy → both.
  if (mode === "rent") {
    conditions.push(inArray(products.listingType, ["RENT", "BOTH"]));
  } else if (mode === "buy") {
    conditions.push(inArray(products.listingType, ["SALE", "BOTH"]));
  } else if (mode === "rent-and-buy") {
    conditions.push(eq(products.listingType, "BOTH"));
  }

  const conditionFilter = normalizeConditions(query.condition);
  if (conditionFilter.length) {
    conditions.push(inArray(products.condition, conditionFilter));
  }
  if (query.brand) {
    conditions.push(eq(products.brand, query.brand));
  }
  if (query.tag) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM product_tags pt WHERE pt.product_id = ${products.id} AND pt.tag = ${query.tag})`,
    );
  }
  if (query.location) {
    conditions.push(like(products.location, `%${query.location}%`));
  }

  const priceRange = normalizePriceRange(query.minPrice, query.maxPrice);
  conditions.push(...priceConditions(priceRange.minPrice, priceRange.maxPrice, mode));

  if (query.minRating) {
    conditions.push(gte(products.ratingAverage, query.minRating));
  }

  // Availability is derived from stock the database actually tracks.
  if (query.availability) {
    conditions.push(sql`${products.availableQuantity} > 0`);
    if (query.availability === "for-rent") {
      conditions.push(inArray(products.listingType, ["RENT", "BOTH"]));
    } else if (query.availability === "for-buy") {
      conditions.push(inArray(products.listingType, ["SALE", "BOTH"]));
    }
  } else if (query.availableOnly) {
    conditions.push(sql`${products.availableQuantity} > 0`);
  }

  const orderBy = (() => {
    switch (query.sort) {
      case "newest":
        return desc(products.createdAt);
      case "price_asc":
        return asc(
          sql`COALESCE(${products.purchasePrice}, ${products.rentalPricePerDay}, 999999999)`,
        );
      case "price_desc":
        return desc(sql`COALESCE(${products.purchasePrice}, ${products.rentalPricePerDay}, 0)`);
      case "rental_asc":
        return asc(products.rentalPricePerDay);
      case "most_viewed":
        return desc(products.viewCount);
      case "most_favorited":
        return desc(products.favoriteCount);
      default:
        return desc(sql`${products.ratingAverage} * LOG10(${products.ratingCount} + 2)`);
    }
  })();

  const where = and(...conditions);
  const rows = await db
    .select(productCardColumns(viewerId))
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(where)
    .orderBy(orderBy)
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  const [{ total }] = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(where);

  return { rows: rows.map(normalizeProductCard), total };
}

productsRoute.get("/", async (c) => {
  const query = productSearchSchema.parse(c.req.query());
  const user = c.get("user");
  const { rows, total } = await searchProducts(query, user?.id);
  return c.json(ok(rows, buildPagination(query.page, query.pageSize, total)));
});

/* ----------------------------- product detail ------------------------------ */

/**
 * Products are addressable by numeric id or by slug — both columns are unique.
 * Accepting either means `/products/4360` and `/products/kettle-p4360` resolve to
 * the same listing, and legacy `/product/<slug>` links keep working.
 */
export async function resolveProduct(idOrSlug: string) {
  const isNumericId = /^\d{1,12}$/.test(idOrSlug);
  const [row] = await db
    .select({
      product: products,
      categoryName: categories.name,
      categorySlug: categories.slug,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(isNumericId ? eq(products.id, Number(idOrSlug)) : eq(products.slug, idOrSlug))
    .limit(1);
  return row ?? null;
}

/** Public seller view — never email, phone, password hash or session data. */
export type ProductSellerView = {
  id: number;
  name: string;
  avatarUrl: string | null;
  verified: boolean;
  bio: string | null;
  joinedAt: string;
  listingsCount: number;
  ratingAverage: number;
  ratingCount: number;
};

/** Seller card data, derived only from real columns (no invented statistics). */
async function loadSellerView(sellerId: number): Promise<ProductSellerView | null> {
  const [seller] = await db
    .select({
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      verified: users.verified,
      joinedAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, sellerId))
    .limit(1);
  if (!seller) return null;

  const [[profile], [stats]] = await Promise.all([
    db
      .select({ bio: sellerProfiles.bio })
      .from(sellerProfiles)
      .where(eq(sellerProfiles.userId, sellerId))
      .limit(1),
    db
      .select({
        listingsCount: sql<number>`COUNT(*)`,
        ratingCount: sql<number>`COALESCE(SUM(${products.ratingCount}), 0)`,
        ratingTotal: sql<number>`COALESCE(SUM(${products.ratingAverage} * ${products.ratingCount}), 0)`,
      })
      .from(products)
      .where(and(eq(products.sellerId, sellerId), eq(products.status, "ACTIVE"))),
  ]);

  const ratingCount = Number(stats?.ratingCount ?? 0);
  const ratingTotal = Number(stats?.ratingTotal ?? 0);

  return {
    id: seller.id,
    name: seller.name,
    avatarUrl: seller.avatarUrl,
    verified: seller.verified,
    bio: profile?.bio ?? null,
    joinedAt: seller.joinedAt.toISOString(),
    listingsCount: Number(stats?.listingsCount ?? 0),
    ratingAverage: ratingCount > 0 ? ratingTotal / ratingCount : 0,
    ratingCount,
  };
}

productsRoute.get("/:idOrSlug", async (c) => {
  const resolved = await resolveProduct(c.req.param("idOrSlug"));
  if (!resolved) throw new HttpError(404, "NOT_FOUND", "Product not found.");
  const { product, categoryName, categorySlug } = resolved;
  const viewerId = c.get("user")?.id;

  const [images, tags, seller, viewerFavorite] = await Promise.all([
    db
      .select({ id: productImages.id, url: productImages.url, altText: productImages.altText })
      .from(productImages)
      .where(eq(productImages.productId, product.id))
      .orderBy(asc(productImages.sortOrder)),
    db
      .select({ tag: productTags.tag })
      .from(productTags)
      .where(eq(productTags.productId, product.id)),
    loadSellerView(product.sellerId),
    viewerId
      ? db
          .select({ id: favorites.id })
          .from(favorites)
          .where(and(eq(favorites.userId, viewerId), eq(favorites.productId, product.id)))
          .limit(1)
      : Promise.resolve([]),
  ]);

  // Bump the view counter without holding up the response.
  void db
    .update(products)
    .set({ viewCount: sql`${products.viewCount} + 1` })
    .where(eq(products.id, product.id))
    .catch(() => undefined);

  // Explicit allow-list: only the fields the product page actually renders.
  return c.json(
    ok({
      id: product.id,
      slug: product.slug,
      title: product.title,
      description: product.description,
      categoryId: product.categoryId,
      categoryName,
      categorySlug,
      brand: product.brand,
      condition: product.condition,
      listingType: product.listingType,
      status: product.status,
      location: product.location,
      latitude: product.latitude,
      longitude: product.longitude,
      purchasePrice: product.purchasePrice,
      rentalPricePerDay: product.rentalPricePerDay,
      rentalPricePerWeek: product.rentalPricePerWeek,
      rentalPricePerMonth: product.rentalPricePerMonth,
      securityDeposit: product.securityDeposit,
      minimumRentalDays: product.minimumRentalDays,
      maximumRentalDays: product.maximumRentalDays,
      rentToOwnEnabled: product.rentToOwnEnabled,
      rentToOwnPrice: product.rentToOwnPrice,
      rentCreditPercentage: product.rentCreditPercentage,
      rentCreditCap: product.rentCreditCap,
      quantity: product.quantity,
      availableQuantity: product.availableQuantity,
      viewCount: product.viewCount,
      favoriteCount: product.favoriteCount,
      isFavorited: viewerFavorite.length > 0,
      ratingAverage: product.ratingAverage,
      ratingCount: product.ratingCount,
      allowsDelivery: product.allowsDelivery,
      allowsPickup: product.allowsPickup,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      images,
      tags: tags.map((t) => t.tag),
      seller,
    }),
  );
});

/* -------------------------------- related --------------------------------- */

/** Same-category listings, best-rated first — never the product itself. */
productsRoute.get("/:idOrSlug/related", async (c) => {
  const resolved = await resolveProduct(c.req.param("idOrSlug"));
  if (!resolved) throw new HttpError(404, "NOT_FOUND", "Product not found.");

  const requested = Number(c.req.query("limit") ?? 8);
  const limit = Number.isFinite(requested) ? Math.min(Math.max(Math.floor(requested), 1), 12) : 8;

  const rows = await db
    .select(productCardColumns(c.get("user")?.id))
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(
      and(
        eq(products.status, "ACTIVE"),
        eq(products.categoryId, resolved.product.categoryId),
        ne(products.id, resolved.product.id),
      ),
    )
    .orderBy(
      desc(sql`${products.ratingAverage} * LOG10(${products.ratingCount} + 2)`),
      desc(products.viewCount),
    )
    .limit(limit);

  return c.json(ok(rows.map(normalizeProductCard)));
});

/* ------------------------------ availability ------------------------------- */

const availabilityQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

/**
 * Stock, and — when a date range is supplied — whether that exact window is free.
 * Delegates to the same rental engine the cart and order creation use, so the
 * product page can never disagree with checkout.
 */
productsRoute.get("/:idOrSlug/availability", async (c) => {
  const resolved = await resolveProduct(c.req.param("idOrSlug"));
  if (!resolved) throw new HttpError(404, "NOT_FOUND", "Product not found.");
  const { product } = resolved;

  const rentable = !!product.rentalPricePerDay && product.status === "ACTIVE";
  const { startDate, endDate } = availabilityQuerySchema.parse(c.req.query());

  if (!rentable || !startDate || !endDate) {
    const availableUnits = Math.max(0, product.availableQuantity);
    return c.json(
      ok({
        rentable,
        isAvailable: availableUnits > 0,
        availableUnits,
        totalUnits: product.quantity,
        overlappingRentals: 0,
        minimumRentalDays: product.minimumRentalDays,
        maximumRentalDays: product.maximumRentalDays,
        days: null,
        startDate: null,
        endDate: null,
      }),
    );
  }

  const availability = await checkRentalAvailability(product.id, startDate, endDate);
  return c.json(
    ok({
      rentable: true,
      ...availability,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    }),
  );
});

/* ------------------------------ admin create ------------------------------- */

export const productInputSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(5000),
  categoryId: z.number().int().positive(),
  brand: z.string().trim().max(80).optional(),
  condition: z.enum(["NEW", "LIKE_NEW", "GOOD", "FAIR", "USED"]).default("GOOD"),
  listingType: z.enum(["SALE", "RENT", "BOTH"]).default("SALE"),
  location: z.string().trim().min(2).max(120),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  purchasePrice: z.number().int().min(0).max(10_000_000).nullable().optional(),
  rentalPricePerDay: z.number().int().min(0).max(1_000_000).nullable().optional(),
  rentalPricePerWeek: z.number().int().min(0).max(1_000_000).nullable().optional(),
  rentalPricePerMonth: z.number().int().min(0).max(1_000_000).nullable().optional(),
  securityDeposit: z.number().int().min(0).max(1_000_000).nullable().optional(),
  minimumRentalDays: z.number().int().min(1).max(90).nullable().optional(),
  maximumRentalDays: z.number().int().min(1).max(365).nullable().optional(),
  rentToOwnEnabled: z.boolean().default(false),
  rentToOwnPrice: z.number().int().min(0).nullable().optional(),
  rentCreditPercentage: z.number().int().min(0).max(100).nullable().optional(),
  rentCreditCap: z.number().int().min(0).nullable().optional(),
  quantity: z.number().int().min(1).max(999).default(1),
  images: z.array(z.string().url().max(500)).max(8).default([]),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  allowsDelivery: z.boolean().default(true),
  allowsPickup: z.boolean().default(true),
});

export type ProductInput = z.infer<typeof productInputSchema>;

export async function createProduct(sellerId: number, input: ProductInput) {
  // Verify category exists
  const [category] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, input.categoryId))
    .limit(1);
  if (!category) throw new HttpError(400, "BAD_REQUEST", "Category not found.");

  if (input.listingType !== "SALE" && !input.rentalPricePerDay) {
    throw new HttpError(400, "BAD_REQUEST", "Rental price per day is required for rentals.");
  }
  if (input.listingType !== "RENT" && !input.purchasePrice) {
    throw new HttpError(400, "BAD_REQUEST", "Sale price is required for sale items.");
  }

  const slug = `${slugify(input.title)}-${Math.random().toString(36).slice(2, 8)}`;
  const [created] = await db
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
      status: "ACTIVE",
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
    })
    .$returningId();
  const productId = Number(created.id);

  if (input.images.length) {
    await db.insert(productImages).values(
      input.images.map((url, index) => ({
        productId,
        url,
        sortOrder: index,
      })),
    );
  }
  if (input.tags.length) {
    await db
      .insert(productTags)
      .values(input.tags.map((tag) => ({ productId, tag: tag.toLowerCase() })));
  }

  return { ...created, id: productId, slug };
}
