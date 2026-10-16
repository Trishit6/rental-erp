import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import { useAuth } from "@/lib/auth/auth-context";
import type {
  SearchRecent,
  SuggestionsPayload,
  SearchSurfaceData,
} from "./search-state";

/**
 * Data layer for the one SearchBox (PROMPT R11): debounced suggestions with
 * abort/stale handling, the recents/trending surface for the empty dropdown,
 * and the fire-and-forget history write on navigation.
 *
 * Storage rule: a *guest's* recents live only in this module's memory for the
 * tab — never in browser storage of any kind (not even the theme's localStorage
 * allowance extends here). A signed-in user's recents live in the database
 * (`search_history`), reached through the API.
 */

/* ------------------------------- debounce ----------------------------------- */

/**
 * The shared debounce hook. The box attaches to it; browse's filter bar
 * (`product-filters/SearchBar.tsx`) deliberately keeps its own 400 ms timing
 * because it commits to the URL rather than fetching — that difference is
 * policy, not drift.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/* ------------------------------- suggestions -------------------------------- */

export type SearchSuggestionsResult = {
  /** Payload for the committed query, or undefined while fetching/absent. */
  payload: SuggestionsPayload | undefined;
  /** True while the *committed* query's request is in flight. */
  isFetching: boolean;
  /** True when the committed query's request ended in failure (retry row). */
  isError: boolean;
  /** Re-run the current request (the error row's button). */
  retry: () => void;
};

export function useSearchSuggestions(draft: string, enabled: boolean): SearchSuggestionsResult {
  // A draft is committed on a 250 ms debounce; the committed string is the
  // cache key, so keystrokes never hit the API one at a time and a reopened
  // box for the same prefix renders from cache.
  const committed = useDebouncedValue(draft.trim().toLowerCase(), 250);

  const query = useQuery({
    queryKey: queryKeys.searchSuggest(committed),
    queryFn: ({ signal }) =>
      api
        .get<SuggestionsPayload>(`/api/search/suggest?q=${encodeURIComponent(committed)}`, {
          signal,
        })
        .then((response) => response.data),
    enabled: enabled && committed.length >= 2,
    staleTime: 60_000,
    retry: 0,
    refetchOnWindowFocus: false,
  });

  return {
    payload: query.data,
    isFetching: query.isFetching,
    isError: query.isError,
    retry: () => {
      void query.refetch();
    },
  };
}

/* ------------------------------- guest session ------------------------------ */

/**
 * The guest's recents: one in-memory list per tab. Module-scope (not React
 * state) because every mounted SearchBox variant must see the same list and
 * none of them may persist it — this is the *only* place it exists, and it
 * dies with the page.
 */
let guestRecents: SearchRecent[] = [];
const guestListeners = new Set<() => void>();

function pushGuestRecent(term: string): void {
  updateGuestRecents([
    { term, id: null },
    ...guestRecents.filter((existing) => existing.term !== term),
  ].slice(0, 8));
}

function removeGuestRecent(term: string): void {
  updateGuestRecents(guestRecents.filter((existing) => existing.term !== term));
}

function updateGuestRecents(next: SearchRecent[]): void {
  guestRecents = next;
  for (const listener of guestListeners) listener();
}

function subscribeGuestRecents(listener: () => void): () => void {
  guestListeners.add(listener);
  return () => {
    guestListeners.delete(listener);
  };
}

function useGuestRecents(): SearchRecent[] {
  return useSyncExternalStore(subscribeGuestRecents, () => guestRecents, () => guestRecents);
}

/**
 * Mirror of the server's privacy rule (`server/lib/search-suggest.ts`): an
 * email, or any term containing an 8+ digit run, is an identifier someone
 * typed by accident — never store it, never show it back. Duplicated here
 * rather than imported because `src/` may not import server code; the mirror
 * is small and pinned by a test so the two cannot silently disagree about a
 * term the server refuses.
 */
function looksPrivate(term: string): boolean {
  return /\S+@\S+\.\S+/.test(term) || /\d{8,}/.test(term.replace(/[\s\-().+]/g, ""));
}

/* ---------------------------- recents + trending ---------------------------- */

export type SearchHistoryEntry = { id: number; term: string };

/**
 * The empty dropdown's surface: recents (signed-in: server; guest: memory) and
 * trending (public). Loads lazily once the box can open.
 */
export function useSearchSurface(enabled: boolean): { surface: SearchSurfaceData } {
  const { user } = useAuth();
  const guestRecents = useGuestRecents();

  const history = useQuery({
    queryKey: queryKeys.searchHistory,
    queryFn: () => api.get<SearchHistoryEntry[]>("/api/search/history").then((r) => r.data),
    enabled: enabled && !!user,
    staleTime: 60_000,
  });

  const trending = useQuery({
    queryKey: queryKeys.searchTrending,
    queryFn: () =>
      api.get<{ terms: string[]; source: string }>("/api/search/trending").then((r) => r.data),
    enabled,
    staleTime: 300_000,
  });

  // A stable identity per *data* change is load-bearing: the controller reacts
  // to surface identity changes to refresh open panels, so a new object per
  // render would loop forever.
  const recents = useMemo<SearchRecent[]>(
    () =>
      user
        ? (history.data ?? []).map((entry) => ({ term: entry.term, id: entry.id }) as SearchRecent)
        : guestRecents,
    [user, history.data, guestRecents],
  );
  const trendingTerms = useMemo<string[]>(() => trending.data?.terms ?? [], [trending.data]);

  return useMemo(
    () => ({ surface: { recents, trendingTerms } }),
    [recents, trendingTerms],
  );
}

/**
 * Remove one recent term. Signed-in: the server row (ownership lives in the
 * delete predicate; another user's id is a 404). Guest: the session list only.
 */
export function removeSearchRecent(
  recent: SearchRecent,
  signedIn: boolean,
  queryClient: ReturnType<typeof useQueryClient>,
): void {
  if (recent.id != null && signedIn) {
    void api
      .delete(`/api/search/history/${recent.id}`)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.searchHistory });
      })
      .catch(() => {
        /* ignored: a failed removal leaves the list untouched, not wrong */
      });
    return;
  }
  removeGuestRecent(recent.term);
}

/**
 * Record a term after navigating to `/browse?search=<term>`.
 *
 * Signed-in: POSTed fire-and-forget; errors are swallowed by design (the user
 * already has what they wanted — the search). Guests: the session list only.
 * Both paths skip private terms entirely. Call with the component's query
 * client so a successful write can refresh the recents cache.
 */
export function recordSearchTerm(
  rawTerm: string,
  signedIn: boolean,
  queryClient: ReturnType<typeof useQueryClient>,
): void {
  const term = rawTerm.trim();
  if (term.length < 2 || term.length > 60 || looksPrivate(term)) return;
  if (!signedIn) {
    pushGuestRecent(term);
    return;
  }
  /* server path records below */
  void api
    .post("/api/search/history", { term })
    .then(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.searchHistory });
    })
    .catch(() => {
      /* ignored by design — see JSDoc */
    });
}
