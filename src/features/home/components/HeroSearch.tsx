import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { heroSearchSchema } from "./schema";

/**
 * Hero search — submits to /browse with typed search params.
 * Includes a clear button and full keyboard interaction.
 */
export function HeroSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = heroSearchSchema.safeParse({ q: query });
    if (!parsed.success) return;
    void navigate({ to: "/browse", search: { search: parsed.data.q } });
  }

  return (
    <form
      onSubmit={submit}
      role="search"
      className="inset-surface flex h-14 items-center gap-2 rounded-full p-2 pl-5"
    >
      <Search size={18} className="shrink-0 text-muted-foreground" aria-hidden />
      <label className="sr-only" htmlFor="hero-search">
        Search the marketplace
      </label>
      <Input
        id="hero-search"
        className="h-8 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
        placeholder="Search cameras, laptops, bikes..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        enterKeyHint="search"
      />
      {query && (
        <button
          type="button"
          onClick={() => setQuery("")}
          aria-label="Clear search"
          className="rounded-full p-1.5 text-muted-foreground transition hover:text-foreground"
        >
          <X size={15} />
        </button>
      )}
      <button
        type="submit"
        aria-label="Search"
        className="primary-button flex size-10 shrink-0 items-center justify-center rounded-full text-primary-foreground transition hover:-translate-y-px"
      >
        <ArrowRight size={16} />
      </button>
    </form>
  );
}
