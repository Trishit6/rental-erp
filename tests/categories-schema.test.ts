import { describe, expect, it } from "vitest";
import {
  CATEGORY_SORT_OPTIONS,
  categoryActiveFilterCount,
  categoryActiveFilters,
  categorySearchSchema,
  CLEARED_CATEGORY_FILTERS,
  parseCategorySearch,
  parseCategorySlug,
  toCategoryFilters,
} from "../src/features/categories/components/schema";
import { PRODUCT_SORTS } from "../server/lib/product-filters";

describe("parseCategorySlug", () => {
  it("accepts the slugs the catalogue actually uses", () => {
    expect(parseCategorySlug("electronics")).toBe("electronics");
    expect(parseCategorySlug("home-living")).toBe("home-living");
    expect(parseCategorySlug("  cameras  ")).toBe("cameras");
  });

  it("accepts a numeric id, because the API addresses categories either way", () => {
    expect(parseCategorySlug("42")).toBe("42");
  });

  it("rejects anything that isn't a slug instead of sending it to the API", () => {
    expect(parseCategorySlug("")).toBeUndefined();
    expect(parseCategorySlug("   ")).toBeUndefined();
    expect(parseCategorySlug("Electronics")).toBeUndefined();
    expect(parseCategorySlug("../admin")).toBeUndefined();
    expect(parseCategorySlug("electronics/../users")).toBeUndefined();
    expect(parseCategorySlug("home living")).toBeUndefined();
    expect(parseCategorySlug("a".repeat(61))).toBeUndefined();
    expect(parseCategorySlug(undefined)).toBeUndefined();
    expect(parseCategorySlug(42)).toBeUndefined();
  });

  it("never throws on hostile input", () => {
    expect(() => parseCategorySlug(null)).not.toThrow();
    expect(() => parseCategorySlug({ toString: () => "electronics" })).not.toThrow();
    expect(() => parseCategorySlug(["electronics"])).not.toThrow();
  });
});

describe("parseCategorySearch — the URL is the source of truth", () => {
  it("parses the filters a category page supports", () => {
    expect(
      parseCategorySearch({
        search: "lens",
        subcategory: "cameras",
        mode: "rent",
        condition: "LIKE_NEW",
        availability: "available-now",
        sort: "price_asc",
        minPrice: 500,
        maxPrice: 5000,
        page: 2,
      }),
    ).toMatchObject({
      search: "lens",
      subcategory: "cameras",
      mode: "rent",
      condition: "LIKE_NEW",
      availability: "available-now",
      sort: "price_asc",
      minPrice: 500,
      maxPrice: 5000,
      page: 2,
    });
  });

  it("drops ?category= — the route owns the category, not the query string", () => {
    expect(parseCategorySearch({ category: "fashion" }).category).toBeUndefined();
    expect(parseCategorySearch({ category: "fashion", subcategory: "cameras" })).toMatchObject({
      category: undefined,
      subcategory: "cameras",
    });
  });

  it("accepts numbers as well as strings, because the router JSON-parses params", () => {
    expect(parseCategorySearch({ page: 3, minPrice: "250" })).toMatchObject({
      page: 3,
      minPrice: 250,
    });
  });

  it("swaps a reversed price range rather than building an impossible query", () => {
    expect(parseCategorySearch({ minPrice: 9000, maxPrice: 100 })).toMatchObject({
      minPrice: 100,
      maxPrice: 9000,
    });
  });

  it("drops invalid values cleanly", () => {
    const search = parseCategorySearch({
      mode: "teleport",
      condition: "mint",
      availability: "maybe",
      sort: "cheapest",
      page: 0,
      minPrice: -5,
    });
    expect(search).toMatchObject({
      mode: undefined,
      condition: undefined,
      availability: undefined,
      sort: undefined,
      page: undefined,
      minPrice: undefined,
    });
  });

  it("never throws on junk input", () => {
    expect(() => parseCategorySearch(null as never)).not.toThrow();
    expect(() => parseCategorySearch("nonsense" as never)).not.toThrow();
  });
});

describe("toCategoryFilters — URL state becomes an API request", () => {
  it("pins the request to the route's category", () => {
    const filters = toCategoryFilters({}, "electronics");
    expect(filters.category).toBe("electronics");
    expect(filters.sort).toBe("recommended");
    expect(filters.page).toBe(1);
    expect(filters.pageSize).toBe(12);
  });

  it("lets a subcategory narrow the scope one level down", () => {
    expect(toCategoryFilters({ subcategory: "cameras" }, "electronics").category).toBe("cameras");
  });

  it("uses the route category when no subcategory is chosen", () => {
    expect(toCategoryFilters({ subcategory: undefined }, "home").category).toBe("home");
  });

  it("converts rupee bounds into paise", () => {
    const filters = toCategoryFilters({ minPrice: 500, maxPrice: 5_000 }, "electronics");
    expect(filters.minPrice).toBe(50_000);
    expect(filters.maxPrice).toBe(500_000);
  });

  it("carries search, mode, condition, availability, sort and page through", () => {
    expect(
      toCategoryFilters(
        {
          search: "lens",
          mode: "buy",
          condition: "pre-loved",
          availability: "for-buy",
          sort: "newest",
          page: 3,
        },
        "cameras",
      ),
    ).toMatchObject({
      search: "lens",
      mode: "buy",
      condition: "pre-loved",
      availability: "for-buy",
      sort: "newest",
      page: 3,
      pageSize: 12,
    });
  });

  it("omits price entirely when no bound is set", () => {
    const filters = toCategoryFilters({}, "electronics");
    expect(filters.minPrice).toBeUndefined();
    expect(filters.maxPrice).toBeUndefined();
  });
});

describe("category filter pills", () => {
  it("shows the subcategory as a filter and never the category itself", () => {
    const pills = categoryActiveFilters({ subcategory: "cameras", mode: "rent" });
    expect(pills.map((pill) => pill.key)).toEqual(["subcategory", "mode"]);
    expect(pills[0]!.clear).toEqual(["subcategory"]);
  });

  it("does not count the page or the search term as filters", () => {
    expect(categoryActiveFilterCount({ page: 4 })).toBe(0);
    expect(categoryActiveFilterCount({ search: "lens" })).toBe(0);
  });

  it("counts every active filter", () => {
    expect(
      categoryActiveFilterCount({
        subcategory: "cameras",
        mode: "rent",
        minPrice: 100,
        maxPrice: 900,
        condition: "GOOD",
        availability: "available-now",
        page: 2,
      }),
    ).toBe(5);
  });

  it("clears the subcategory but keeps the search term", () => {
    expect(CLEARED_CATEGORY_FILTERS.subcategory).toBeUndefined();
    expect(CLEARED_CATEGORY_FILTERS.search).toBeUndefined();
  });
});

describe("sort and pagination validation", () => {
  it("offers only sort keys the API whitelists", () => {
    for (const option of CATEGORY_SORT_OPTIONS) expect(PRODUCT_SORTS).toContain(option.value);
  });

  it("rejects a sort key the API cannot order by", () => {
    expect(categorySearchSchema.safeParse({ sort: "cheapest" }).data?.sort).toBeUndefined();
  });

  it("accepts the sorts the API supports", () => {
    for (const option of CATEGORY_SORT_OPTIONS) {
      expect(categorySearchSchema.safeParse({ sort: option.value }).data?.sort).toBe(option.value);
    }
  });

  it("rejects a page below 1 and caps the price at what the table accepts", () => {
    expect(categorySearchSchema.safeParse({ page: 0 }).data?.page).toBeUndefined();
    expect(categorySearchSchema.safeParse({ page: 2 }).data?.page).toBe(2);
    expect(categorySearchSchema.safeParse({ minPrice: 999_999_999 }).data?.minPrice).toBe(100_000);
  });
});
