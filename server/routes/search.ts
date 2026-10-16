import { and, asc, desc, eq, gt, gte, inArray, isNull, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { HttpError, ok } from "../lib/api";
import { requireUser } from "../lib/auth";
import { Router } from "../lib/http";
import { guarded } from "../lib/rate-limit";
import { categories, brands, products, searchHistory } from "../schema";
import {
  booleanModeQuery,
  didYouMeanFor,
  HISTORY_MAX_STORED_TERMS,
  HISTORY_MAX_TERM_LENGTH,
  HISTORY_VISIBLE_TERMS as LAST_TERMS,
  isQueryInSuggestWindow,
  isStorableTerm,
  likePrefixes,
  sanitizeQuery,
  SUGGEST_MAX_QUERY_LENGTH,
  tokenize,
  trendingTerms,
  TRENDING_MIN_DISTINCT_USERS,
  TRENDING_WINDOW_DAYS,
} from "../lib/search-suggest";

/**
 * The one search surface (R11): suggestions, the signed-in user's recent
 * searches, and trending terms. The browsing search itself stays where it
 * belongs — `GET /api/products` — this endpoint only answers "what might the
 * user mean, before they commit".
 */

export const searchRoute = new Router();

const NAME_CACHE_MS = 10 * 60_000;
const TRENDING_CACHE_MS = 10 * 60_000;
const MAX_SUGGESTED_PRODUCTS = 5;
const MAX_SUGGESTED_CATEGORIES = 3;
const MAX_SUGGESTED_BRANDS = 3;
const TRENDING_MAX_TERMS = 8;

type SuggestedProduct = {
  id: number;
  slug: string;
  title: string;
  image: string | null;
  pricePerDay: number | null;
  categoryName: string | null;
};

type SuggestedProductRow = {
  id: number;
  slug: string;
  title: string;
  primaryImage: string | null;
  /** Nullable in the schema: rent-only listing types may carry 0... but the column itself allows null. */
  rentalPricePerDay: number | null;
  categoryName: string;
};

const primaryImageColumn = sql<string | null>`(
  SELECT pi.url FROM product_images pi
  WHERE pi.product_id = ${products.id}
  ORDER BY pi.sort_order ASC LIMIT 1
)`;

/** The shared suggest-card projection, reused by the FULLTEXT path and the fallback. */
const suggestedProductColumns = {
  id: products.id,
  slug: products.slug,
  title: products.title,
  primaryImage: primaryImageColumn,
  rentalPricePerDay: products.rentalPricePerDay,
  categoryName: categories.name,
};

const toSuggestedProducts = (rows: SuggestedProductRow[]): SuggestedProduct[] =>
  rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    image: row.primaryImage,
    pricePerDay: row.rentalPricePerDay,
    categoryName: row.categoryName,
  }));

/* ------------------------------ GET /suggest -------------------------------- */

export const suggestQuerySchema = z.object({
  q: z
    .string()
    .transform(sanitizeQuery)
    .refine(isQueryInSuggestWindow, {
      message: `Query must be ${2}–${SUGGEST_MAX_QUERY_LENGTH} characters`,
    }),
});

searchRoute.get(
  "/suggest",
  guarded("search", async (c) => {
    const { q } = suggestQuerySchema.parse({ q: c.req.query("q") ?? "" });
    const tokens = tokenize(q);
    if (tokens.length === 0) {
      throw new HttpError(400, "VALIDATION_ERROR", "Query has no usable search terms");
    }

    // FULLTEXT is the relevance-ranked path (prefix boolean mode on the index in
    // the custom 0019 migration). It ranks, but `search_text` is only maintained
    // by that migration's backfill, so a miss degrades to the prefix index on
    // title rather than returning nothing.
    const booleanQuery = booleanModeQuery(tokens);
    const relevance = sql`MATCH(${products.searchText}) AGAINST(${booleanQuery} IN BOOLEAN MODE)`;
    let productRows: SuggestedProductRow[] = await db
      .select(suggestedProductColumns)
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(and(inArray(products.status, ["PUBLISHED"]), sql`${relevance} > 0`))
      .orderBy(desc(relevance), desc(products.viewCount), desc(products.favoriteCount))
      .limit(MAX_SUGGESTED_PRODUCTS);

    if (productRows.length === 0) {
      // LIKE-prefix fallback. `like` (not `ilike`): MariaDB has no ILIKE, and
      // LIKE is case-insensitive under utf8mb4_unicode_ci. The prefixes were
      // built by the pure module, wildcards stripped.
      const prefixes = likePrefixes(tokens);
      if (prefixes.length > 0) {
        productRows = await db
          .select(suggestedProductColumns)
          .from(products)
          .innerJoin(categories, eq(products.categoryId, categories.id))
          .where(and(inArray(products.status, ["PUBLISHED"]), like(products.title, prefixes[0])))
          .orderBy(desc(products.viewCount))
          .limit(MAX_SUGGESTED_PRODUCTS);
      }
    }

    const likePattern = `%${q.replace(/%/g, "").replace(/_/g, "")}%`;

    const [categoryRows, brandRows, suggestableNames] = await Promise.all([
      db
        .select({
          id: categories.id,
          slug: categories.slug,
          name: categories.name,
          parentId: categories.parentId,
        })
        .from(categories)
        .where(
          and(
            eq(categories.isActive, true),
            or(like(categories.name, likePattern), like(categories.slug, likePattern)),
          ),
        )
        .orderBy(asc(categories.sortOrder), asc(categories.name))
        .limit(MAX_SUGGESTED_CATEGORIES),
      db
        .select({ id: brands.id, slug: brands.slug, name: brands.name })
        .from(brands)
        .where(
          and(
            eq(brands.status, "ACTIVE"),
            or(like(brands.name, likePattern), like(brands.slug, likePattern)),
          ),
        )
        .orderBy(desc(brands.productCount), asc(brands.name))
        .limit(MAX_SUGGESTED_BRANDS),
      suggestableNameList(),
    ]);

    // Category paths need at most one extra query over the handful of matched
    // parents — no second pass over categories, and no products list in JS.
    const parentIds = [
      ...new Set(categoryRows.map((row) => row.parentId).filter((id): id is number => id != null)),
    ];
    const parentNames = new Map<number, string>();
    if (parentIds.length > 0) {
      const parents = await db
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(inArray(categories.id, parentIds));
      for (const parent of parents) parentNames.set(parent.id, parent.name);
    }

    const fewResults = productRows.length < 2;
    const didYouMean = fewResults ? didYouMeanForQuery(q, suggestableNames) : null;

    const payload = {
      query: q,
      products: toSuggestedProducts(productRows),
      categories: categoryRows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        path: row.parentId ? parentNames.get(row.parentId) ?? row.name : row.name,
      })),
      brands: brandRows,
      ...(didYouMean ? { didYouMean } : {}),
    };

    // A 30-second private cache cheaply dedupes keystroke bursts across the
    // box's 250 ms debounce without ever becoming a shell-level public cache.
    c.res.setHeader("Cache-Control", "private, max-age=30");
    return c.json(ok(payload));
  }),
);

/* ------------------------------ name cache ---------------------------------- */

let cachedNames: { names: string[]; at: number } | null = null;

/** Active category + brand names, cached 10 minutes — the did-you-mean *universe*. */
async function suggestableNameList(): Promise<string[]> {
  if (cachedNames && Date.now() - cachedNames.at < NAME_CACHE_MS) return cachedNames.names;
  const [categoryRows, brandRows] = await Promise.all([
    db.select({ name: categories.name }).from(categories).where(eq(categories.isActive, true)),
    db.select({ name: brands.name }).from(brands).where(eq(brands.status, "ACTIVE")),
  ]);
  cachedNames = {
    names: [...categoryRows, ...brandRows].map((row) => row.name),
    at: Date.now(),
  };
  return cachedNames.names;
}

function didYouMeanForQuery(query: string, names: string[]): string | null {
  return didYouMeanFor(query, names);
}

/* ------------------------------- GET /trending ------------------------------- */

let trendingCache: { terms: string[]; source: "history" | "featured"; at: number } | null = null;

searchRoute.get("/trending", guarded("search", async (c) => {
  if (trendingCache && Date.now() - trendingCache.at < TRENDING_CACHE_MS) {
    return c.json(ok({ terms: trendingCache.terms, source: trendingCache.source }));
  }

  const cutoff = new Date(Date.now() - TRENDING_WINDOW_DAYS * 86_400_000);
  const rows = await db
    .select({
      term: searchHistory.term,
      searches: sql<number>`COUNT(*)`,
      distinctUsers: sql<number>`COUNT(DISTINCT ${searchHistory.userId})`,
    })
    .from(searchHistory)
    .where(
      and(
        gte(searchHistory.createdAt, cutoff),
        or(isNull(searchHistory.resultCount), gt(searchHistory.resultCount, 0)),
      ),
    )
    .groupBy(searchHistory.term)
    .having(sql`COUNT(DISTINCT ${searchHistory.userId}) >= ${TRENDING_MIN_DISTINCT_USERS}`)
    .orderBy(
      desc(sql`COUNT(*)`),
      desc(sql`COUNT(DISTINCT ${searchHistory.userId})`),
      asc(searchHistory.term),
    )
    .limit(TRENDING_MAX_TERMS);

  const qualified = trendingTerms(rows.map((row) => ({ ...row })));

  let terms: string[];
  let source: "history" | "featured";
  if (qualified.length > 0) {
    terms = qualified.map((row) => row.term);
    source = "history";
  } else {
    // Cold start: no qualified history at all. Featured categories are public
    // merchandising, so standing in for trending terms leaks nothing.
    const featured = await db
      .select({ name: categories.name })
      .from(categories)
      .where(and(eq(categories.isActive, true), eq(categories.isFeatured, true)))
      .orderBy(asc(categories.sortOrder), asc(categories.name))
      .limit(TRENDING_MAX_TERMS);
    terms = featured.map((row) => row.name);
    source = "featured";
  }

  trendingCache = { terms, source, at: Date.now() };
  return c.json(ok({ terms, source }));
}));

/* --------------------------------- history ---------------------------------- */

export const historyTermSchema = z.object({
  term: z.string(),
  resultCount: z.number().int().min(0).nullable().optional(),
});

searchRoute.get(
  "/history",
  guarded("search.history", async (c) => {
    const user = requireUser(c);
    // `resultCount = 0` meant "searched, found nothing" — never offer a dead
    // end back to the user (the schema comment's contract). Unknown (null)
    // stays visible; the client records what it knew at navigate time.
    const rows = await db
      .select({ id: searchHistory.id, term: searchHistory.term })
      .from(searchHistory)
      .where(
        and(
          eq(searchHistory.userId, user.id),
          or(isNull(searchHistory.resultCount), gt(searchHistory.resultCount, 0)),
        ),
      )
      .orderBy(desc(searchHistory.createdAt), desc(searchHistory.id))
      .limit(LAST_TERMS);
    return c.json(ok(rows));
  }),
);

searchRoute.post(
  "/history",
  guarded("search.history", async (c) => {
    const user = requireUser(c);
    const input = historyTermSchema.parse(await c.req.json());
    const term = sanitizeQuery(input.term);

    // Silence is the feature: an email or a card number typed into search is
    // not a suggestion and must leave no row for anyone to read back. The
    // response is a normal success either way — the client has no need to
    // distinguish, and a 400 would tell an attacker which terms survive.
    if (!isStorableTerm(term) || [...term].length > HISTORY_MAX_TERM_LENGTH) {
      return c.json(ok({ stored: false }), 201);
    }

    await db
      .insert(searchHistory)
      .values({ userId: user.id, term, resultCount: input.resultCount ?? null })
      .onDuplicateKeyUpdate({
        set: { resultCount: input.resultCount ?? null, createdAt: new Date() },
      });

    // Retention is a cap, not a suggestion: prune everything outside the newest
    // 50 rows for this user, in one bounded delete over their own prefix.
    await db.execute(sql`
      DELETE FROM search_history
      WHERE user_id = ${user.id}
        AND id NOT IN (
          SELECT id FROM (
            SELECT id FROM search_history
            WHERE user_id = ${user.id}
            ORDER BY created_at DESC, id DESC
            LIMIT ${HISTORY_MAX_STORED_TERMS}
          ) keep_recent
        )
    `);

    return c.json(ok({ stored: true }), 201);
  }),
);

searchRoute.delete(
  "/history/clear",
  guarded("search.history", async (c) => {
    const user = requireUser(c);
    await db.delete(searchHistory).where(eq(searchHistory.userId, user.id));
    return c.json(ok({ cleared: true }));
  }),
);

searchRoute.delete(
  "/history/:id{[0-9]+}",
  guarded("search.history", async (c) => {
    const user = requireUser(c);
    const id = Number(c.req.param("id"));
    // Ownership lives in the delete predicate: another user's row is the same
    // 404 as a non-existent one, never a 403 confirming an id is real.
    const result = await db
      .delete(searchHistory)
      .where(and(eq(searchHistory.id, id), eq(searchHistory.userId, user.id)));
    if (result[0].affectedRows === 0) {
      throw new HttpError(404, "NOT_FOUND", "Search history entry not found");
    }
    return c.json(ok({ deleted: true }));
  }),
);
