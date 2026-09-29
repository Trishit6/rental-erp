import { ArrowUpDown } from "lucide-react";
import { DEFAULT_SORT, SORT_OPTIONS } from "@/lib/product-search/schema";
import type { ProductSort } from "@/lib/product-search/types";

/** Sorting control. Only options the products API can order by correctly. */
export function SortSelect({
  value,
  onChange,
  id = "product-sort",
}: {
  value?: ProductSort;
  onChange: (sort: ProductSort) => void;
  id?: string;
}) {
  const current = value ?? DEFAULT_SORT;

  return (
    <div className="flex items-center gap-2">
      <ArrowUpDown size={15} aria-hidden className="shrink-0 text-primary" />
      <label htmlFor={id} className="sr-only">
        Sort results
      </label>
      <select
        id={id}
        value={current}
        onChange={(event) => onChange(event.target.value as ProductSort)}
        className="inset-surface h-10 rounded-full px-3 text-xs font-bold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
