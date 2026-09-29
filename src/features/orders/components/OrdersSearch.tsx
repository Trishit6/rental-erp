import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MAX_SEARCH_LENGTH } from "./schema";

/**
 * Order search.
 *
 * Keeps its own draft while typing and only pushes to the URL after a pause, so
 * a five-letter query is one navigation instead of five. The input is
 * controlled by local state so it never lags behind fast typing while a route
 * transition is in flight.
 */
export function OrdersSearch({
  value,
  onSearch,
  placeholder = "Search orders or products",
}: {
  value: string;
  onSearch: (next: string) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [syncedValue, setSyncedValue] = useState(value);

  // Adjusting state during render, not in an effect. This is the documented way
  // to react to an external value change: it re-renders immediately instead of
  // painting the stale draft first, and it only fires when the incoming value
  // genuinely changed (a back button, or "Clear filters") rather than on every
  // keystroke the user is still typing.
  if (value !== syncedValue) {
    setSyncedValue(value);
    setDraft(value);
  }

  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => onSearch(draft.trim()), 300);
    return () => clearTimeout(timer);
  }, [draft, value, onSearch]);

  function submitNow() {
    onSearch(draft.trim());
  }

  return (
    <form
      role="search"
      className="relative flex-1"
      onSubmit={(event) => {
        event.preventDefault();
        submitNow();
      }}
    >
      <label htmlFor="orders-search" className="sr-only">
        Search orders
      </label>
      <Search
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        id="orders-search"
        value={draft}
        onChange={(event) => setDraft(event.target.value.slice(0, MAX_SEARCH_LENGTH))}
        placeholder={placeholder}
        autoComplete="off"
        maxLength={MAX_SEARCH_LENGTH}
        className="pl-10 pr-10"
      />
      {draft && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Clear search"
          onClick={() => {
            setDraft("");
            onSearch("");
          }}
          className="absolute right-1 top-1/2 size-9 -translate-y-1/2"
        >
          <X size={15} aria-hidden="true" />
        </Button>
      )}
    </form>
  );
}
