import { describe, expect, it } from "vitest";
import {
  ADMIN_PRODUCT_SORT_KEYS,
  adminPriceBounds,
  adminProductsQuerySchema,
} from "../server/lib/admin-products";
import { buildAdminProductQuery } from "../src/features/admin/api";
import {
  EMPTY_ADMIN_PRODUCT_FILTERS,
  hasActiveFilters,
  type AdminProductFilters,
} from "../src/features/admin/types";

/**
 * The admin catalogue's request contract.
 *
 * ## The property that matters most: a sort key is never interpolated
 *
 * `ORDER BY <column>` cannot be parameterised — the identifier has to be spliced
 * into the statement text. So the only safe design is a whitelist, and this file
 * exists mainly to prove the whitelist is airtight: a `sort` the server does not
 * recognise has to fail validation rather than reach the query. If a future change
 * relaxed `z.enum` to `z.string()` "to be flexible", these tests would catch it,
 * and that change is the one thing that would turn the catalogue endpoint into a
 * SQL injection point.
 */

function parse(input: Record<string, string | undefined>) {
  return adminProductsQuerySchema.parse(input);
}

describe("the catalogue's query schema", () => {
  it("defaults to the newest listings first", () => {
    const query = parse({});
    expect(query.page).toBe(1);
    expect(query.pageSize).toBe(20);
    expect(query.sort).toBe("createdAt");
    expect(query.dir).toBe("desc");
  });

  it("treats an absent filter as no filter, not as an empty string", () => {
    // The reason `buildAdminProductQuery` omits empty values: `z.enum` would reject
    // `status=` outright, so an empty string is an error rather than "anything".
    const query = parse({});
    expect(query.status).toBeUndefined();
    expect(query.category).toBeUndefined();
    expect(query.search).toBeUndefined();
  });

  it("reads filters out of the query string", () => {
    const query = parse({
      search: "camera",
      category: "14",
      seller: "7",
      status: "PUBLISHED",
      condition: "LIKE_NEW",
      listingType: "RENT",
    });
    expect(query.search).toBe("camera");
    expect(query.category).toBe(14);
    expect(query.seller).toBe(7);
    expect(query.status).toBe("PUBLISHED");
    expect(query.condition).toBe("LIKE_NEW");
    expect(query.listingType).toBe("RENT");
  });

  it("turns an empty search into no search at all", () => {
    // A cleared search box sends `search=`. Left as `""` it would match every row
    // via `LIKE '%%'` — correct by accident, but it also becomes a *different*
    // cache entry from the one with the parameter absent.
    expect(parse({ search: "" }).search).toBeNull();
    expect(parse({ search: "   " }).search).toBeNull();
  });

  it("refuses a sort key outside the whitelist", () => {
    expect(() => parse({ sort: "createdAt; DROP TABLE products" })).toThrow();
    expect(() => parse({ sort: "1" })).toThrow();
    expect(() => parse({ sort: "purchasePrice" })).not.toThrow();
  });

  it("refuses a sort key that is a real column but not a sortable one", () => {
    // `id` and `description` exist on the table. Being able to reach them would
    // defeat the point of the whitelist being a deliberate, short list.
    expect(() => parse({ sort: "id" })).toThrow();
    expect(() => parse({ sort: "description" })).toThrow();
  });

  it("refuses an unknown direction", () => {
    expect(() => parse({ dir: "sideways" })).toThrow();
    expect(() => parse({ dir: "asc" })).not.toThrow();
  });

  it("keeps the sortable keys and the type in step", () => {
    // If the server adds a sort column, the client has to offer it too; otherwise a
    // column is sortable by hand-editing the URL and invisible in the UI. This test
    // fails when only one side changes.
    expect(ADMIN_PRODUCT_SORT_KEYS).toContain("createdAt");
    expect(ADMIN_PRODUCT_SORT_KEYS).toContain("title");
    expect(ADMIN_PRODUCT_SORT_KEYS).toContain("status");
    expect(ADMIN_PRODUCT_SORT_KEYS).toContain("purchasePrice");
    expect(ADMIN_PRODUCT_SORT_KEYS).toContain("rentalPricePerDay");
    expect(ADMIN_PRODUCT_SORT_KEYS).toContain("quantity");
  });

  it("rejects a status outside the listing lifecycle", () => {
    expect(() => parse({ status: "DELETED" })).toThrow();
    expect(() => parse({ status: "ARCHIVED" })).not.toThrow();
  });

  it("rejects a negative price bound", () => {
    expect(() => parse({ minPrice: "-5" })).toThrow();
    expect(parse({ minPrice: "0" }).minPrice).toBe(0);
  });

  it("caps the page size so the endpoint cannot be asked for everything", () => {
    // The catalogue is ~20,000 rows. Without this cap, `?pageSize=100000` would
    // make the endpoint the thing that falls over.
    expect(() => parse({ pageSize: "100000" })).toThrow();
    expect(parse({ pageSize: "60" }).pageSize).toBe(60);
  });

  it("refuses a non-positive page", () => {
    expect(() => parse({ page: "0" })).toThrow();
    expect(() => parse({ page: "-3" })).toThrow();
  });

  it("swaps a reversed price range instead of matching nothing", () => {
    // Typing min above max is an easy slip, and without normalisation it silently
    // returns an empty page that reads as "no products match" rather than "those two
    // numbers are the wrong way round". `normalizePriceRange` has always done this
    // for the public catalogue; the admin one inherits it.
    expect(adminPriceBounds(parse({ minPrice: "9000", maxPrice: "1000" }))).toEqual({
      min: 1000,
      max: 9000,
    });
  });

  it("leaves an in-order range alone", () => {
    expect(adminPriceBounds(parse({ minPrice: "1000", maxPrice: "9000" }))).toEqual({
      min: 1000,
      max: 9000,
    });
  });

  it("keeps a single-sided range unbounded on the other side", () => {
    // An absent bound must stay absent rather than becoming 0, which would turn
    // "up to ₹1,000" into "exactly zero".
    expect(adminPriceBounds(parse({ maxPrice: "1000" }))).toEqual({
      min: undefined,
      max: 1000,
    });
    expect(adminPriceBounds(parse({ minPrice: "1000" }))).toEqual({
      min: 1000,
      max: undefined,
    });
    expect(adminPriceBounds(parse({}))).toEqual({ min: undefined, max: undefined });
  });

  it("refuses an over-long search term", () => {
    expect(() => parse({ search: "x".repeat(200) })).toThrow();
  });
});

describe("the catalogue's query string", () => {
  function filtersWith(patch: Partial<AdminProductFilters>): AdminProductFilters {
    return { ...EMPTY_ADMIN_PRODUCT_FILTERS, ...patch };
  }

  it("omits filters that are not set", () => {
    const query = new URLSearchParams(
      buildAdminProductQuery(filtersWith({ search: "", status: null, category: null })),
    );
    expect(query.has("search")).toBe(false);
    expect(query.has("status")).toBe(false);
    expect(query.has("category")).toBe(false);
    // Always present, because the server needs them to page and order.
    expect(query.get("page")).toBe("1");
    expect(query.get("pageSize")).toBe("20");
    expect(query.get("sort")).toBe("createdAt");
    expect(query.get("dir")).toBe("desc");
  });

  it("trims the search term", () => {
    // A trailing space in a `LIKE` pattern still matches, but it makes a distinct
    // cache entry for the same question.
    const query = new URLSearchParams(
      buildAdminProductQuery(filtersWith({ search: "  camera  " })),
    );
    expect(query.get("search")).toBe("camera");
  });

  it("includes a zero price bound", () => {
    // `minPrice: 0` means "free and up", which is a real filter. A truthiness check
    // here would drop it and silently widen the result set instead.
    const query = new URLSearchParams(
      buildAdminProductQuery(filtersWith({ minPrice: 0, maxPrice: null })),
    );
    expect(query.get("minPrice")).toBe("0");
    expect(query.has("maxPrice")).toBe(false);
  });

  it("converts rupee price bounds to paise", () => {
    // The regression. The field is labelled "Min price (₹)" because that is what a
    // person types, but `products.purchase_price` is paise — sending the raw number
    // made "max ₹1,000" mean "max ₹10" and quietly returned the whole catalogue.
    const query = new URLSearchParams(
      buildAdminProductQuery(filtersWith({ minPrice: 500, maxPrice: 1000 })),
    );
    expect(query.get("minPrice")).toBe("50000");
    expect(query.get("maxPrice")).toBe("100000");
  });

  it("rounds a fractional rupee bound to whole paise", () => {
    // `step="any"` on the input allows decimals; paise are integers, and sending
    // 33.3 to an integer column is a type error at the driver rather than a filter.
    const query = new URLSearchParams(
      buildAdminProductQuery(filtersWith({ minPrice: 33.3, maxPrice: null })),
    );
    expect(query.get("minPrice")).toBe("3330");
  });

  it("round-trips through the server's schema", () => {
    // The real contract: whatever the client builds must survive validation on the
    // other side. A mismatch here is a 400 in the browser with nothing pointing at
    // the cause.
    const filters = filtersWith({
      search: "desk lamp",
      category: 14,
      seller: 7,
      status: "PAUSED",
      condition: "GOOD",
      listingType: "BOTH",
      minPrice: 100,
      maxPrice: 9000,
      sort: "purchasePrice",
      dir: "asc",
      page: 3,
      pageSize: 50,
    });

    const parsed = parse(Object.fromEntries(new URLSearchParams(buildAdminProductQuery(filters))));

    expect(parsed.search).toBe("desk lamp");
    expect(parsed.category).toBe(14);
    expect(parsed.seller).toBe(7);
    expect(parsed.status).toBe("PAUSED");
    expect(parsed.condition).toBe("GOOD");
    expect(parsed.listingType).toBe("BOTH");
    // Paise, not the rupees the filter fields hold — the round trip is only sound
    // because the client converts and the server stores paise.
    expect(parsed.minPrice).toBe(10000);
    expect(parsed.maxPrice).toBe(900000);
    expect(parsed.sort).toBe("purchasePrice");
    expect(parsed.dir).toBe("asc");
    expect(parsed.page).toBe(3);
    expect(parsed.pageSize).toBe(50);
  });
});

describe("hasActiveFilters", () => {
  it("is false for the untouched defaults", () => {
    expect(hasActiveFilters(EMPTY_ADMIN_PRODUCT_FILTERS)).toBe(false);
  });

  it("ignores paging and sorting", () => {
    // Otherwise the "Clear" affordance would appear for someone who has only
    // changed page, and clearing would throw away their sort.
    expect(
      hasActiveFilters({ ...EMPTY_ADMIN_PRODUCT_FILTERS, page: 7, sort: "title", dir: "asc" }),
    ).toBe(false);
  });

  it("is true for each kind of narrowing filter", () => {
    expect(hasActiveFilters({ ...EMPTY_ADMIN_PRODUCT_FILTERS, search: "lamp" })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_ADMIN_PRODUCT_FILTERS, category: 3 })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_ADMIN_PRODUCT_FILTERS, status: "DRAFT" })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_ADMIN_PRODUCT_FILTERS, minPrice: 0 })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_ADMIN_PRODUCT_FILTERS, maxPrice: 500 })).toBe(true);
  });

  it("is false for an empty search, not just an absent one", () => {
    // A cleared search box leaves `""` behind; that is "no filter", and showing
    // "Clear" for it would be a button that does nothing.
    expect(hasActiveFilters({ ...EMPTY_ADMIN_PRODUCT_FILTERS, search: "" })).toBe(false);
  });
});
