import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import {
  activeFilterCount,
  hasActiveFilters,
  ORDER_TYPE_OPTIONS,
  type OrdersSearch,
} from "./schema";
import { Chip, OrderStatusFilter } from "./OrderStatusFilter";

/**
 * The filter panel: status, order type and a date range.
 *
 * Every control writes to the URL through `onChange`, so a filtered view is
 * shareable and the back button undoes a filter the way a customer expects. The
 * date inputs are day-precision and optional — a half-filled range is simply
 * ignored rather than producing an invalid query.
 */
export function OrdersFilter({
  search,
  onChange,
  onClear,
  className,
}: {
  search: OrdersSearch;
  onChange: (patch: Partial<OrdersSearch>) => void;
  onClear: () => void;
  className?: string;
}) {
  const count = activeFilterCount(search);

  return (
    <section
      className={cn("raised-surface space-y-4 p-4 sm:p-5", className)}
      aria-label="Filters"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <SlidersHorizontal size={14} aria-hidden="true" />
          Filters
          {count > 0 && (
            <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-bold text-primary">
              {count}
            </span>
          )}
        </h2>
        {hasActiveFilters(search) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="text-muted-foreground"
          >
            <X size={13} aria-hidden="true" />
            Clear
          </Button>
        )}
      </div>

      <OrderStatusFilter
        label="Status"
        value={search.status}
        onChange={(status) => onChange({ status })}
      />

      <fieldset>
        <legend className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Order type
        </legend>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Order type">
          <Chip selected={!search.type} onClick={() => onChange({ type: undefined })}>
            All
          </Chip>
          {ORDER_TYPE_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              selected={search.type === option.value}
              onClick={() =>
                onChange({ type: search.type === option.value ? undefined : option.value })
              }
            >
              {option.label}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Placed between
        </legend>
        <div className="flex items-center gap-2">
          <label className="flex-1">
            <span className="sr-only">From date</span>
            <Input
              type="date"
              value={search.from ?? ""}
              max={search.to || undefined}
              onChange={(event) => onChange({ from: event.target.value || undefined })}
              className="h-10 text-xs"
            />
          </label>
          <span aria-hidden="true" className="text-xs text-muted-foreground">
            →
          </span>
          <label className="flex-1">
            <span className="sr-only">To date</span>
            <Input
              type="date"
              value={search.to ?? ""}
              min={search.from || undefined}
              onChange={(event) => onChange({ to: event.target.value || undefined })}
              className="h-10 text-xs"
            />
          </label>
        </div>
      </fieldset>
    </section>
  );
}
