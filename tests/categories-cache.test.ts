import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import {
  CATEGORY_GC_MS,
  CATEGORY_PRODUCTS_GC_MS,
  CATEGORY_STALE_MS,
  categoryKeys,
  categoryProductsQueryOptions,
} from "../src/features/categories/query";
import type { CategoryFilters } from "../src/features/categories/types";
import { makeCategory } from "./support/category-fixtures";

vi.mock("@/lib/api/client", () => ({
  api: { get: vi.fn() },
}));

const base: CategoryFilters = {
  category: "electronics",
  sort: "recommended",
  page: 1,
  pageSize: 12,
};

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    const params = new URLSearchParams(path.split("?")[1] ?? "");
    const page = Number(params.get("page") ?? 1);
    if (path.startsWith("/categories/electronics/subcategories")) {
      return { data: [] } as never;
    }
    if (path.startsWith("/categories/electronics")) {
      return { data: makeCategory() } as never;
    }
    if (path.startsWith("/categories")) {
      return { data: [makeCategory()] } as never;
    }
    return {
      data: [{ id: page, slug: `item-${page}`, title: `Item ${page}` }],
      pagination: { page, pageSize: 12, total: 36, totalPages: 3 },
    } as never;
  });
});

describe("category query keys", () => {
  it("shares one cache entry for the category list with Home and Browse", () => {
    expect(categoryKeys.list).toEqual(queryKeys.categories);
  });

  it("gives each category its own detail and subcategory entry", () => {
    expect(categoryKeys.detail("electronics")).not.toEqual(categoryKeys.detail("cameras"));
    expect(categoryKeys.subcategories("electronics")).not.toEqual(
      categoryKeys.subcategories("cameras"),
    );
    // Detail and subcategory data live under different keys, so one can refresh
    // without invalidating the other.
    expect(categoryKeys.detail("electronics")).not.toEqual(
      categoryKeys.subcategories("electronics"),
    );
  });

  it("reuses the shared product key namespace, so Browse and categories stay compatible", () => {
    expect(categoryKeys.products(base)).toEqual(queryKeys.products(base));
  });

  it("changes the products key when any server-relevant filter changes", () => {
    const original = categoryKeys.products(base);
    const variants: Partial<CategoryFilters>[] = [
      { search: "lens" },
      { category: "cameras" },
      { mode: "rent" },
      { condition: "GOOD" },
      { availability: "available-now" },
      { sort: "newest" },
      { minPrice: 1000 },
      { maxPrice: 5000 },
      { page: 2 },
      { pageSize: 24 },
    ];

    for (const variant of variants) {
      expect(categoryKeys.products({ ...base, ...variant })).not.toEqual(original);
    }
  });

  it("gives identical filters an identical key", () => {
    expect(categoryKeys.products({ ...base })).toEqual(categoryKeys.products({ ...base }));
  });
});

describe("category caching", () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it("fetches the category list once and serves the return visit from cache", async () => {
    await client.fetchQuery({
      queryKey: categoryKeys.list,
      queryFn: async () => (await api.get("/categories")).data,
      staleTime: CATEGORY_STALE_MS,
    });
    await client.fetchQuery({
      queryKey: categoryKeys.list,
      queryFn: async () => (await api.get("/categories")).data,
      staleTime: CATEGORY_STALE_MS,
    });

    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("does not refetch a category's detail after navigating away and back", async () => {
    const options = (slug: string) => ({
      queryKey: categoryKeys.detail(slug),
      queryFn: async () => (await api.get(`/categories/${slug}`)).data,
      staleTime: CATEGORY_STALE_MS,
      gcTime: CATEGORY_GC_MS,
    });

    await client.fetchQuery(options("electronics"));
    await client.fetchQuery(options("cameras"));
    const back = await client.fetchQuery(options("electronics"));

    // One request per distinct category — walking back into one hits the cache.
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(back).toMatchObject({ slug: "electronics" });
  });

  it("keeps both pages of a category's results cached", async () => {
    await client.fetchQuery(categoryProductsQueryOptions({ ...base, page: 1 }));
    await client.fetchQuery(categoryProductsQueryOptions({ ...base, page: 2 }));

    expect(client.getQueryData(categoryKeys.products({ ...base, page: 1 }))).toBeDefined();
    expect(client.getQueryData(categoryKeys.products({ ...base, page: 2 }))).toBeDefined();

    const pageOne = await client.fetchQuery(categoryProductsQueryOptions({ ...base, page: 1 }));
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(pageOne.items[0]).toMatchObject({ title: "Item 1" });
  });

  it("keeps a filter combination cached without a second request", async () => {
    const rent = { ...base, mode: "rent" as const };
    const buy = { ...base, mode: "buy" as const };

    await client.fetchQuery(categoryProductsQueryOptions(rent));
    await client.fetchQuery(categoryProductsQueryOptions(buy));
    await client.fetchQuery(categoryProductsQueryOptions(rent));

    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("keeps categories fresh far longer than product availability", () => {
    expect(CATEGORY_STALE_MS).toBeGreaterThanOrEqual(10 * 60_000);
    expect(CATEGORY_GC_MS).toBeGreaterThanOrEqual(60 * 60_000);
    expect(CATEGORY_STALE_MS).toBeGreaterThan(5 * 60_000);
  });

  it("retains category results long enough for back-navigation to skip a refetch", () => {
    const options = categoryProductsQueryOptions(base);
    expect(options.staleTime).toBe(5 * 60_000);
    expect(options.gcTime).toBe(CATEGORY_PRODUCTS_GC_MS);
    expect(options.gcTime).toBeGreaterThanOrEqual(30 * 60_000);
  });

  it("holds the previous results while the next set loads", () => {
    const options = categoryProductsQueryOptions(base) as {
      placeholderData?: (p: unknown) => unknown;
    };
    expect(typeof options.placeholderData).toBe("function");
    const previous = { items: [{ id: 1 }], pagination: undefined };
    expect(options.placeholderData!(previous)).toBe(previous);
  });
});
