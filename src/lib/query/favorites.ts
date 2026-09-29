import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/auth-context";
import { queryKeys } from "./keys";
import { addFavorite, clearFavorites, getFavoriteIds, removeFavorite } from "@/features/favorites/api";
import { favoriteProductIdSchema } from "@/features/favorites/components/schema";
import type { FavoriteListResponse, FavoriteMutationResult } from "@/features/favorites/types";

/**
 * THE favourite system. Every heart in Revaro — Home, Browse, Product Details,
 * Related products and the wishlist itself — reads its state from here and
 * mutates through here. There is deliberately no second implementation.
 *
 * Two cache entries do the work:
 *
 *  - `queryKeys.favoriteIds` — the signed-in user's whole saved set as ids. One
 *    small request, fetched once, is what every heart in the app reads. This is
 *    what makes favourite state free: a grid of 20 cards still makes **zero**
 *    extra requests, because `isFavorited` also arrives inline with each
 *    product and seeds the state before the id list resolves.
 *  - `queryKeys.favoritesList(filters)` — one page of the wishlist.
 *
 * Both live under the `["favorites"]` prefix that `privateQueryKeys` evicts on
 * logout, so one user can never see the previous user's saved items.
 */

const FAVORITE_IDS_STALE_MS = 60_000;

/* ------------------------------ pure helpers ------------------------------- */
/* Exported and dependency-free so the cache transitions are unit-testable
   without a QueryClient or a render. */

/** The next saved-id set after moving `productId` to `favorited`. */
export function toggleFavoriteId(ids: number[], productId: number, favorited: boolean): number[] {
  if (favorited) return ids.includes(productId) ? ids : [...ids, productId];
  return ids.filter((id) => id !== productId);
}

/**
 * A wishlist page with one item removed. The total drops too, so the header
 * count and the pagination stay truthful without a refetch.
 *
 * `id` is the *product* id (the favourite's own id is `favoriteId`), which is
 * what every caller has to hand us.
 */
export function removeFavoriteFromPage(
  page: FavoriteListResponse,
  productId: number,
): FavoriteListResponse {
  if (!page.items.some((item) => item.id === productId)) return page;

  const items = page.items.filter((item) => item.id !== productId);
  const total = Math.max(0, page.pagination.total - 1);
  const totalPages = Math.max(1, Math.ceil(total / page.pagination.pageSize));

  return { items, pagination: { ...page.pagination, total, totalPages } };
}

/** Patch one product's own saved state + counter wherever it is cached. */
export function withFavoriteFlag<T extends { isFavorited?: boolean; favoriteCount?: number }>(
  item: T,
  favorited: boolean,
): T {
  const current = item.favoriteCount ?? 0;
  return {
    ...item,
    isFavorited: favorited,
    favoriteCount: Math.max(0, current + (favorited ? 1 : -1)),
  };
}

/* --------------------------------- queries --------------------------------- */

export function favoriteIdsQueryOptions(enabled: boolean) {
  return {
    queryKey: queryKeys.favoriteIds,
    queryFn: getFavoriteIds,
    /** Guests never fire this. */
    enabled,
    staleTime: FAVORITE_IDS_STALE_MS,
  };
}

/**
 * Every saved product id, as a Set. Shared by all hearts on the page, so a
 * twenty-card grid subscribes to one entry rather than twenty.
 */
export function useFavoriteIds(): { ids: Set<number>; isLoading: boolean; isGuest: boolean } {
  const { user } = useAuth();
  const { data, isLoading } = useQuery(favoriteIdsQueryOptions(!!user));

  const ids = useMemo(() => new Set(data ?? []), [data]);
  return { ids, isLoading, isGuest: !user };
}

/**
 * One product's saved state.
 *
 * `hint` is the `isFavorited` the product response already carried — using it
 * means a card is correct on first paint, before the id list has resolved. Once
 * the list arrives it becomes authoritative, so a change made anywhere shows up
 * everywhere immediately.
 */
export function useFavoriteStatus(
  productId: number | undefined,
  hint?: boolean,
): { isFavorited: boolean; isResolving: boolean } {
  const { ids, isLoading, isGuest } = useFavoriteIds();
  if (!productId) return { isFavorited: false, isResolving: false };
  if (isGuest) return { isFavorited: false, isResolving: false };
  if (isLoading) return { isFavorited: hint ?? false, isResolving: hint === undefined };
  return { isFavorited: ids.has(productId), isResolving: false };
}

/* -------------------------------- mutations -------------------------------- */

/** Cache writes shared by the optimistic update and its rollback. */
function writeIds(queryClient: QueryClient, ids: number[]): void {
  queryClient.setQueryData<number[]>(queryKeys.favoriteIds, ids);
}

function writeListPages(
  queryClient: QueryClient,
  pages: [readonly unknown[], FavoriteListResponse | undefined][],
  productId: number,
): void {
  for (const [key, value] of pages) {
    if (value) queryClient.setQueryData(key, removeFavoriteFromPage(value, productId));
  }
}

/**
 * Put the list pages back exactly as they were. A rollback must *restore* the
 * snapshot, not re-apply the removal to the already-emptied page.
 */
function restoreListPages(
  queryClient: QueryClient,
  pages: [readonly unknown[], FavoriteListResponse | undefined][],
): void {
  for (const [key, value] of pages) {
    if (value) queryClient.setQueryData(key, value);
  }
}

/** Keep the product page's own counter in step without refetching it. */
function patchProductDetail(queryClient: QueryClient, slug: string | undefined, favorited: boolean) {
  if (!slug) return;
  queryClient.setQueryData(queryKeys.product(slug), (previous: unknown) => {
    if (!previous || typeof previous !== "object") return previous;
    return withFavoriteFlag(previous as { favoriteCount?: number }, favorited);
  });
}

export type FavoriteToggleInput = {
  productId: number;
  /** The state to move to. Explicit — never a blind toggle. */
  favorited: boolean;
  /** Product detail key to keep in sync, when the caller knows it. */
  slug?: string;
};

/**
 * Move one product to the requested state, optimistically.
 *
 * The heart flips immediately; the request follows; a failure restores the exact
 * previous state. Only the two favourite cache entries are touched — the whole
 * application cache is never invalidated.
 */
export function useFavoriteMutation() {
  const queryClient = useQueryClient();

  return useMutation<FavoriteMutationResult, Error, FavoriteToggleInput, {
    previousIds: number[] | undefined;
    previousLists: [readonly unknown[], FavoriteListResponse | undefined][];
    input: FavoriteToggleInput;
  }>({
    mutationFn: ({ productId, favorited }) =>
      favorited ? addFavorite(productId) : removeFavorite(productId),

    onMutate: async (input) => {
      // Stop in-flight reads from writing a stale list over the optimistic edit.
      await queryClient.cancelQueries({ queryKey: queryKeys.favoriteIds });
      await queryClient.cancelQueries({ queryKey: ["favorites", "list"] });

      const previousIds = queryClient.getQueryData<number[]>(queryKeys.favoriteIds);
      const previousLists = queryClient.getQueriesData<FavoriteListResponse>({
        queryKey: ["favorites", "list"],
      });

      writeIds(queryClient, toggleFavoriteId(previousIds ?? [], input.productId, input.favorited));
      // A removal can be reflected in the visible wishlist page right away. An
      // addition is *not* inserted optimistically: the new product may not match
      // this page's filters, and we have no card data for it here.
      if (!input.favorited) writeListPages(queryClient, previousLists, input.productId);

      return { previousIds, previousLists, input };
    },

    onError: (error, _input, context) => {
      if (context) {
        if (context.previousIds === undefined) {
          queryClient.removeQueries({ queryKey: queryKeys.favoriteIds });
        } else {
          writeIds(queryClient, context.previousIds);
        }
        restoreListPages(queryClient, context.previousLists);
      }
      // The product detail's counter is only ever written on success, so there
      // is nothing to undo here — "reverting" it would decrement a count that
      // was never incremented.
      toast.error(
        error instanceof ApiError && error.code === "UNAUTHENTICATED"
          ? "Please sign in to save items."
          : "Couldn't update favorites. Try again.",
      );
    },

    onSuccess: (_result, input) => {
      patchProductDetail(queryClient, input.slug, input.favorited);
      // Reconcile with the server: the wishlist page's filters, sorting and page
      // boundaries cannot be recomputed client-side, so refetch the lists. The
      // id list is already correct, so it is not refetched.
      void queryClient.invalidateQueries({ queryKey: ["favorites", "list"] });
    },
  });
}

/**
 * Clear the whole wishlist. Confirmed by the caller (see `RemoveFavoriteDialog`)
 * because it cannot be undone in one click — the products stay in the
 * marketplace, only the saved relationship goes.
 */
export function useClearFavorites() {
  const queryClient = useQueryClient();

  return useMutation<number, Error, void>({
    mutationFn: () => clearFavorites(),
    onSuccess: () => {
      writeIds(queryClient, []);
      void queryClient.invalidateQueries({ queryKey: ["favorites", "list"] });
    },
  });
}

/* ------------------------------- the control ------------------------------- */

/**
 * The one hook a favourite button needs. Handles the guest case centrally, so
 * no surface has to re-implement the sign-in prompt or remember that favourites
 * are private.
 */
export function useFavoriteToggle({
  productId,
  slug,
  hint,
  onRemoved,
}: {
  productId: number | undefined;
  slug?: string;
  /**
   * The `isFavorited` the product payload already carried. Seeds the state
   * before the id list resolves, so a grid of cards never flashes empty hearts
   * and still needs no request per card.
   */
  hint?: boolean;
  /** Fired after a *successful* removal — the wishlist uses it to offer Undo. */
  onRemoved?: (input: { productId: number; slug?: string; title?: string }) => void;
}): {
  isFavorited: boolean;
  isPending: boolean;
  isDisabled: boolean;
  isGuest: boolean;
  toggle: () => void;
  remove: () => void;
} {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { isFavorited, isResolving } = useFavoriteStatus(productId, hint);
  const mutation = useFavoriteMutation();

  const isGuest = !user;
  const isPending = mutation.isPending;

  const signIn = useCallback(() => {
    toast("Sign in to save items", {
      description: "Your favorites stay in sync across devices.",
      action: {
        label: "Sign in",
        onClick: () => {
          // The product is preserved as the post-login destination.
          void navigate({ to: "/login", search: { redirect: location.href } });
        },
      },
    });
  }, [location.href, navigate]);

  /** Move the product to an explicit state. `onRemoved` fires only on a real removal. */
  const run = useCallback(
    (favorited: boolean) => {
      if (!productId || isPending) return;
      if (isGuest) return signIn();
      mutation.mutate(
        { productId, favorited, slug },
        favorited
          ? undefined
          : { onSuccess: () => onRemoved?.({ productId, slug }) },
      );
    },
    [isGuest, isPending, mutation, onRemoved, productId, signIn, slug],
  );

  const toggle = useCallback(() => run(!isFavorited), [isFavorited, run]);
  const remove = useCallback(() => run(false), [run]);

  return {
    isFavorited,
    isPending,
    // "Disabled" is honest rather than optimistic: while the saved set is still
    // unknown we cannot tell add from remove, so the control waits instead of
    // guessing and letting a user remove something they never saved.
    isDisabled: isPending || isResolving,
    isGuest,
    toggle,
    remove,
  };
}

/** The product id a card can offer: validated before it is ever used. */
export function parseFavoriteProductId(value: number | undefined): number | undefined {
  const parsed = favoriteProductIdSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
