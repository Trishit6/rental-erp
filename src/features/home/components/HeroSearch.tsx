import { useId, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { heroSearchSchema } from "./schema";

/**
 * Hero search — the homepage's single search control.
 *
 * ## What it does, and what it deliberately does not
 *
 * Submitting (Enter, or the arrow button) navigates to the one product-discovery
 * route, `/browse?search=<term>`, using the same `search` parameter that Browse and
 * the category pages already parse with `parseProductSearch`. Nothing is filtered on
 * the homepage: Browse owns the query, the pagination and the server call, so the
 * hero and the catalogue can never disagree about what a search means. There is no
 * second search component here — the box just hands a validated term to the router.
 *
 * ## Why the field is a bare `<input>` and not the shared `Input`
 *
 * `Input` always carries the `.inset-surface` class, and `.inset-surface` is authored
 * *outside* Tailwind's cascade layers. An unlayered declaration beats a layered one
 * whatever the utilities say, so `border-0 bg-transparent shadow-none` on an `Input`
 * does **not** remove its border, its `--inset-bg` fill or its `--elev-pressed`
 * shadow. Inside a bar that already owns the surface, that reads as a second field
 * nested in the first — the double border and doubled inset shadow this component
 * used to show. A plain `<input>` has no such class, so the utilities apply normally
 * and the bar is the only surface. (`product-filters/SearchBar.tsx` uses a bare
 * `<input>` for the same reason.)
 *
 * ## Why the rest of the markup is shaped the way it is
 *
 * - The input carries `min-w-0`. A flex child defaults to `min-width: auto`, so a
 *   long placeholder set a floor the row could not shrink below and pushed the
 *   submit button off the end of the bar on a narrow phone. `min-w-0` lets the input
 *   give way instead of the button.
 * - The submit button is `shrink-0`, so it is never the thing that shrinks.
 * - The focus ring lives on the outer `<form>` (`focus-within`), not on the field.
 *   The inner bar's `.inset-surface` owns `box-shadow`, so a ring on the field to be
 *   seen would have to fight that class; the form has no shadow of its own for it to
 *   override.
 * - A whitespace-only query disables the button. `heroSearchSchema` already refuses
 *   it, and a disabled control says so *before* the click rather than after it.
 */
export function HeroSearch() {
  const navigate = useNavigate();
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);

  const canSubmit = query.trim().length > 0 && !pending;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    const parsed = heroSearchSchema.safeParse({ q: query });
    if (!parsed.success) return;
    setPending(true);
    try {
      // Navigation *is* the search: Browse reads `search` from the URL and does the
      // fetching, so there is no request to make here.
      await navigate({ to: "/browse", search: { search: parsed.data.q } });
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      role="search"
      onSubmit={(event) => void submit(event)}
      className="rounded-full focus-within:ring-2 focus-within:ring-primary/40 focus-within:ring-offset-2 focus-within:ring-offset-background"
    >
      <div className="inset-surface flex h-12 items-center gap-1.5 rounded-full p-1.5 pl-3.5 transition sm:h-14 sm:gap-2 sm:pl-5 sm:pr-2">
        <Search size={18} className="shrink-0 text-muted-foreground" aria-hidden />
        <label className="sr-only" htmlFor={inputId}>
          Search the marketplace
        </label>
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search cameras, laptops, bikes…"
          autoComplete="off"
          enterKeyHint="search"
          className="h-9 min-w-0 flex-1 border-0 bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-muted-foreground sm:h-10 [&::-webkit-search-cancel-button]:hidden"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <X size={15} aria-hidden />
          </button>
        )}
        <Button
          type="submit"
          size="icon"
          aria-label="Search"
          disabled={!canSubmit}
          aria-busy={pending || undefined}
          className="size-9 shrink-0 sm:size-10"
        >
          {pending ? (
            <Loader2 size={16} className="animate-spin" aria-hidden />
          ) : (
            <ArrowRight size={16} aria-hidden />
          )}
        </Button>
      </div>
    </form>
  );
}
