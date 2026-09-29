import { describe, expect, it } from "vitest";
import { validateQSearch } from "../src/lib/browse-search";
import {
  activeProductFilterCount as activeFilterCount,
  activeProductFilters as activeFilters,
  AVAILABILITY_OPTIONS,
  CONDITION_OPTIONS,
  DEFAULT_SORT,
  MODE_OPTIONS,
  parseProductSearch as parseBrowseSearch,
  SORT_OPTIONS,
  toProductFilters as toBrowseFilters,
  toProductUrlSearch as toUrlSearch,
} from "../src/lib/product-search/schema";
import { PRODUCT_AVAILABILITY, PRODUCT_MODES, PRODUCT_SORTS } from "../server/lib/product-filters";

describe("parseBrowseSearch — URL is the source of truth", () => {
  it("accepts numbers, because the router JSON-parses the query string", () => {
    const search = parseBrowseSearch({ page: 2, minPrice: 500, maxPrice: 5000 });
    expect(search.page).toBe(2);
    expect(search.minPrice).toBe(500);
    expect(search.maxPrice).toBe(5000);
  });

  it("accepts strings too", () => {
    expect(parseBrowseSearch({ page: "3", minPrice: "250" })).toMatchObject({
      page: 3,
      minPrice: 250,
    });
  });

  it("reads search, category, mode, condition, availability and sort", () => {
    expect(
      parseBrowseSearch({
        search: "camera",
        category: "photography",
        mode: "rent",
        condition: "LIKE_NEW",
        availability: "available-now",
        sort: "newest",
      }),
    ).toEqual({
      search: "camera",
      category: "photography",
      mode: "rent",
      condition: "LIKE_NEW",
      availability: "available-now",
      sort: "newest",
      minPrice: undefined,
      maxPrice: undefined,
      page: undefined,
    });
  });

  it("keeps multiple filters together (search + category + mode + price)", () => {
    const search = parseBrowseSearch({
      search: "camera",
      category: "photography",
      mode: "rent",
      minPrice: 500,
      maxPrice: 5000,
    });
    expect(search.search).toBe("camera");
    expect(search.category).toBe("photography");
    expect(search.mode).toBe("rent");
    expect(search.minPrice).toBe(500);
    expect(search.maxPrice).toBe(5000);
  });

  it("expands a reversed price range instead of building an impossible query", () => {
    expect(parseBrowseSearch({ minPrice: 9000, maxPrice: 100 })).toMatchObject({
      minPrice: 100,
      maxPrice: 9000,
    });
  });

  it("rejects malformed numeric values", () => {
    expect(parseBrowseSearch({ page: "abc" }).page).toBeUndefined();
    expect(parseBrowseSearch({ page: 0 }).page).toBeUndefined();
    expect(parseBrowseSearch({ page: -3 }).page).toBeUndefined();
    expect(parseBrowseSearch({ minPrice: -10 }).minPrice).toBeUndefined();
    expect(parseBrowseSearch({ minPrice: "lots" }).minPrice).toBeUndefined();
  });

  it("caps prices at the largest value the products table accepts", () => {
    expect(parseBrowseSearch({ minPrice: 999_999_999 }).minPrice).toBe(100_000);
  });

  it("drops unknown enum values rather than crashing", () => {
    const search = parseBrowseSearch({
      mode: "teleport",
      condition: "mint",
      availability: "maybe",
      sort: "cheapest",
    });
    expect(search).toEqual({
      search: undefined,
      category: undefined,
      mode: undefined,
      condition: undefined,
      availability: undefined,
      sort: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      page: undefined,
    });
  });

  it("accepts the pre-loved shortcut", () => {
    expect(parseBrowseSearch({ condition: "pre-loved" }).condition).toBe("pre-loved");
  });

  it("tolerates case and separators in enum values", () => {
    expect(parseBrowseSearch({ condition: "like-new" }).condition).toBe("LIKE_NEW");
    expect(parseBrowseSearch({ mode: "RENT" }).mode).toBe("rent");
  });

  it("trims search but keeps multi-word meaning", () => {
    expect(parseBrowseSearch({ search: "  gaming laptop  " }).search).toBe("gaming laptop");
    expect(parseBrowseSearch({ search: "   " }).search).toBeUndefined();
  });

  it("supports the legacy q/type params so older links keep working", () => {
    expect(parseBrowseSearch({ q: "tent" })).toMatchObject({ search: "tent" });
    expect(parseBrowseSearch({ type: "RENT" })).toMatchObject({ mode: "rent" });
    expect(parseBrowseSearch({ type: "SALE" })).toMatchObject({ mode: "buy" });
    expect(parseBrowseSearch({ type: "BOTH" })).toMatchObject({ mode: "rent-and-buy" });
  });

  it("never throws on junk input", () => {
    expect(() => parseBrowseSearch(null as never)).not.toThrow();
    expect(() => parseBrowseSearch("nonsense" as never)).not.toThrow();
    expect(() => parseBrowseSearch(["a"] as never)).not.toThrow();
  });
});

describe("toBrowseFilters — URL state becomes an API request", () => {
  it("defaults the sort and page", () => {
    const filters = toBrowseFilters({});
    expect(filters.sort).toBe(DEFAULT_SORT);
    expect(filters.page).toBe(1);
    expect(filters.pageSize).toBe(12);
  });

  it("converts rupee bounds into paise", () => {
    const filters = toBrowseFilters({ minPrice: 500, maxPrice: 5_000 });
    expect(filters.minPrice).toBe(50_000);
    expect(filters.maxPrice).toBe(500_000);
  });

  it("passes search, category, mode, condition and availability straight through", () => {
    const filters = toBrowseFilters({
      search: "camera",
      category: "photography",
      mode: "rent",
      condition: "pre-loved",
      availability: "for-rent",
      sort: "newest",
      page: 3,
    });
    expect(filters).toMatchObject({
      search: "camera",
      category: "photography",
      mode: "rent",
      condition: "pre-loved",
      availability: "for-rent",
      sort: "newest",
      page: 3,
    });
  });

  it("omits price entirely when no bound is set", () => {
    const filters = toBrowseFilters({});
    expect(filters.minPrice).toBeUndefined();
    expect(filters.maxPrice).toBeUndefined();
  });
});

describe("active filters", () => {
  it("does not count the page as a filter", () => {
    expect(activeFilterCount({ page: 5 })).toBe(0);
  });

  it("does not count the search term as a filter chip", () => {
    expect(activeFilterCount({ search: "camera" })).toBe(0);
  });

  it("counts each active filter, with price as one", () => {
    expect(
      activeFilterCount({
        search: "camera",
        category: "photography",
        mode: "rent",
        minPrice: 500,
        maxPrice: 5000,
        condition: "GOOD",
        availability: "available-now",
        page: 3,
      }),
    ).toBe(5);
  });

  it("labels the price pill with the active range", () => {
    const pills = activeFilters({ minPrice: 500, maxPrice: 5000 });
    expect(pills).toHaveLength(1);
    expect(pills[0]!.label).toContain("500");
    expect(pills[0]!.clear).toEqual(["minPrice", "maxPrice"]);
  });

  it("clears both price bounds from a single pill", () => {
    expect(activeFilters({ minPrice: 500 })[0]!.clear).toEqual(["minPrice", "maxPrice"]);
  });
});

describe("toUrlSearch", () => {
  it("omits defaults so shared links stay clean", () => {
    expect(toUrlSearch({ sort: DEFAULT_SORT, page: 1 })).toEqual({});
  });

  it("serializes only the state that matters", () => {
    expect(toUrlSearch({ search: "tent", mode: "rent", page: 2, sort: "newest" })).toEqual({
      search: "tent",
      mode: "rent",
      sort: "newest",
      page: 2,
    });
  });
});

describe("filter options match the server vocabulary", () => {
  it("offers only modes the API accepts", () => {
    for (const option of MODE_OPTIONS) expect(PRODUCT_MODES).toContain(option.value);
  });

  it("offers only availability values the API accepts", () => {
    for (const option of AVAILABILITY_OPTIONS) expect(PRODUCT_AVAILABILITY).toContain(option.value);
  });

  it("offers only sort keys the API whitelists", () => {
    for (const option of SORT_OPTIONS) expect(PRODUCT_SORTS).toContain(option.value);
  });

  it("uses the database condition enum plus the pre-loved shortcut", () => {
    const values = CONDITION_OPTIONS.map((option) => option.value);
    expect(values).toEqual(["NEW", "LIKE_NEW", "GOOD", "FAIR", "USED", "pre-loved"]);
  });
});

describe("validateQSearch", () => {
  it("keeps only a non-empty trimmed q", () => {
    expect(validateQSearch({ q: "tent" })).toEqual({ q: "tent" });
    expect(validateQSearch({ q: "  tent  " })).toEqual({ q: "tent" });
    expect(validateQSearch({ q: "" })).toEqual({ q: undefined });
    expect(validateQSearch({ q: 42 })).toEqual({ q: undefined });
    expect(validateQSearch({})).toEqual({ q: undefined });
  });
});
