import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  like,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { categories, productImages, products, users } from "../schema";
import { paginationQuerySchema } from "./api";
import { normalizePriceRange, PRODUCT_CONDITIONS } from "./product-filters";
import { PRODUCT_STATUSES } from "./product-status";

/**
 * The admin product catalogue.
 *
 * ## Why this is its own module
 *
 * The catalogue is the one admin surface big enough to be a mistake: the table has
 * ~20,000 rows and eight filterable columns, so "fetch the products and filter in
 * the browser" is not an option — it ships the entire marketplace to an
 * administrator's laptop and then sorts it there. Everything a request may vary —
 * page, search, filters, sort column and direction — is resolved here, validated
 * once, and turned into `WHERE`/`ORDER BY`/`LIMIT` that the database applies.
 *
 * ## The sort column is a whitelist, not a parameter
 *
 * `ORDER BY ${column}` cannot be parameterised, so an interpolated column name is
 * SQL injection. `ADMIN_PRODUCT_SORTS` is therefore the only thing that can reach
 * the query: an unrecognised `sort` falls back to `createdAt` rather than being
 * interpolated. The direction is not a string at all — it is mapped to the `asc` /
 * `desc` *functions*, so it cannot carry an expression.
 */

/** Sort keys the catalogue accepts, mapped to the column they order by. */
export const ADMIN_PRODUCT_SORTS = {
  createdAt: products.createdAt,
  title: products.title,
  status: products.status,
  purchasePrice: products.purchasePrice,
  rentalPricePerDay: products.rentalPricePerDay,
  quantity: products.quantity,
} as const;

export type AdminProductSort = keyof typeof ADMIN_PRODUCT_SORTS;

export const ADMIN_PRODUCT_SORT_KEYS = Object.keys(ADMIN_PRODUCT_SORTS) as AdminProductSort[];

export const ADMIN_PRODUCT_LISTING_TYPES = ["SALE", "RENT", "BOTH"] as const;

/**
 * Search is capped for the same reason the wallet's is: a 4,000-character term is
 * not something the UI can send, so it is someone editing a URL, and truncating it
 * would quietly answer a question nobody asked.
 */
const searchTerm = z
  .string()
  .trim()
  .max(120, "Search is limited to 120 characters.")
  .transform((value) => (value === "" ? null : value));

export const adminProductsQuerySchema = paginationQuerySchema.extend({
  search: searchTerm.nullish(),
  category: z.coerce.number().int().positive().nullish(),
  seller: z.coerce.number().int().positive().nullish(),
  status: z.enum(PRODUCT_STATUSES).nullish(),
  condition: z.enum(PRODUCT_CONDITIONS).nullish(),
  listingType: z.enum(ADMIN_PRODUCT_LISTING_TYPES).nullish(),
  /** Prices are stored in paise; the UI sends and shows rupees. */
  minPrice: z.coerce.number().int().min(0).nullish(),
  maxPrice: z.coerce.number().int().min(0).nullish(),
  sort: z
    .enum(ADMIN_PRODUCT_SORT_KEYS as [AdminProductSort, ...AdminProductSort[]])
    .default("createdAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});

export type AdminProductsQuery = z.infer<typeof adminProductsQuerySchema>;

export type AdminProductRow = {
  id: number;
  title: string;
  slug: string;
  status: string;
  condition: string;
  listingType: string;
  categoryId: number;
  categoryName: string;
  sellerId: number;
  sellerName: string;
  purchasePrice: number | null;
  rentalPricePerDay: number | null;
  quantity: number;
  availableQuantity: number;
  imageUrl: string | null;
  createdAt: Date;
};

function whereFor(query: AdminProductsQuery): SQL | undefined {
  const clauses: (SQL | undefined)[] = [];

  if (query.search) {
    // `like` on the title only. Searching descriptions would need a FULLTEXT index
    // to stay fast, and an admin looking for a listing almost always knows its name.
    const pattern = `%${query.search}%`;
    clauses.push(or(like(products.title, pattern), like(products.slug, pattern)));
  }
  if (query.category) clauses.push(eq(products.categoryId, query.category));
  if (query.seller) clauses.push(eq(products.sellerId, query.seller));
  if (query.status) clauses.push(eq(products.status, query.status));
  if (query.condition) clauses.push(eq(products.condition, query.condition));
  if (query.listingType) clauses.push(eq(products.listingType, query.listingType));

  // Either price counts: a listing is "under ₹5,000" if it sells for that or rents
  // for it, and the two columns are never both populated for a given listing type.
  // A listing's relevant price is in `purchasePrice` or `rentalPricePerDay` — which
  // one depends on its type, and the other is NULL. So the two price columns are
  // OR'd together ("either price is in range"), while the *bounds* within one column
  // are AND'd.
  //
  // Flattening all four comparisons into a single OR is the obvious mistake and it
  // disables the filter entirely: with `minPrice=0` present, `purchasePrice >= 0` is
  // true for every row, so the OR short-circuits and `maxPrice` never restricts
  // anything. The endpoint answered "20,022 of 20,022" for a max of ₹1,000.
  const { min: minPrice, max: maxPrice } = adminPriceBounds(query);
  if (minPrice !== undefined || maxPrice !== undefined) {
    const boundsFor = (column: AnyColumn): SQL => {
      const bounds: SQL[] = [];
      if (minPrice !== undefined) bounds.push(gte(column, minPrice));
      if (maxPrice !== undefined) bounds.push(sql`${column} <= ${maxPrice}`);
      return and(...bounds)!;
    };
    // A NULL price column makes its comparison NULL, which the OR discards — so a
    // rental-only listing is correctly not returned for a sale-price range, and
    // vice versa, instead of being included because one side was NULL.
    clauses.push(or(boundsFor(products.purchasePrice), boundsFor(products.rentalPricePerDay))!);
  }

  const usable = clauses.filter(Boolean) as SQL[];
  return usable.length > 0 ? and(...usable) : undefined;
}

/**
 * The catalogue page, and the total that goes with it.
 *
 * Two queries rather than one windowed one: MySQL's `SQL_CALC_FOUND_ROWS` is
 * deprecated, and a `COUNT(*) OVER ()` window would make the database materialise
 * and count every matching row before discarding all but the page.
 */
/**
 * The price bounds to filter on, in paise, with a reversed range corrected.
 *
 * Split out from `whereFor` because "min above max" has to be *decided* somewhere,
 * and a decision that is only observable by running a 20,000-row query is a decision
 * nobody tests. Both absent bounds mean "no price filter", which is why `undefined`
 * has to survive as `undefined` rather than collapsing to `0`.
 */
export function adminPriceBounds(query: { minPrice?: number | null; maxPrice?: number | null }): {
  min: number | undefined;
  max: number | undefined;
} {
  const { minPrice, maxPrice } = normalizePriceRange(
    query.minPrice ?? undefined,
    query.maxPrice ?? undefined,
  );
  return { min: minPrice, max: maxPrice };
}

export async function listAdminProducts(query: AdminProductsQuery): Promise<{
  rows: AdminProductRow[];
  total: number;
}> {
  const where = whereFor(query);
  const direction = query.dir === "asc" ? asc : desc;
  const orderColumn = ADMIN_PRODUCT_SORTS[query.sort];
  const offset = (query.page - 1) * query.pageSize;

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: products.id,
        title: products.title,
        slug: products.slug,
        status: products.status,
        condition: products.condition,
        listingType: products.listingType,
        categoryId: products.categoryId,
        categoryName: categories.name,
        sellerId: products.sellerId,
        sellerName: users.name,
        purchasePrice: products.purchasePrice,
        rentalPricePerDay: products.rentalPricePerDay,
        quantity: products.quantity,
        availableQuantity: products.availableQuantity,
        imageUrl: sql<string | null>`(
          SELECT ${productImages.url}
          FROM ${productImages}
          WHERE ${productImages.productId} = ${products.id}
          ORDER BY ${productImages.sortOrder} ASC, ${productImages.id} ASC
          LIMIT 1
        )`,
        createdAt: products.createdAt,
      })
      .from(products)
      .innerJoin(users, eq(products.sellerId, users.id))
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(where)
      // `id` breaks ties so pagination is stable: without it, rows with equal sort
      // keys can repeat or vanish between pages.
      .orderBy(direction(orderColumn), direction(products.id))
      .limit(query.pageSize)
      .offset(offset),
    db.select({ value: count() }).from(products).where(where),
  ]);

  return { rows, total: Number(totalRow.value) };
}

/**
 * Filter options for the catalogue's dropdowns.
 *
 * Sellers are capped rather than complete: the filter only needs to cover the
 * sellers an administrator is actually looking for, and sending every seller on a
 * marketplace with tens of thousands of them is a megabyte of dropdown to find one
 * name in. A seller beyond the cap is still reachable by product search or by
 * typing the id into the URL.
 */
export async function listAdminProductFacets(limit = 100) {
  const sellerRows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(sql`${users.role} IN ('SELLER','ADMIN')`)
    .orderBy(asc(users.name))
    .limit(limit);
  const categoryRows = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .orderBy(asc(categories.name));
  return { sellers: sellerRows, categories: categoryRows };
}
