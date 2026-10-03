import { format } from "date-fns";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * A rental's window.
 *
 * Dates arrive as ISO strings and are only ever *formatted*, never shifted: the
 * columns are day-precision, so adding hours in a local timezone would move a
 * rental by a day for anyone east or west of UTC. Formatting happens in the
 * viewer's locale, which is the one place it belongs.
 */
export function RentalDates({
  startDate,
  endDate,
  days,
  returnedOn,
  className,
  compact = false,
}: {
  startDate: string;
  endDate: string;
  days: number;
  returnedOn?: string | null;
  className?: string;
  compact?: boolean;
}) {
  const start = formatDate(startDate);
  const end = formatDate(endDate);

  if (compact) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        {start} <ArrowRight size={11} className="inline" aria-hidden="true" /> {end} · {days} day
        {days === 1 ? "" : "s"}
      </p>
    );
  }

  return (
    <dl className={cn("space-y-3", className)} data-testid="rental-dates">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-sm text-muted-foreground">Rental start</dt>
        <dd className="text-sm font-semibold">{start}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-sm text-muted-foreground">Rental end</dt>
        <dd className="text-sm font-semibold">{end}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-sm text-muted-foreground">Duration</dt>
        <dd className="text-sm font-semibold">
          {days} day{days === 1 ? "" : "s"}
        </dd>
      </div>
      {returnedOn && (
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-sm text-muted-foreground">Returned on</dt>
          <dd className="text-sm font-semibold">{formatDate(returnedOn)}</dd>
        </div>
      )}
    </dl>
  );
}

/** Guarded: an unparseable date renders as a dash rather than "Invalid Date". */
export function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return format(parsed, "d MMM yyyy");
}

export function formatDateLong(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return format(parsed, "d MMMM yyyy");
}
