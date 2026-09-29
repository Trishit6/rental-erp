import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MAX_SEARCH_LENGTH } from "./schema";

/**
 * Rental search.
 *
 * Holds a local draft and pushes to the URL after a pause, so a five-letter
 * query is one navigation rather than five. Adjusting state during render (not
 * in an effect) keeps it in step with an external change such as "Clear filters"
 * without painting a stale value first.
 */
export function RentalsSearchField({
  value,
  onSearch,
  placeholder = "Search by product or order number",
}: {
  value: string;
  onSearch: (next: string) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [syncedValue, setSyncedValue] = useState(value);

  if (value !== syncedValue) {
    setSyncedValue(value);
    setDraft(value);
  }

  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => onSearch(draft.trim()), 300);
    return () => clearTimeout(timer);
  }, [draft, value, onSearch]);

  return (
    <form
      role="search"
      className="relative flex-1"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(draft.trim());
      }}
    >
      <label htmlFor="rentals-search" className="sr-only">
        Search rentals
      </label>
      <Search
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        id="rentals-search"
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
