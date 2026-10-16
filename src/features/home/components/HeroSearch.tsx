import { SearchBox } from "@/components/shared/search/SearchBox";

/**
 * Hero search — the homepage's search control, since PROMPT R11 the *only*
 * search surface that shows a submit button.
 *
 * ## What this component is now
 *
 * Composition only: the shared `SearchBox` in its `hero` variant (one surface,
 * suggestions, keyboard contract, ARIA combobox) wrapped in the `#hero-search`
 * element the navbar's collapse behaviour watches — while this anchor is on
 * screen, the navbar collapses to an icon, and exactly one search bar is
 * visible at a time. Submitting (Enter, or the arrow button) still lands on
 * `/browse?search=<term>` — the same `search` parameter Browse and the
 * category pages parse with `parseProductSearch`.
 *
 * Nothing is filtered on the homepage: Browse owns the query, the pagination
 * and the server call, so the hero and the catalogue can never disagree about
 * what a search means. The old local markup (and its bare-input-in-
 * `.inset-surface` rationale, and `heroSearchSchema`) moved into the shared
 * component; see `components/shared/search/SearchBox.tsx`.
 */
export function HeroSearch() {
  return (
    <div id="hero-search" className="w-full max-w-xl">
      <SearchBox variant="hero" />
    </div>
  );
}
