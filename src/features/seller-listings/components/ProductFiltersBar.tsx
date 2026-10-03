import { useEffect, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SELLER_PRODUCT_SORTS,
  SELLER_SORT_LABELS,
  STATUS_LABELS,
  LISTING_MODES,
  type SellerProductFilters,
  type SellerProductSort,
  type SellerProductStatus,
  type StockFilter,
} from "../types";

/**
 * The listings toolbar: search, status, listing type, stock, sort.
 *
 * ## The search box is debounced, and the page resets
 *
 * Two things a seller would notice immediately if they were missing:
 *
 *  - Typing does not fire a request per keystroke. The box holds its own state
 *    and reports after 300ms of quiet. `placeholderData` in the query keeps the
 *    previous page on screen while the new one loads, so the table does not flash
 *    empty on every pause in typing.
 *  - Changing any filter returns to page 1. Staying on page 7 of 9 and then
 *    narrowing to a filter with two results shows an empty table and reads as
 *    "no matches" rather than "you are past the end".
 *
 * ## The filter state lives in the URL
 *
 * Owned by the route's search params, not by this component. A filtered listing
 * is then a URL a seller can paste to a colleague, and the back button steps
 * through their filter history — which is what every list in this app does.
 */
export function ProductFiltersBar({
  filters,
  onChange,
  total,
}: {
  filters: SellerProductFilters;
  onChange: (next: SellerProductFilters) => void;
  /** Total matching the current filters, for the "showing N of M" line. */
  total: number;
}) {
  const [searchDraft, setSearchDraft] = useState(filters.search);

  // Keep the box in step when the URL changes from elsewhere (back button, a
  // "clear filters" link) without fighting the debounce while typing. Reseeded
  // during render — the same pattern the analytics page's PeriodPicker uses —
  // rather than in an effect, so the URL change and the box agree in one paint.
  const [seededFor, setSeededFor] = useState(filters.search);
  if (seededFor !== filters.search) {
    setSeededFor(filters.search);
    setSearchDraft(filters.search);
  }

  useEffect(() => {
    if (searchDraft === filters.search) return;
    const timer = setTimeout(() => {
      onChange({ ...filters, search: searchDraft, page: 1 });
    }, 300);
    return () => clearTimeout(timer);
    // `onChange` and `filters` are intentionally omitted: including them would
    // restart the timer on every render of the parent, and the effect would never
    // fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  const activeCount = [filters.status, filters.listingType, filters.stock].filter(Boolean).length;

  function clearAll() {
    setSearchDraft("");
    onChange({
      ...filters,
      search: "",
      status: "",
      listingType: "",
      stock: "",
      page: 1,
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            size={15}
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Search your listings by title"
            aria-label="Search your listings"
            className="pl-10"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select
            label="Sort"
            value={filters.sort}
            onChange={(value) =>
              onChange({ ...filters, sort: value as SellerProductSort, page: 1 })
            }
            options={SELLER_PRODUCT_SORTS.map((sort) => ({
              value: sort,
              label: SELLER_SORT_LABELS[sort],
            }))}
          />
          {activeCount > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
              <X size={14} aria-hidden />
              Clear {activeCount}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
          <SlidersHorizontal size={13} aria-hidden />
          Status
        </span>
        <FilterChip
          active={filters.status === ""}
          onClick={() => onChange({ ...filters, status: "", page: 1 })}
        >
          All
        </FilterChip>
        {(Object.keys(STATUS_LABELS) as SellerProductStatus[]).map((status) => (
          <FilterChip
            key={status}
            active={filters.status === status}
            onClick={() =>
              onChange({
                ...filters,
                status: filters.status === status ? "" : status,
                page: 1,
              })
            }
          >
            {STATUS_LABELS[status]}
          </FilterChip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-muted-foreground">Type</span>
        <FilterChip
          active={filters.listingType === ""}
          onClick={() => onChange({ ...filters, listingType: "", page: 1 })}
        >
          All
        </FilterChip>
        {LISTING_MODES.map((mode) => (
          <FilterChip
            key={mode}
            active={filters.listingType === mode}
            onClick={() =>
              onChange({
                ...filters,
                listingType: filters.listingType === mode ? "" : mode,
                page: 1,
              })
            }
          >
            {mode === "SALE" ? "For sale" : mode === "RENT" ? "For rent" : "Both"}
          </FilterChip>
        ))}

        <span className="ml-2 text-xs font-bold text-muted-foreground">Stock</span>
        <FilterChip
          active={filters.stock === ""}
          onClick={() => onChange({ ...filters, stock: "", page: 1 })}
        >
          All
        </FilterChip>
        {(
          [
            { value: "in_stock", label: "In stock" },
            { value: "out_of_stock", label: "Out of stock" },
          ] as { value: StockFilter; label: string }[]
        ).map((option) => (
          <FilterChip
            key={option.value}
            active={filters.stock === option.value}
            onClick={() =>
              onChange({
                ...filters,
                stock: filters.stock === option.value ? "" : option.value,
                page: 1,
              })
            }
          >
            {option.label}
          </FilterChip>
        ))}
      </div>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {total} listing{total === 1 ? "" : "s"}
        {filters.search && ` matching “${filters.search}”`}
      </p>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
        active ? "primary-button text-primary-foreground" : "inset-surface text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        className="inset-surface h-9 rounded-full px-3 text-xs font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
