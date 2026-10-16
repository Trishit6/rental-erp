/**
 * The SearchBox state machine (PROMPT R11) — pure, no React, no fetch.
 *
 * `idle → focusedEmpty → typing → loading → results | noResults | error`, with
 * every state carrying the empty-box surface data (recent + trending) so
 * reopening never needs a refetch. The component renders this; the hook below
 * dispatches; tests assert the transitions. Keeping it in a plain function is
 * what makes the keyboard contract provable without a browser.
 */

export type SuggestedProduct = {
  id: number;
  slug: string;
  title: string;
  image: string | null;
  pricePerDay: number | null;
  categoryName: string | null;
};

export type SuggestedCategory = { id: number; slug: string; name: string; path: string };

export type SuggestedBrand = { id: number; slug: string; name: string };

export type SuggestionsPayload = {
  query: string;
  products: SuggestedProduct[];
  categories: SuggestedCategory[];
  brands: SuggestedBrand[];
  didYouMean?: string;
};

/** What the empty dropdown shows: the signed-in user's terms, or the guest session's. */
export type SearchRecent = { term: string; /** server row id — null for guest-only recents */ id: number | null };

/** What the empty dropdown shows: the signed-in user's terms, or the guest session's. */
export type SearchSurfaceData = { recents: SearchRecent[]; trendingTerms: string[] };

export type SearchBoxState =
  | { status: "idle" }
  | { status: "focusedEmpty"; draft: string; surface: SearchSurfaceData }
  | { status: "loading"; draft: string; surface: SearchSurfaceData }
  | { status: "results"; draft: string; payload: SuggestionsPayload; surface: SearchSurfaceData }
  | { status: "noResults"; draft: string; payload: SuggestionsPayload; surface: SearchSurfaceData }
  | { status: "error"; draft: string; surface: SearchSurfaceData };

export type SearchBoxAction =
  /** Focus (or focus after all text cleared): open on the empty surface. */
  | { type: "focus"; surface: SearchSurfaceData }
  /** Keystroke. < 2 chars keeps (or returns to) focusedEmpty; nothing fetches yet. */
  | { type: "type"; draft: string }
  /** The hook committed a query: request in flight. */
  | { type: "request"; draft: string }
  /** Response for `payload.query`. Exactly one product-less variant is derived here. */
  | { type: "resolve"; payload: SuggestionsPayload; surface: SearchSurfaceData }
  | { type: "fail"; draft: string }
  /** Retry row (the error state) re-enters loading. */
  | { type: "retry" }
  /** Esc-clears, Tab, route change: close without losing focus semantics. */
  | { type: "close" }
  /**
   * Let a live refresh of recents/trending (a history write, or a removal)
   * reach an already-open panel without wiping status/draft/payload — the
   * "focus" action above deliberately cannot do that, because opening again
   * must never destroy a result set someone is reading.
   */
  | { type: "refreshSurface"; surface: SearchSurfaceData };

/** Anything ≥ 2 characters is an actual search; below that, the empty surface stands. */
export const SEARCH_MIN_DRAFT_LENGTH = 2;

export function searchBoxReducer(
  state: SearchBoxState,
  action: SearchBoxAction,
): SearchBoxState {
  switch (action.type) {
    case "focus": {
      if (state.status !== "idle") {
        // A focus event on an already-open box (re-focus after a Tab dance,
        // pointer click on the input) must not wipe a result set.
        return state;
      }
      return { status: "focusedEmpty", draft: "", surface: action.surface };
    }

    case "type": {
      const surface = isSurfaceState(state) ? state.surface : EMPTY_SURFACE;
      if (action.draft.length < SEARCH_MIN_DRAFT_LENGTH) {
        // “keeps focusedEmpty”: 1 char is not a search; the box stays on the
        // recents/trending list rather than flashing a spinner.
        return { status: "focusedEmpty", draft: action.draft, surface };
      }
      return state;
    }

    case "request": {
      if (action.draft.length < SEARCH_MIN_DRAFT_LENGTH) return state;
      return { status: "loading", draft: action.draft, surface: surfaceOf(state) };
    }

    case "resolve": {
      // A stale response (this action belongs to a query the box has moved on
      // from) is dropped by the hook before dispatch — the reducer only ever
      // sees a payload that answers the query it is showing.
      const surface = isSurfaceState(state) ? state.surface : EMPTY_SURFACE;
      if (action.payload.products.length === 0) {
        return { status: "noResults", draft: action.payload.query, payload: action.payload, surface };
      }
      return { status: "results", draft: action.payload.query, payload: action.payload, surface };
    }

    case "fail":
      return state.status === "idle"
        ? state
        : { status: "error", draft: state.draft, surface: surfaceOf(state) };

    case "retry":
      return state.status === "error"
        ? { status: "loading", draft: state.draft, surface: state.surface }
        : state;

    case "close":
      return { status: "idle" };

    case "refreshSurface":
      // The surface payload alone is replaced; whether and what is shown stays
      // owned by the state it was in.
      return state.status === "idle" ? state : { ...state, surface: action.surface };

    default:
      return state;
  }
}

export const EMPTY_SURFACE: SearchSurfaceData = { recents: [], trendingTerms: [] };

function isSurfaceState(
  state: SearchBoxState,
): state is Exclude<SearchBoxState, { status: "idle" }> {
  return (
    state.status === "focusedEmpty" ||
    state.status === "loading" ||
    state.status === "results" ||
    state.status === "noResults" ||
    state.status === "error"
  );
}

function surfaceOf(
  state: SearchBoxState,
): SearchSurfaceData {
  // TypeScript narrows via the guard above; idle falls back to the constant.
  return isSurfaceState(state) ? state.surface : EMPTY_SURFACE;
}

/** The box is open whenever it is not idle — drives aria-expanded and the panel. */
export function isSearchBoxOpen(state: SearchBoxState): boolean {
  return state.status !== "idle";
}

export type SearchBoxOpenState = Exclude<SearchBoxState, { status: "idle" }>;

/** All suggestion options in reading order, flattened for arrow-key navigation. */
export function flattenOptions(state: SearchBoxState): Array<
  { kind: "term"; value: string } | { kind: "product"; product: SuggestedProduct } | { kind: "category"; category: SuggestedCategory } | { kind: "brand"; brand: SuggestedBrand }
> {
  if (state.status === "focusedEmpty") {
    // Empty box: recents first, then trending — the only step that offers terms.
    const seen = new Set(state.surface.recents.map((recent) => recent.term));
    return [
      ...state.surface.recents.map((recent) => ({ kind: "term", value: recent.term }) as const),
      ...state.surface.trendingTerms
        .filter((term) => !seen.has(term))
        .map((term) => ({ kind: "term", value: term }) as const),
    ];
  }
  if (state.status === "noResults") {
    return state.payload.categories
      .slice(0, 4)
      .map((category) => ({ kind: "category", category }) as const);
  }
  if (state.status !== "results") return [];
  return [
    ...state.payload.products.map((product) => ({ kind: "product", product }) as const),
    ...state.payload.categories.map((category) => ({ kind: "category", category }) as const),
    ...state.payload.brands.map((brand) => ({ kind: "brand", brand }) as const),
  ];
}
