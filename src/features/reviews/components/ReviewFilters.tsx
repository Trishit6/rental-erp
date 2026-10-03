import { Star, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import {
  PURCHASE_TYPE_LABELS,
  REVIEW_PURCHASE_TYPES,
  REVIEW_RATINGS,
  REVIEW_RATING_LABELS,
  REVIEW_SORTS,
  REVIEW_SORT_LABELS,
  type ReviewFilters,
  type ReviewPurchaseType,
  type ReviewRating,
  type ReviewSort,
} from "../types";

/**
 * The review list's controls: star filter, purchase-type filter, sort.
 *
 * Renders **exactly** the values the endpoint implements. There is no
 * "Recommended by us" and no "Most relevant to you": the API sorts by
 * `helpful_count`, `rating` and `created_at`, and offering a sort it cannot
 * perform would be a control that silently does the wrong thing.
 *
 * Every filter is a real toggle with `aria-pressed`, not a styled `<div>`, so a
 * screen reader announces which filters are currently narrowing the list.
 *
 * The layout is a horizontally scrollable row on mobile rather than a wrapped
 * grid: with ten chips, wrapping pushes the first review below the fold on a
 * phone, and a review section whose controls need scrolling to reach reads as
 * broken. `overflow-x-auto` keeps it one line without the page itself ever
 * scrolling sideways.
 */
export function ReviewFilters({
  filters,
  onChange,
  /** Counts per purchase type, so a filter with nothing behind it can be hidden. */
  purchaseCounts,
  disabled = false,
}: {
  filters: ReviewFilters;
  onChange: (patch: Partial<Omit<ReviewFilters, "page">>) => void;
  purchaseCounts?: { purchase: number; rental: number };
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
        <div className="flex shrink-0 items-center gap-2">
          <label htmlFor="reviews-sort" className="text-xs font-bold text-muted-foreground">
            Sort
          </label>
          <select
            id="reviews-sort"
            value={filters.sort}
            disabled={disabled}
            onChange={(event) => onChange({ sort: event.target.value as ReviewSort })}
            className="inset-surface h-9 shrink-0 rounded-full px-3 text-xs font-bold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-60"
          >
            {REVIEW_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {REVIEW_SORT_LABELS[sort]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
        <FilterChip
          active={filters.rating === null}
          onClick={() => onChange({ rating: null })}
          disabled={disabled}
        >
          All Ratings
        </FilterChip>

        {REVIEW_RATINGS.map((rating) => (
          <FilterChip
            key={rating}
            active={filters.rating === rating}
            onClick={() => onChange({ rating: filters.rating === rating ? null : rating })}
            disabled={disabled}
          >
            <Star size={12} aria-hidden className="fill-current" />
            {REVIEW_RATING_LABELS[rating]}
          </FilterChip>
        ))}
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
        <FilterChip
          active={filters.purchaseType === null}
          onClick={() => onChange({ purchaseType: null })}
          disabled={disabled}
        >
          All
        </FilterChip>

        {REVIEW_PURCHASE_TYPES.map((type) => {
          const count = type === "RENTAL" ? purchaseCounts?.rental : purchaseCounts?.purchase;
          // A filter with nothing behind it is hidden rather than offered and
          // returning an empty list — the same rule as the order status chips.
          if (purchaseCounts && (count ?? 0) === 0) return null;

          return (
            <FilterChip
              key={type}
              active={filters.purchaseType === type}
              onClick={() =>
                onChange({
                  purchaseType: filters.purchaseType === type ? null : (type as ReviewPurchaseType),
                })
              }
              disabled={disabled}
            >
              {PURCHASE_TYPE_LABELS[type]}
            </FilterChip>
          );
        })}
      </div>
    </div>
  );
}

/** Clear the narrowing filters, keeping the sort. */
export function ActiveFilterSummary({
  filters,
  onChange,
}: {
  filters: ReviewFilters;
  onChange: (patch: Partial<Omit<ReviewFilters, "page">>) => void;
}) {
  if (filters.rating === null && filters.purchaseType === null) return null;

  const parts: string[] = [];
  if (filters.rating !== null) parts.push(REVIEW_RATING_LABELS[filters.rating as ReviewRating]);
  if (filters.purchaseType !== null) parts.push(PURCHASE_TYPE_LABELS[filters.purchaseType]);

  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground">
      Showing {parts.join(" + ")}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={() => onChange({ rating: null, purchaseType: null })}
      >
        <X size={12} aria-hidden />
        Clear
      </Button>
    </p>
  );
}

function FilterChip({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        "disabled:cursor-not-allowed disabled:opacity-60",
        active
          ? "bg-primary text-primary-foreground"
          : "inset-surface text-foreground hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}
