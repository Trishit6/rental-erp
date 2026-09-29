import { ArrowUpDown } from "lucide-react";
import { DEFAULT_FAVORITE_SORT, FAVORITE_SORT_OPTIONS } from "./schema";
import type { FavoriteSort } from "../types";

/**
 * Wishlist sorting. Renders exactly the options the endpoint can order by — no
 * "recommended" or "most viewed", which would be meaningless for someone's own
 * saved items, and nothing that would sort on a field the API does not return.
 */
export function FavoritesSort({
  value,
  onChange,
  id = "favorites-sort",
  compact = false,
}: {
  value?: FavoriteSort;
  onChange: (sort: FavoriteSort) => void;
  id?: string;
  /** Drops the word "Sort" for the mobile toolbar's icon row. */
  compact?: boolean;
}) {
  const current = value ?? DEFAULT_FAVORITE_SORT;

  return (
    <div className="flex items-center gap-2">
      <ArrowUpDown size={15} aria-hidden className="shrink-0 text-primary" />
      <label htmlFor={id} className={compact ? "sr-only" : "text-xs font-bold text-foreground"}>
        Sort
      </label>
      <select
        id={id}
        value={current}
        onChange={(event) => onChange(event.target.value as FavoriteSort)}
        className="inset-surface h-10 rounded-full px-3 text-xs font-bold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        {FAVORITE_SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
