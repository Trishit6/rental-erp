import { and, asc, count, desc, eq, like, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { categories, products } from "../schema";
import { isProductStatus, type ProductStatus } from "./product-status";

/**
 * Seller product management queries.
 *
 * ## Why this is SQL and not React
 *
 * A seller in the seeded dataset has ~6,700 listings. `getMyProducts` used to
 * return every one of them and let TanStack Table page them in the browser:
 * sorting or searching meant re-sorting a 6,000-row array on each keystroke, and
 * the whole payload crossed the network to render twenty rows. Every filter,
 * sort and page below is therefore a `WHERE` / `ORDER BY` / `LIMIT`, and the
 * browser only ever holds the page it is showing.
 *
 * ## "Most sold" and "most rented" are real aggregates
 *
 * They are computed from `order_items` and `rentals` — the same tables the order
 * and rental screens read — via correlated subqueries, so they cannot drift from
 * the orders a seller can open. They are deliberately *not* columns on
 * `products`: a counter that only updates when someone remembers to update it is
 * how a dashboard ends up confidently wrong.
 *
 * ## The price sorts
 *
 * `purchase_price` is nullable — a rental-only listing has none. Sorting it
 * straight puts every rental at the top of "cheapest" (MySQL sorts `NULL` first)
 * or the bottom, depending on direction, which is nonsense either way. Listings
 * with no purchase price are therefore pushed to the end explicitly, in both
 * directions, rather than being allowed to win or lose by accident.
 */

/** The existing `listing_type` vocabulary, not a seller-specific one. */
export const LISTING_TYPES = ["SALE", "RENT", "BOTH"] as const;
export type ListingType = (typeof LISTING_TYPES)[number];

export function isListingType(value: unknown): value is ListingType {
  return typeof value === "string" && (LISTING_TYPES as readonly string[]).includes(value);
}

/**
 * Stock filters.
 *
 * `in_stock` / `out_of_stock` read `available_quantity`, which is the number the
 * cart and checkout actually enforce. A separate `low_stock` would be a second
 * opinion about availability.
 */
export const SELLER_STOCK_FILTERS = ["in_stock", "out_of_stock"] as const;
export type SellerStockFilter = (typeof SELLER_STOCK_FILTERS)[number];

export const SELLER_PRODUCT_SORTS = [
  "newest",
  "oldest",
  "price_asc",
  "price_desc",
  "most_sold",
  "most_rented",
  "top_rated",
] as const;

export type SellerProductSort = (typeof SELLER_PRODUCT_SORTS)[number];

export const sellerProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(20).default(20),
  search: z.string().trim().max(120).catch("").default(""),
  status: z.string().trim().optional().catch(undefined),
  listingType: z.string().trim().optional().catch(undefined),
  stock: z.string().trim().optional().catch(undefined),
  sort: z.string().trim().optional().catch(undefined),
});

export type ResolvedSellerProductFilters = {
  page: number;
  pageSize: number;
  search: string;
  status: ProductStatus | null;
  listingType: ListingType | null;
  stock: SellerStockFilter | null;
  sort: SellerProductSort;
};

export function resolveSellerProductFilters(raw: unknown): ResolvedSellerProductFilters {
  const parsed = sellerProductsQuerySchema.parse(raw ?? {});
  return {
    page: parsed.page,
    pageSize: parsed.pageSize,
    search: parsed.search.trim(),
    status: isProductStatus(parsed.status) ? parsed.status : null,
    listingType: isListingType(parsed.listingType) ? parsed.listingType : null,
    stock: (SELLER_STOCK_FILTERS as readonly string[]).includes(parsed.stock ?? "")
      ? (parsed.stock as SellerStockFilter)
      : null,
    sort: (SELLER_PRODUCT_SORTS as readonly string[]).includes(parsed.sort ?? "")
      ? (parsed.sort as SellerProductSort)
      : "newest",
  };
}

/**
 * Every predicate, seller scope included.
 *
 * The seller id is applied here rather than at each call site so there is no
 * version of "list my products" that forgets it.
 */
export function buildSellerProductConditions(
  sellerId: number,
  filters: ResolvedSellerProductFilters,
): SQL[] {
  const conditions: SQL[] = [eq(products.sellerId, sellerId)];

  if (filters.search) {
    conditions.push(like(products.title, `%${filters.search}%`));
  }
  if (filters.status) {
    conditions.push(eq(products.status, filters.status));
  }
  if (filters.listingType) {
    conditions.push(eq(products.listingType, filters.listingType));
  }
  if (filters.stock === "in_stock") {
    conditions.push(sql`${products.availableQuantity} > 0`);
  } else if (filters.stock === "out_of_stock") {
    conditions.push(sql`${products.availableQuantity} <= 0`);
  }

  return conditions;
}

/** Units sold of one product, across every order line ever placed for it. */
function soldUnits(productId: SQLWrapper) {
  return sql<number>`(
    SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi
    WHERE oi.product_id = ${productId} AND oi.mode = 'BUY'
  )`;
}

/** Bookings of one product, whether or not the rental has since been closed. */
function rentalCount(productId: SQLWrapper) {
  return sql<number>`(
    SELECT COUNT(*) FROM rentals r WHERE r.product_id = ${productId}
  )`;
}

/** Earnings of one product: rental charges only, never refundable deposits. */
function earnedPaise(productId: SQLWrapper) {
  return sql<number>`(
    SELECT COALESCE(SUM(oi.line_total - oi.security_deposit), 0) FROM order_items oi
    WHERE oi.product_id = ${productId}
  )`;
}

export function buildSellerProductSort(sort: SellerProductSort) {
  switch (sort) {
    case "oldest":
      return [asc(products.createdAt), asc(products.id)];
    case "price_asc":
      // `purchase_price IS NULL` first so rental-only listings sit at the end of
      // a "cheapest first" list rather than leading it. See the note above.
      return [
        asc(sql`${products.purchasePrice} IS NULL`),
        asc(products.purchasePrice),
        asc(products.id),
      ];
    case "price_desc":
      return [
        asc(sql`${products.purchasePrice} IS NULL`),
        desc(products.purchasePrice),
        desc(products.id),
      ];
    case "most_sold":
      return [desc(soldUnits(products.id)), desc(products.id)];
    case "most_rented":
      return [desc(rentalCount(products.id)), desc(products.id)];
    case "top_rated":
      return [desc(products.ratingAverage), desc(products.ratingCount), desc(products.id)];
    case "newest":
    default:
      // `id` breaks ties so page 2 cannot repeat a row from page 1 when a bulk
      // import lands several listings in the same second.
      return [desc(products.createdAt), desc(products.id)];
  }
}

export type SellerProductRow = {
  id: number;
  title: string;
  slug: string;
  status: string;
  listingType: string;
  condition: string;
  categoryName: string;
  purchasePrice: number | null;
  rentalPricePerDay: number | null;
  securityDeposit: number | null;
  quantity: number;
  availableQuantity: number;
  /** `quantity − available_quantity`. Derived, never stored, never settable. */
  reservedQuantity: number;
  viewCount: number;
  favoriteCount: number;
  ratingAverage: number;
  ratingCount: number;
  soldUnits: number;
  rentalCount: number;
  earnedPaise: number;
  createdAt: string;
  primaryImage: string | null;
};

/**
 * One page of one seller's listings.
 *
 * Exactly two queries — the page and the count — so a page of twenty costs the
 * same as a page of one. The per-row aggregates are correlated subqueries rather
 * than a `GROUP BY` over a join, because joining all three tables at once would
 * multiply the rows and make the page wrong before it is sorted.
 */
export async function listSellerProducts(
  sellerId: number,
  filters: ResolvedSellerProductFilters,
): Promise<{ rows: SellerProductRow[]; total: number }> {
  const conditions = buildSellerProductConditions(sellerId, filters);
  const where = and(...conditions);

  const rows = await db
    .select({
      id: products.id,
      title: products.title,
      slug: products.slug,
      status: products.status,
      listingType: products.listingType,
      condition: products.condition,
      categoryName: categories.name,
      purchasePrice: products.purchasePrice,
      rentalPricePerDay: products.rentalPricePerDay,
      securityDeposit: products.securityDeposit,
      quantity: products.quantity,
      availableQuantity: products.availableQuantity,
      viewCount: products.viewCount,
      favoriteCount: products.favoriteCount,
      ratingAverage: products.ratingAverage,
      ratingCount: products.ratingCount,
      soldUnits: soldUnits(products.id),
      rentalCount: rentalCount(products.id),
      earnedPaise: earnedPaise(products.id),
      createdAt: products.createdAt,
      primaryImage: sql<string | null>`(
        SELECT pi.url FROM product_images pi WHERE pi.product_id = ${products.id}
        ORDER BY pi.sort_order ASC LIMIT 1
      )`,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(where)
    .orderBy(...buildSellerProductSort(filters.sort))
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);

  const [counted] = await db
    .select({ total: count() })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(where);

  return {
    total: Number(counted?.total ?? 0),
    rows: rows.map((row) => ({
      ...row,
      ratingAverage: Number(row.ratingAverage),
      soldUnits: Number(row.soldUnits),
      rentalCount: Number(row.rentalCount),
      earnedPaise: Number(row.earnedPaise),
      reservedQuantity: Math.max(0, row.quantity - row.availableQuantity),
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

/** Headline counts for the dashboard, one grouped query per dimension. */
export async function getSellerProductCounts(sellerId: number) {
  const [row] = await db
    .select({
      total: count(),
      active: sql<number>`COALESCE(SUM(${products.status} IN ('PUBLISHED','OUT_OF_STOCK')), 0)`,
      draft: sql<number>`COALESCE(SUM(${products.status} = 'DRAFT'), 0)`,
      paused: sql<number>`COALESCE(SUM(${products.status} = 'PAUSED'), 0)`,
      archived: sql<number>`COALESCE(SUM(${products.status} = 'ARCHIVED'), 0)`,
      outOfStock: sql<number>`COALESCE(SUM(${products.availableQuantity} <= 0), 0)`,
    })
    .from(products)
    .where(eq(products.sellerId, sellerId));

  return {
    total: Number(row?.total ?? 0),
    active: Number(row?.active ?? 0),
    draft: Number(row?.draft ?? 0),
    paused: Number(row?.paused ?? 0),
    archived: Number(row?.archived ?? 0),
    outOfStock: Number(row?.outOfStock ?? 0),
  };
}
