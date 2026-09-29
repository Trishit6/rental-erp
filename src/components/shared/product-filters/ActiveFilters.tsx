import { X } from "lucide-react";
import type { ActiveFilter, ProductSearch } from "@/lib/product-search/types";

/**
 * Removable pills for every active filter, plus a single "Clear all".
 *
 * The pill list is passed in rather than derived here: Browse scopes to a
 * `category` while a category page scopes to a `subcategory`, and only the feature
 * knows which of those is a real filter on its page.
 *
 * Defined behaviour: clearing removes the filters only — a typed search term is
 * kept (use the search field's own clear button for that), so "Clear all" always
 * means "stop narrowing", never "forget what I'm looking for".
 */
export function ActiveFilters({
  filters,
  onChange,
  onClearAll,
}: {
  filters: ActiveFilter[];
  onChange: (patch: Partial<ProductSearch>) => void;
  onClearAll: () => void;
}) {
  if (!filters.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
      {filters.map((filter) => (
        <FilterPill
          key={filter.key}
          filter={filter}
          onRemove={() => {
            const patch: Partial<ProductSearch> = {};
            for (const key of filter.clear) patch[key] = undefined;
            onChange(patch);
          }}
        />
      ))}

      <button
        type="button"
        onClick={onClearAll}
        className="ml-1 text-xs font-bold text-primary underline-offset-4 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        Clear all
      </button>
    </div>
  );
}

function FilterPill({ filter, onRemove }: { filter: ActiveFilter; onRemove: () => void }) {
  return (
    <span className="inset-surface inline-flex items-center gap-1.5 rounded-full py-1 pl-3 pr-1.5 text-xs font-bold text-foreground">
      <span className="capitalize">{filter.label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter: ${filter.label}`}
        className="flex size-5 items-center justify-center rounded-full text-muted-foreground transition hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <X size={12} />
      </button>
    </span>
  );
}
