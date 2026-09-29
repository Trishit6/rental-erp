import { CalendarRange } from "lucide-react";

/** The page heading. The count is one string, not three adjacent text nodes. */
export function RentalsHeader({ resultCount }: { resultCount?: number }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="eyebrow flex items-center gap-1.5">
          <CalendarRange size={12} aria-hidden="true" />
          Your rentals
        </p>
        <h1 className="section-title mt-1 text-3xl">My Rentals</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Everything you&apos;re renting, in one place.
        </p>
      </div>

      {resultCount !== undefined && (
        <p
          className="inset-surface rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground"
          aria-live="polite"
        >
          {resultCount === 1 ? "1 rental" : `${resultCount} rentals`}
        </p>
      )}
    </header>
  );
}
