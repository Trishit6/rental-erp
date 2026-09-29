import { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { startOfDay } from "@/lib/pricing";

/**
 * "5 days remaining" / "2d 08h 32m remaining".
 *
 * Three constraints shape this component, and all three are about honesty and
 * cost:
 *
 *  1. **It never changes rental state.** A countdown is a display; the server
 *     owns the status. A customer leaving a tab open at midnight cannot
 *     promote their own rental to ACTIVE by watching it.
 *  2. **It makes no requests.** It ticks on a local timer and nothing else, so
 *     an open page costs zero API calls.
 *  3. **It stops.** The interval is cleared on unmount and on completion, and
 *     the component renders nothing once the window has passed.
 *
 * The dates are day-precision (that is what the columns hold), so the tick is
 * measured in **days**, not seconds. A seconds-resolution countdown against a
 * date with no time component would invent a precision the data does not have,
 * and would drift by hours depending on the viewer's timezone.
 */

/**
 * Signed whole days from now to the target, on UTC day boundaries.
 *
 * Signed rather than clamped, because "due back **today**" and "was due
 * yesterday" are different situations and need different words. Clamping both to
 * zero would make a rental that is due today render nothing at all — the exact
 * moment the customer most needs to be told.
 */
function daysUntil(nowMs: number, target: Date): number | null {
  const from = startOfDay(new Date(nowMs));
  const to = startOfDay(target);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * How often the label is re-evaluated.
 *
 * The underlying value is a *day*, so the label can only actually change at a
 * day boundary. Five minutes keeps it accurate to within five minutes of
 * midnight for twelve renders an hour — and because it is a local timer it
 * costs no requests at all.
 */
const TICK_MS = 5 * 60 * 1000;

export function RentalCountdown({
  target,
  mode = "remaining",
  active = true,
  className,
}: {
  /** The ISO date the countdown runs to. */
  target: string;
  /** `remaining` reads "5 days remaining"; `starts` reads "Starts in 2 days". */
  mode?: "remaining" | "starts";
  /** Only true while the countdown should run. */
  active?: boolean;
  className?: string;
}) {
  const targetDate = useMemo(() => new Date(target), [target]);
  const valid = !Number.isNaN(targetDate.getTime());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // No synchronous setState here: the initial value is already "now", and a
    // value that only changes at midnight does not need catching up the instant
    // the countdown is switched on.
    if (!active || !valid) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [active, valid]);

  if (!valid) return null;

  const days = daysUntil(now, targetDate);
  // An unparseable date, or a window that has closed, has nothing useful to say.
  // Whether a rental is overdue is the server's call, not this component's.
  if (days === null) return null;
  if (days < 0) return null;

  const label =
    mode === "starts"
      ? days === 0
        ? "Starts today"
        : days === 1
          ? "Starts tomorrow"
          : `Starts in ${days} days`
      : days === 0
        ? "Due back today"
        : days === 1
          ? "1 day remaining"
          : `${days} days remaining`;

  return (
    <p className={cn("flex items-center gap-1.5 text-xs font-semibold text-foreground", className)}>
      <Clock size={12} className="text-accent" aria-hidden="true" />
      {label}
      {/* A plain sentence for assistive tech, rather than a number that changes
          under a screen reader mid-sentence. */}
      <span className="sr-only">
        {days === 0 ? "Due back today." : `${days} day${days === 1 ? "" : "s"}`}
      </span>
    </p>
  );
}
