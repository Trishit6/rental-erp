import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryKeys, privateQueryKeys } from "@/lib/query/keys";
import {
  removeFavoriteFromPage,
  toggleFavoriteId,
  withFavoriteFlag,
  useFavoriteMutation,
  useFavoriteStatus,
  useFavoriteToggle,
} from "@/lib/query/favorites";
import { favoritesKeys, favoritesQueryOptions } from "@/features/favorites/query";
import { addFavorite, removeFavorite } from "@/features/favorites/api";
import { makeFavoritePage, makeFavoriteProduct } from "./support/favorite-fixtures";
import type { FavoriteFilters } from "@/features/favorites/types";

const authState = vi.hoisted(() => ({ user: { id: 1 } as { id: number } | null }));

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ user: authState.user, loading: false, refresh: vi.fn() }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ href: "/browse" }),
}));

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

vi.mock("@/features/favorites/api", () => ({
  addFavorite: vi.fn(),
  removeFavorite: vi.fn(),
  getFavoriteIds: vi.fn(),
  clearFavorites: vi.fn(),
}));

const base: FavoriteFilters = { sort: "recent", page: 1, pageSize: 12 };

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = { id: 1 };
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.mocked(addFavorite).mockResolvedValue({ productId: 1, favorited: true });
  vi.mocked(removeFavorite).mockResolvedValue({ productId: 1, favorited: false });
});

/* ------------------------------------------------------------------ keys -- */

describe("favourites cache keys", () => {
  it("gives every filter, sort and page combination its own list entry", () => {
    const original = favoritesKeys.list(base);
    const variants: Partial<FavoriteFilters>[] = [
      { search: "tent" },
      { listingType: "rent" },
      { condition: "GOOD" },
      { availability: "available-now" },
      { sort: "price_asc" },
      { page: 2 },
      { pageSize: 24 },
    ];

    for (const variant of variants) {
      expect(favoritesKeys.list({ ...base, ...variant })).not.toEqual(original);
    }
  });

  it("gives an identical request an identical key", () => {
    expect(favoritesKeys.list({ ...base, page: 2 })).toEqual(
      favoritesKeys.list({ ...base, page: 2 }),
    );
  });

  it("keeps every favourites entry under the private `favorites` prefix", () => {
    const prefix = queryKeys.favorites;
    const startsWith = (key: readonly unknown[]) =>
      key.length >= prefix.length && prefix.every((part, index) => key[index] === part);

    expect(startsWith(queryKeys.favoriteIds)).toBe(true);
    expect(startsWith(queryKeys.favoritesList(base))).toBe(true);
  });

  /* Logout must leave nothing behind — a second user on the same browser must
     never inherit the first user's saved items. */
  it("evicts the id list and every list page on logout", () => {
    client.setQueryData(queryKeys.favoriteIds, [1, 2, 3]);
    client.setQueryData(favoritesKeys.list(base), makeFavoritePage([makeFavoriteProduct()]));
    client.setQueryData(favoritesKeys.list({ ...base, page: 2 }), makeFavoritePage([]));

    for (const key of privateQueryKeys) client.removeQueries({ queryKey: key });

    expect(client.getQueryData(queryKeys.favoriteIds)).toBeUndefined();
    expect(client.getQueryData(favoritesKeys.list(base))).toBeUndefined();
    expect(client.getQueryData(favoritesKeys.list({ ...base, page: 2 }))).toBeUndefined();
  });

  it("leaves public product data cached through a logout", () => {
    client.setQueryData(queryKeys.product("sony-wh-1000xm5"), { id: 1, favoriteCount: 12 });

    for (const key of privateQueryKeys) client.removeQueries({ queryKey: key });

    expect(client.getQueryData(queryKeys.product("sony-wh-1000xm5"))).toBeDefined();
  });

  it("holds the previous page while the next one loads", () => {
    const options = favoritesQueryOptions(base) as { placeholderData?: (p: unknown) => unknown };
    const previous = makeFavoritePage([makeFavoriteProduct()]);
    expect(options.placeholderData!(previous)).toBe(previous);
  });
});

/* ------------------------------------------------------- pure transitions -- */

describe("saved-id transitions", () => {
  it("adds an id that is not there yet", () => {
    expect(toggleFavoriteId([1, 2], 3, true)).toEqual([1, 2, 3]);
  });

  it("is a no-op when the id is already saved", () => {
    expect(toggleFavoriteId([1, 2, 3], 3, true)).toEqual([1, 2, 3]);
  });

  it("removes only the id it was asked to", () => {
    expect(toggleFavoriteId([1, 2, 3], 2, false)).toEqual([1, 3]);
  });

  it("is a no-op when removing something that was not saved", () => {
    expect(toggleFavoriteId([1, 2], 9, false)).toEqual([1, 2]);
  });
});

describe("list-page transitions", () => {
  it("drops the item and keeps the total and page count truthful", () => {
    const page = makeFavoritePage(
      [makeFavoriteProduct({ id: 1 }), makeFavoriteProduct({ id: 2 })],
      { total: 13, pageSize: 12, totalPages: 2 },
    );

    const next = removeFavoriteFromPage(page, 1);

    expect(next.items.map((item) => item.id)).toEqual([2]);
    expect(next.pagination).toEqual({ page: 1, pageSize: 12, total: 12, totalPages: 1 });
  });

  it("leaves the page untouched when the product is not on it", () => {
    const page = makeFavoritePage([makeFavoriteProduct({ id: 1 })]);
    expect(removeFavoriteFromPage(page, 99)).toBe(page);
  });

  it("never reports fewer than zero saved items", () => {
    const page = makeFavoritePage([makeFavoriteProduct()], { total: 1, pageSize: 12, totalPages: 1 });
    expect(removeFavoriteFromPage(page, 1).pagination.total).toBe(0);
  });
});

describe("product flag transitions", () => {
  it("counts a save up and an unsave down", () => {
    expect(withFavoriteFlag({ favoriteCount: 12 }, true)).toEqual({
      favoriteCount: 13,
      isFavorited: true,
    });
    expect(withFavoriteFlag({ favoriteCount: 12 }, false)).toEqual({
      favoriteCount: 11,
      isFavorited: false,
    });
  });

  it("floors the count at zero", () => {
    expect(withFavoriteFlag({ favoriteCount: 0 }, false).favoriteCount).toBe(0);
  });
});

/** Lets a test hold a request open and observe the UI while it is in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/* ------------------------------------------------------------- mutations -- */

describe("add favourite", () => {
  it("flips the heart before the server answers", async () => {
    const gate = deferred<{ productId: number; favorited: boolean }>();
    vi.mocked(addFavorite).mockReturnValue(gate.promise);
    client.setQueryData(queryKeys.favoriteIds, [2, 3]);

    const { result } = renderHook(() => useFavoriteMutation(), { wrapper });

    act(() => {
      result.current.mutate({ productId: 1, favorited: true });
    });

    // The id is in the set while the request is still open — that is what makes
    // the heart feel instant, and no refetch produced it.
    await waitFor(() => expect(client.getQueryData(queryKeys.favoriteIds)).toEqual([2, 3, 1]));
    expect(result.current.isPending).toBe(true);

    gate.resolve({ productId: 1, favorited: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(addFavorite).toHaveBeenCalledWith(1);
    expect(client.getQueryData(queryKeys.favoriteIds)).toEqual([2, 3, 1]);
  });

  it("restores the previous set when the request fails", async () => {
    const gate = deferred<{ productId: number; favorited: boolean }>();
    vi.mocked(addFavorite).mockReturnValue(gate.promise);
    client.setQueryData(queryKeys.favoriteIds, [2, 3]);

    const { result } = renderHook(() => useFavoriteMutation(), { wrapper });

    act(() => {
      result.current.mutate({ productId: 1, favorited: true });
    });
    await waitFor(() => expect(client.getQueryData(queryKeys.favoriteIds)).toEqual([2, 3, 1]));

    gate.reject(new Error("network"));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData(queryKeys.favoriteIds)).toEqual([2, 3]);
  });

  it("keeps the product page's own counter in step", async () => {
    client.setQueryData(queryKeys.product("sony-wh-1000xm5"), {
      id: 1,
      slug: "sony-wh-1000xm5",
      favoriteCount: 12,
      isFavorited: false,
    });

    const { result } = renderHook(() => useFavoriteMutation(), { wrapper });

    act(() => {
      result.current.mutate({ productId: 1, favorited: true, slug: "sony-wh-1000xm5" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(queryKeys.product("sony-wh-1000xm5"))).toMatchObject({
      favoriteCount: 13,
      isFavorited: true,
    });
  });

  it("leaves the product page's counter alone when the save fails", async () => {
    // The counter is only written once the server confirms, so a failed save
    // must not decrement a number it never incremented.
    client.setQueryData(queryKeys.product("sony-wh-1000xm5"), {
      id: 1,
      slug: "sony-wh-1000xm5",
      favoriteCount: 12,
      isFavorited: false,
    });
    vi.mocked(addFavorite).mockRejectedValue(new Error("network"));

    const { result } = renderHook(() => useFavoriteMutation(), { wrapper });

    act(() => {
      result.current.mutate({ productId: 1, favorited: true, slug: "sony-wh-1000xm5" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData(queryKeys.product("sony-wh-1000xm5"))).toMatchObject({
      favoriteCount: 12,
      isFavorited: false,
    });
  });

  /* A new save is not spliced into a paginated list: the product may not match
     the page's filters, and there is no card data here to render. The list is
     refetched instead, which is the honest outcome. */
  it("refetches the list rather than guessing where the new item belongs", async () => {
    client.setQueryData(favoritesKeys.list(base), makeFavoritePage([makeFavoriteProduct()]));

    const { result } = renderHook(() => useFavoriteMutation(), { wrapper });

    act(() => {
      result.current.mutate({ productId: 2, favorited: true });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await waitFor(() =>
      expect(client.getQueryState(favoritesKeys.list(base))?.isInvalidated).toBe(true),
    );
    expect(client.getQueryData<{ items: unknown[] }>(favoritesKeys.list(base))!.items).toHaveLength(
      1,
    );
  });
});

describe("remove favourite", () => {
  it("removes the card before the server answers, and reports success for undo", async () => {
    const gate = deferred<{ productId: number; favorited: boolean }>();
    vi.mocked(removeFavorite).mockReturnValue(gate.promise);
    const onRemoved = vi.fn();
    client.setQueryData(queryKeys.favoriteIds, [1, 2]);
    client.setQueryData(
      favoritesKeys.list(base),
      makeFavoritePage([makeFavoriteProduct({ id: 1 }), makeFavoriteProduct({ id: 2 })], { total: 2 }),
    );

    const { result } = renderHook(
      () => useFavoriteToggle({ productId: 1, slug: "sony-wh-1000xm5", onRemoved }),
      { wrapper },
    );

    act(() => result.current.remove());

    await waitFor(() => expect(client.getQueryData(queryKeys.favoriteIds)).toEqual([2]));
    expect(client.getQueryData<{ items: unknown[] }>(favoritesKeys.list(base))!.items).toHaveLength(
      1,
    );
    expect(onRemoved).not.toHaveBeenCalled();

    gate.resolve({ productId: 1, favorited: false });

    await waitFor(() =>
      expect(onRemoved).toHaveBeenCalledWith({ productId: 1, slug: "sony-wh-1000xm5" }),
    );
    expect(removeFavorite).toHaveBeenCalledWith(1);
  });

  it("puts the card back when the request fails", async () => {
    const gate = deferred<{ productId: number; favorited: boolean }>();
    vi.mocked(removeFavorite).mockReturnValue(gate.promise);
    client.setQueryData(queryKeys.favoriteIds, [1, 2]);
    const page = makeFavoritePage([makeFavoriteProduct({ id: 1 })], { total: 1 });
    client.setQueryData(favoritesKeys.list(base), page);

    const { result } = renderHook(() => useFavoriteToggle({ productId: 1 }), { wrapper });

    act(() => result.current.remove());
    await waitFor(() => expect(client.getQueryData(queryKeys.favoriteIds)).toEqual([2]));

    gate.reject(new Error("network"));

    await waitFor(() => expect(client.getQueryData(queryKeys.favoriteIds)).toEqual([1, 2]));
    expect(client.getQueryData(favoritesKeys.list(base))).toEqual(page);
  });

  it("reports removal through the same path a re-add uses", async () => {
    const onRemoved = vi.fn();
    const { result } = renderHook(
      () => useFavoriteToggle({ productId: 1, slug: "sony-wh-1000xm5", onRemoved }),
      { wrapper },
    );

    act(() => result.current.remove());
    await waitFor(() => expect(onRemoved).toHaveBeenCalledTimes(1));

    // Undo goes through the same mutation, so it can never behave differently.
    act(() => result.current.toggle());
    await waitFor(() => expect(addFavorite).toHaveBeenCalledWith(1));
  });
});

/* -------------------------------------------------------------- the guest -- */

describe("guests", () => {
  beforeEach(() => {
    authState.user = null;
  });

  it("never fires a request and prompts to sign in instead", () => {
    const { result } = renderHook(() => useFavoriteToggle({ productId: 1 }), { wrapper });

    expect(result.current.isGuest).toBe(true);
    act(() => result.current.toggle());

    expect(addFavorite).not.toHaveBeenCalled();
    expect(removeFavorite).not.toHaveBeenCalled();
  });

  it("reports nothing as saved, so a guest never sees someone else's state", () => {
    client.setQueryData(queryKeys.favoriteIds, [1, 2, 3]);

    const { result } = renderHook(() => useFavoriteStatus(1), { wrapper });

    expect(result.current.isFavorited).toBe(false);
  });
});

/* ------------------------------------------------- cross-surface syncing -- */

describe("cross-surface synchronisation", () => {
  it("shows a save made anywhere to every other surface at once", async () => {
    client.setQueryData(queryKeys.favoriteIds, []);

    // Two independent consumers, as a browse card and the wishlist would be.
    const card = renderHook(() => useFavoriteStatus(5), { wrapper });
    const wishlist = renderHook(() => useFavoriteStatus(5), { wrapper });
    const mutation = renderHook(() => useFavoriteMutation(), { wrapper });

    expect(card.result.current.isFavorited).toBe(false);
    expect(wishlist.result.current.isFavorited).toBe(false);

    act(() => {
      mutation.result.current.mutate({ productId: 5, favorited: true });
    });
    await waitFor(() => expect(card.result.current.isFavorited).toBe(true));

    // No refetch of anything: both read the same cache entry.
    expect(wishlist.result.current.isFavorited).toBe(true);
    expect(addFavorite).toHaveBeenCalledTimes(1);
  });

  it("seeds from the flag a product response already carried", () => {
    // Before the id list resolves, the card is still correct because the product
    // payload said so — this is what keeps a grid at zero extra requests.
    const { result } = renderHook(() => useFavoriteStatus(5, true), { wrapper });

    expect(result.current.isFavorited).toBe(true);
    expect(result.current.isResolving).toBe(false);
  });

  it("waits rather than guessing when neither source has answered", () => {
    const { result } = renderHook(() => useFavoriteStatus(5), { wrapper });

    expect(result.current.isFavorited).toBe(false);
    expect(result.current.isResolving).toBe(true);
  });
});
