import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { browseKeys, browseQueryOptions, BROWSE_STALE_MS } from "../src/features/browse/query";
import type { BrowseFilters } from "../src/features/browse/types";

vi.mock("@/lib/api/client", () => ({
  api: { get: vi.fn() },
}));

const pageFor = (page: number) => ({
  data: [{ id: page, slug: `item-${page}`, title: `Item ${page}` }],
  pagination: { page, pageSize: 12, total: 48, totalPages: 4 },
});

const base: BrowseFilters = { sort: "recommended", page: 1, pageSize: 12 };

describe("browse pagination cache", () => {
  let client: QueryClient;

  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      const page = Number(new URLSearchParams(path.split("?")[1]).get("page") ?? 1);
      return pageFor(page) as never;
    });
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it("gives each page its own cache entry", () => {
    expect(browseKeys.products({ ...base, page: 1 })).not.toEqual(
      browseKeys.products({ ...base, page: 2 }),
    );
  });

  it("gives identical filters an identical key", () => {
    expect(browseKeys.products({ ...base, page: 2 })).toEqual(
      browseKeys.products({ ...base, page: 2 }),
    );
  });

  it("changes the key when any server-relevant filter changes", () => {
    const original = browseKeys.products(base);
    const variants: Partial<BrowseFilters>[] = [
      { search: "tent" },
      { category: "camping" },
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
      expect(browseKeys.products({ ...base, ...variant })).not.toEqual(original);
    }
  });

  it("fetches page 1 from the database, then page 2, then serves page 1 from cache", async () => {
    await client.fetchQuery(browseQueryOptions({ ...base, page: 1 }));
    expect(api.get).toHaveBeenCalledTimes(1);

    await client.fetchQuery(browseQueryOptions({ ...base, page: 2 }));
    expect(api.get).toHaveBeenCalledTimes(2);

    const back = await client.fetchQuery(browseQueryOptions({ ...base, page: 1 }));
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(back.items[0]!.title).toBe("Item 1");
  });

  it("keeps page 1 cached after visiting page 2", async () => {
    expect(client.getQueryData(browseKeys.products({ ...base, page: 1 }))).toBeUndefined();

    await client.fetchQuery(browseQueryOptions({ ...base, page: 1 }));
    await client.fetchQuery(browseQueryOptions({ ...base, page: 2 }));

    expect(client.getQueryData(browseKeys.products({ ...base, page: 1 }))).toBeDefined();
    expect(client.getQueryData(browseKeys.products({ ...base, page: 2 }))).toBeDefined();
  });

  it("keeps results from a repeat search available without a refetch", async () => {
    const gaming = { ...base, search: "gaming laptop" };

    await client.fetchQuery(browseQueryOptions(gaming));
    await client.fetchQuery(browseQueryOptions({ ...base, search: "camera" }));
    await client.fetchQuery(browseQueryOptions(gaming));

    // One request per distinct query — browsing away and back hits the cache.
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("keeps pages fresh long enough for back-navigation to skip a refetch", () => {
    expect(browseQueryOptions(base).staleTime).toBe(BROWSE_STALE_MS);
    expect(browseQueryOptions(base).staleTime).toBeGreaterThanOrEqual(5 * 60_000);
    expect(browseQueryOptions(base).gcTime).toBeGreaterThanOrEqual(30 * 60_000);
  });

  it("keeps the previous page while the next page loads", () => {
    const options = browseQueryOptions(base) as { placeholderData?: (p: unknown) => unknown };
    expect(typeof options.placeholderData).toBe("function");
    const previous = { items: [{ id: 1 }], pagination: undefined };
    expect(options.placeholderData!(previous)).toBe(previous);
  });
});
