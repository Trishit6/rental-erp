import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";

const SEARCH_DEBOUNCE_MS = 400;

/**
 * The one product search field (Browse, and scoped search inside a category).
 *
 * - Debounced (400ms) so typing never fires a request per keystroke, and
 *   TanStack Query cancels/ignores superseded requests via the query key.
 * - Input is trimmed but otherwise left untouched, so multi-word queries keep
 *   their meaning.
 * - Syncs back from the URL, so refresh, back/forward and shared links show the
 *   active search.
 */
export function SearchBar({
  value,
  onSearch,
  isSearching,
  id = "product-search",
  label = "Search listings",
  placeholder = "Try “camera”, “gaming laptop” or a neighbourhood",
}: {
  /** The committed search term from the URL. */
  value: string;
  onSearch: (term: string) => void;
  isSearching?: boolean;
  id?: string;
  label?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);

  // URL → input: adjust during render (React's documented pattern) so an
  // external navigation never leaves a stale term in the box.
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    setDraft(value);
  }

  // Keep the latest callback without re-arming the debounce timer on every render.
  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  useEffect(() => {
    const term = draft.trim();
    if (term === value) return;
    const timer = window.setTimeout(() => onSearchRef.current(term), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, value]);

  function submitNow() {
    onSearchRef.current(draft.trim());
  }

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        submitNow();
      }}
      className="relative flex-1"
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search
        size={17}
        aria-hidden
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <input
        id={id}
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="inset-surface h-12 w-full rounded-full pl-11 pr-11 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/50 [&::-webkit-search-cancel-button]:hidden"
      />
      {isSearching ? (
        <Loader2
          size={16}
          aria-label="Searching"
          className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-primary"
        />
      ) : (
        draft.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setDraft("");
              onSearchRef.current("");
            }}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <X size={15} />
          </button>
        )
      )}
    </form>
  );
}
