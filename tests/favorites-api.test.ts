import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api/client";
import {
  addFavorite,
  checkFavorite,
  clearFavorites,
  getFavoriteIds,
  getFavorites,
  removeFavorite,
} from "@/features/favorites/api";
import { makeFavoriteProduct } from "./support/favorite-fixtures";
import type { FavoriteFilters } from "@/features/favorites/types";

vi.mock("@/lib/api/client", () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const base: FavoriteFilters = { sort: "recent", page: 1, pageSize: 12 };

function lastParams(): URLSearchParams {
  const path = vi.mocked(api.get).mock.calls.at(-1)![0] as string;
  return new URLSearchParams(path.split("?")[1] ?? "");
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.delete).mockReset();
});

describe("favorites list requests", () => {
  it("addresses the list endpoint with its pagination", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as never);

    await getFavorites({ ...base, page: 3, pageSize: 12 });

    const path = vi.mocked(api.get).mock.calls[0]![0] as string;
    expect(path.startsWith("/favorites?")).toBe(true);
    expect(lastParams().get("page")).toBe("3");
    expect(lastParams().get("pageSize")).toBe("12");
  });

  it("sends the listing type as `mode`, the same parameter Browse uses", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as never);

    await getFavorites({ ...base, listingType: "rent-and-buy" });

    expect(lastParams().get("mode")).toBe("rent-and-buy");
    expect(lastParams().has("listingType")).toBe(false);
  });

  it("forwards search, condition, availability and sort", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as never);

    await getFavorites({
      ...base,
      search: "tent",
      condition: "GOOD",
      availability: "available-now",
      sort: "price_desc",
    });

    const params = lastParams();
    expect(params.get("search")).toBe("tent");
    expect(params.get("condition")).toBe("GOOD");
    expect(params.get("availability")).toBe("available-now");
    expect(params.get("sort")).toBe("price_desc");
  });

  it("omits absent filters instead of sending blanks", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as never);

    await getFavorites(base);

    const params = lastParams();
    expect(params.has("search")).toBe(false);
    expect(params.has("mode")).toBe(false);
    expect(params.has("condition")).toBe(false);
    expect(params.has("availability")).toBe(false);
  });

  it("returns the items and the server's pagination envelope", async () => {
    const item = makeFavoriteProduct();
    vi.mocked(api.get).mockResolvedValue({
      data: [item],
      pagination: { page: 2, pageSize: 12, total: 30, totalPages: 3 },
    } as never);

    const result = await getFavorites({ ...base, page: 2 });

    expect(result.items).toEqual([item]);
    expect(result.pagination).toEqual({ page: 2, pageSize: 12, total: 30, totalPages: 3 });
  });

  it("falls back to a one-page envelope when the API sends no pagination", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [makeFavoriteProduct()] } as never);

    const result = await getFavorites({ ...base, page: 4 });

    expect(result.pagination).toMatchObject({ page: 4, pageSize: 12, total: 1, totalPages: 1 });
  });
});

describe("favourite mutations", () => {
  it("saves and unsaves by product id", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { productId: 7, favorited: true } } as never);
    vi.mocked(api.delete).mockResolvedValue({ data: { productId: 7, favorited: false } } as never);

    await expect(addFavorite(7)).resolves.toEqual({ productId: 7, favorited: true });
    expect(api.post).toHaveBeenCalledWith("/favorites/7");

    await expect(removeFavorite(7)).resolves.toEqual({ productId: 7, favorited: false });
    expect(api.delete).toHaveBeenCalledWith("/favorites/7");
  });

  it("clears the whole wishlist through the collection endpoint", async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: { cleared: 24 } } as never);

    await expect(clearFavorites()).resolves.toBe(24);
    expect(api.delete).toHaveBeenCalledWith("/favorites");
  });

  it("never sends a user id — the server owns that", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [1, 2, 3] } as never);
    vi.mocked(api.post).mockResolvedValue({ data: { productId: 1, favorited: true } } as never);

    await getFavoriteIds();
    await addFavorite(1);

    for (const call of [...vi.mocked(api.get).mock.calls, ...vi.mocked(api.post).mock.calls]) {
      expect(JSON.stringify(call)).not.toContain("userId");
    }
  });
});

describe("favourite ids and status", () => {
  it("reads the saved set from one small endpoint", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [4, 9, 21] } as never);

    await expect(getFavoriteIds()).resolves.toEqual([4, 9, 21]);
    expect(api.get).toHaveBeenCalledWith("/favorites/ids");
  });

  it("unwraps the status endpoint's answer", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { productId: 4, favorited: true } } as never);

    await expect(checkFavorite(4)).resolves.toBe(true);
    expect(api.get).toHaveBeenCalledWith("/favorites/4");
  });

  /* The N+1 guard: a grid of cards must be served by the id list and the
     `isFavorited` flag on each product, never one status call per card. */
  it("gives a caller everything it needs with a single request", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [1, 2, 3] } as never);

    const ids = await getFavoriteIds();
    const cardStates = [10, 11, 12, 13].map((productId) => ids.includes(productId));

    expect(api.get).toHaveBeenCalledTimes(1);
    expect(cardStates).toEqual([false, false, false, false]);
  });
});
