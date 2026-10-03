import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import {
  activeRentalFilterCount,
  hasActiveRentalFilters,
  RENTAL_STATUS_OPTIONS,
  type RentalsSearch,
} from "./schema";

/**
 * Status and date filters.
 *
 * Every control writes to the URL, so a filtered view is shareable and the back
 * button undoes it. The date inputs are day-precision and optional — a
 * half-filled range is ignored rather than producing an invalid query.
 *
 * The bucket tabs live separately (`RentalsTabs`); this panel is for the finer
 * grain.
 */
export function RentalsFilter({
  search,
  onChange,
  onClear,
  className,
}: {
  search: RentalsSearch;
  onChange: (patch: Partial<RentalsSearch>) => void;
  onClear: () => void;
  className?: string;
}) {
  const count = activeRentalFilterCount(search);

  return (
    <section
      className={cn("raised-surface space-y-4 p-4 sm:p-5", className)}
      aria-label="Rental filters"
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
        {hasActiveRentalFilters(search) && (
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

      <fieldset>
        <legend className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Status
        </legend>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Status">
          <Chip selected={!search.status} onClick={() => onChange({ status: undefined })}>
            All
          </Chip>
          {RENTAL_STATUS_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              selected={search.status === option.value}
              onClick={() =>
                onChange({ status: search.status === option.value ? undefined : option.value })
              }
            >
              {option.label}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Starting between
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

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        selected
          ? "primary-button text-primary-foreground"
          : "inset-surface text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
