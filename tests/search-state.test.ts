import { describe, expect, it } from "vitest";
import {
  EMPTY_SURFACE,
  flattenOptions,
  isSearchBoxOpen,
  searchBoxReducer,
  type SearchBoxState,
  type SuggestionsPayload,
} from "@/components/shared/search/search-state";

/**
 * PROMPT R11 — the SearchBox state machine, transition-tested without DOM.
 *
 * The reducer is the whole box's behaviour in a plain function; the component
 * only renders it and the hook only feeds it. These tests pin the machine:
 *
 *   idle → focusedEmpty (recent + trending) → typing (< 2 chars keeps
 *   focusedEmpty) → loading → results | noResults | error
 *
 * plus the one rule a human forgets: a focus event on an already-open box
 * must not wipe a result set someone is reading.
 */

const surface = { recents: [{ term: "camera", id: 1 }], trendingTerms: ["sofa"] };

const payload = (overrides: Partial<SuggestionsPayload> = {}): SuggestionsPayload => ({
  query: "camera",
  products: [
    { id: 1, slug: "sony-a7", title: "Sony A7", image: null, pricePerDay: 49_900, categoryName: "Cameras" },
  ],
  categories: [
    { id: 2, slug: "cameras", name: "Cameras", path: "Electronics" },
    { id: 3, slug: "audio", name: "Audio", path: "Electronics" },
    { id: 4, slug: "gaming", name: "Gaming", path: "Electronics" },
    { id: 5, slug: "tools", name: "Tools", path: "DIY" },
    { id: 6, slug: "laptops", name: "Laptops", path: "Electronics" },
  ],
  brands: [{ id: 7, slug: "sony", name: "Sony" }],
  ...overrides,
});

describe("the SearchBox reducer", () => {
  it("idle → focusedEmpty on focus, carrying the empty surface", () => {
    const next = searchBoxReducer({ status: "idle" }, { type: "focus", surface });
    expect(next).toEqual({ status: "focusedEmpty", draft: "", surface });
  });

  it("a focus event on an open box does not wipe its state", () => {
    const open: SearchBoxState = {
      status: "results",
      draft: "camera",
      payload: payload(),
      surface,
    };
    expect(searchBoxReducer(open, { type: "focus", surface: EMPTY_SURFACE })).toBe(open);
  });

  it("typing < 2 characters keeps (or snaps back to) focusedEmpty", () => {
    const fromIdle = searchBoxReducer({ status: "idle" }, { type: "type", draft: "c" });
    expect(fromIdle.status).toBe("focusedEmpty");

    const wasResults: SearchBoxState = {
      status: "results",
      draft: "camera",
      payload: payload(),
      surface,
    };
    const snapped = searchBoxReducer(wasResults, { type: "type", draft: "c" });
    expect(snapped.status).toBe("focusedEmpty");
    expect(snapped.status === "focusedEmpty" && snapped.draft).toBe("c");
  });

  it("a request ≥ 2 chars goes to loading and keeps the surface for a cancelled load", () => {
    const next = searchBoxReducer({ status: "idle" }, { type: "request", draft: "camera" });
    expect(next.status).toBe("loading");
    expect(next.status === "loading" && next.draft).toBe("camera");
  });

  it("a request below the threshold is ignored", () => {
    const next = searchBoxReducer({ status: "idle" }, { type: "request", draft: "c" });
    expect(next).toEqual({ status: "idle" });
  });

  it("resolve with products → results; without → noResults (did-you-mean data rides along)", () => {
    const first = searchBoxReducer({ status: "idle" }, { type: "focus", surface });
    const results = searchBoxReducer(first, {
      type: "resolve",
      payload: payload(),
      surface,
    });
    expect(results.status).toBe("results");

    const none = searchBoxReducer(first, {
      type: "resolve",
      payload: payload({ products: [], didYouMean: "sony", query: "soyn" }),
      surface,
    });
    expect(none.status).toBe("noResults");
    if (none.status === "noResults") {
      expect(none.payload.didYouMean).toBe("sony");
    }
  });

  it("fail keeps the draft and the surface; an idle box ignores fail", () => {
    const idle = searchBoxReducer({ status: "idle" }, { type: "fail" });
    expect(idle).toEqual({ status: "idle" });

    const base = searchBoxReducer({ status: "idle" }, { type: "focus", surface });
    const loading = searchBoxReducer(base, { type: "request", draft: "camera" });
    const failed = searchBoxReducer(loading, { type: "fail" });
    expect(failed.status).toBe("error");
    if (failed.status === "error") {
      expect(failed.draft).toBe("camera");
      expect(failed.surface).toEqual(surface);
    }
  });

  it("the error state's retry re-enters loading with the same draft", () => {
    const base = searchBoxReducer({ status: "idle" }, { type: "focus", surface });
    const loading = searchBoxReducer(base, { type: "request", draft: "camera" });
    const failed = searchBoxReducer(loading, { type: "fail" });
    const retried = searchBoxReducer(failed, { type: "retry" });
    expect(retried.status).toBe("loading");
    expect(retried.status === "loading" && retried.draft).toBe("camera");
  });

  it("close returns to idle from every non-idle state", () => {
    for (const status of ["focusedEmpty", "loading", "results", "noResults", "error"] as const) {
      const state = { status, draft: "x", surface } as SearchBoxState;
      expect(searchBoxReducer(state, { type: "close" })).toEqual({ status: "idle" });
    }
    expect(isSearchBoxOpen({ status: "idle" })).toBe(false);
    expect(
      isSearchBoxOpen(searchBoxReducer({ status: "idle" }, { type: "focus", surface })),
    ).toBe(true);
  });
});

describe("flattenOptions (the one navigation model)", () => {
  it("the empty surface lists recents then trendings, deduplicated against recents", () => {
    const state: SearchBoxState = {
      status: "focusedEmpty",
      draft: "",
      surface: { recents: [{ term: "camera", id: 1 }], trendingTerms: ["camera", "sofa"] },
    };
    expect(flattenOptions(state)).toEqual([{ kind: "term", value: "camera" }, { kind: "term", value: "sofa" }]);
  });

  it("noResults shows at most 4 category chips", () => {
    const state: SearchBoxState = {
      status: "noResults",
      draft: "soyn",
      payload: payload(),
      surface,
    };
    expect(flattenOptions(state)).toHaveLength(4);
    expect(flattenOptions(state).every((option) => option.kind === "category")).toBe(true);
  });

  it("results order products → categories → brands", () => {
    const state: SearchBoxState = {
      status: "results",
      draft: "camera",
      payload: payload(),
      surface,
    };
    expect(flattenOptions(state).map((option) => option.kind)).toEqual([
      "product",
      "category",
      "category",
      "category",
      "category",
      "category",
      "brand",
    ]);
  });
});
