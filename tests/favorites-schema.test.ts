import { describe, expect, it } from "vitest";
import {
  activeFavoriteFilterCount,
  activeFavoriteFilters,
  CLEARED_FAVORITE_FILTERS,
  DEFAULT_FAVORITE_SORT,
  FAVORITE_PAGE_SIZE,
  FAVORITE_SORT_OPTIONS,
  favoriteAvailabilityLabel,
  favoriteAvailabilityState,
  favoriteButtonLabel,
  favoriteProductIdSchema,
  favoritesSubtitle,
  parseFavoriteSearch,
  toFavoriteFilters,
  toFavoriteUrlSearch,
} from "@/features/favorites/components/schema";
import type { FavoriteSearch } from "@/features/favorites/types";

describe("parseFavoriteSearch", () => {
  it("keeps a well-formed filter set", () => {
    expect(
      parseFavoriteSearch({
        search: "camera",
        listingType: "rent",
        condition: "GOOD",
        availability: "available-now",
        sort: "price_asc",
        page: 2,
      }),
    ).toEqual({
      search: "camera",
      listingType: "rent",
      condition: "GOOD",
      availability: "available-now",
      sort: "price_asc",
      page: 2,
    });
  });

  /* TanStack Router JSON-parses the query string, so a numeric param really does
     arrive as a number. Validating only strings would silently drop it. */
  it("accepts a number where a string is expected and vice versa", () => {
    expect(parseFavoriteSearch({ page: 3 }).page).toBe(3);
    expect(parseFavoriteSearch({ page: "3" }).page).toBe(3);
    expect(parseFavoriteSearch({ search: "tent" }).search).toBe("tent");
  });

  it("never throws on a hostile or hand-edited URL", () => {
    for (const input of [
      {},
      { sort: "<script>alert(1)</script>" },
      { listingType: "RENT", unknown: 1 },
      { page: -4 },
      { page: "not-a-page" },
      { condition: "MADE_UP" },
    ]) {
      expect(() => parseFavoriteSearch(input as Record<string, unknown>)).not.toThrow();
    }
  });

  it("drops values the API does not understand instead of forwarding them", () => {
    const parsed = parseFavoriteSearch({
      sort: "drop table",
      listingType: "barter",
      condition: "MINT",
      page: -1,
    });

    expect(parsed).toEqual({
      search: undefined,
      listingType: undefined,
      condition: undefined,
      availability: undefined,
      sort: undefined,
      page: undefined,
    });
  });

  it("normalises separator and case variants of the same value", () => {
    expect(parseFavoriteSearch({ listingType: "RENT-AND-BUY" }).listingType).toBe("rent-and-buy");
    expect(parseFavoriteSearch({ condition: "like-new" }).condition).toBe("LIKE_NEW");
    expect(parseFavoriteSearch({ condition: "pre_loved" }).condition).toBe("pre-loved");
  });

  it("trims a search term and treats blank as absent", () => {
    expect(parseFavoriteSearch({ search: "   " }).search).toBeUndefined();
    expect(parseFavoriteSearch({ search: "  camera  " }).search).toBe("camera");
  });
});

describe("toFavoriteUrlSearch", () => {
  it("omits defaults so the URL stays clean and shareable", () => {
    expect(toFavoriteUrlSearch({ sort: DEFAULT_FAVORITE_SORT, page: 1 })).toEqual({});
  });

  it("round-trips a full filter set", () => {
    const search: FavoriteSearch = {
      search: "tent",
      listingType: "rent",
      condition: "GOOD",
      availability: "for-rent",
      sort: "price_desc",
      page: 3,
    };

    expect(parseFavoriteSearch(toFavoriteUrlSearch(search))).toEqual(search);
  });
});

describe("toFavoriteFilters", () => {
  it("defaults to the newest-first ordering and the first page", () => {
    expect(toFavoriteFilters({})).toEqual({
      search: undefined,
      listingType: undefined,
      condition: undefined,
      availability: undefined,
      sort: "recent",
      page: 1,
      pageSize: FAVORITE_PAGE_SIZE,
    });
  });

  it("passes the page size it was given", () => {
    expect(toFavoriteFilters({}, 6).pageSize).toBe(6);
  });
});

describe("active favourite filters", () => {
  it("reports nothing for a default view", () => {
    expect(activeFavoriteFilters({})).toEqual([]);
    expect(activeFavoriteFilterCount({})).toBe(0);
  });

  it("describes each narrowing filter in the user's language", () => {
    const filters = activeFavoriteFilters({
      listingType: "rent-and-buy",
      condition: "LIKE_NEW",
      availability: "available-now",
    });

    expect(filters.map((filter) => filter.label)).toEqual([
      "Rent + Buy",
      "Like new",
      "Available now",
    ]);
  });

  /* `page` is navigation and `search` has its own field, so neither is a chip. */
  it("excludes the page and the search term from the filter count", () => {
    expect(activeFavoriteFilterCount({ page: 4, search: "tent" })).toBe(0);
  });

  it("clears the sort and every filter, but keeps the search term", () => {
    expect(CLEARED_FAVORITE_FILTERS).toEqual({
      listingType: undefined,
      condition: undefined,
      availability: undefined,
      sort: undefined,
    });
    expect(CLEARED_FAVORITE_FILTERS).not.toHaveProperty("search");
  });
});

describe("favourite sort options", () => {
  it("offers exactly the four orders the API implements", () => {
    expect(FAVORITE_SORT_OPTIONS.map((option) => option.value)).toEqual([
      "recent",
      "oldest",
      "price_asc",
      "price_desc",
    ]);
  });

  it("labels them the way the spec words them", () => {
    expect(FAVORITE_SORT_OPTIONS.map((option) => option.label)).toEqual([
      "Recently added",
      "Oldest added",
      "Price: Low to High",
      "Price: High to Low",
    ]);
  });
});

describe("availability", () => {
  it("reads the stock the database actually tracks", () => {
    expect(favoriteAvailabilityState({ status: "PUBLISHED", availableQuantity: 5 })).toBe("AVAILABLE");
    expect(favoriteAvailabilityState({ status: "PUBLISHED", availableQuantity: 2 })).toBe("LIMITED");
    expect(favoriteAvailabilityState({ status: "PUBLISHED", availableQuantity: 0 })).toBe(
      "OUT_OF_STOCK",
    );
  });

  it("treats a retired listing as unavailable rather than dropping it", () => {
    expect(favoriteAvailabilityState({ status: "ARCHIVED", availableQuantity: 5 })).toBe(
      "UNAVAILABLE",
    );
    expect(favoriteAvailabilityState({ status: "PAUSED", availableQuantity: 5 })).toBe("UNAVAILABLE");
  });

  it("gives every state a word, not just a colour", () => {
    expect(favoriteAvailabilityLabel("AVAILABLE")).toBe("Available");
    expect(favoriteAvailabilityLabel("LIMITED")).toBe("Limited availability");
    expect(favoriteAvailabilityLabel("OUT_OF_STOCK")).toBe("Out of stock");
    expect(favoriteAvailabilityLabel("UNAVAILABLE")).toBe("Currently unavailable");
  });
});

describe("header copy", () => {
  it("counts what the API returned", () => {
    expect(favoritesSubtitle(24, false)).toBe("24 saved items");
    expect(favoritesSubtitle(1, false)).toBe("1 saved item");
  });

  it("distinguishes an empty list from a list of zero", () => {
    expect(favoritesSubtitle(0, false)).toBe("Nothing saved yet");
  });

  it("never shows a count it does not have", () => {
    expect(favoritesSubtitle(undefined, true)).toBe("Loading your saved items…");
    expect(favoritesSubtitle(undefined, false)).toBe(
      "Keep the products you are considering close at hand.",
    );
  });
});

describe("accessibility", () => {
  it("names the product and the action, differently per state", () => {
    expect(favoriteButtonLabel("Sony WH-1000XM5", false)).toBe(
      "Add Sony WH-1000XM5 to favorites",
    );
    expect(favoriteButtonLabel("Sony WH-1000XM5", true)).toBe(
      "Remove Sony WH-1000XM5 from favorites",
    );
  });
});

describe("productId validation", () => {
  it("accepts a positive integer and rejects everything else", () => {
    expect(favoriteProductIdSchema.parse(7)).toBe(7);
    expect(favoriteProductIdSchema.safeParse(0).success).toBe(false);
    expect(favoriteProductIdSchema.safeParse(-1).success).toBe(false);
    expect(favoriteProductIdSchema.safeParse(1.5).success).toBe(false);
    expect(favoriteProductIdSchema.safeParse("abc").success).toBe(false);
    expect(favoriteProductIdSchema.safeParse(undefined).success).toBe(false);
  });
});
