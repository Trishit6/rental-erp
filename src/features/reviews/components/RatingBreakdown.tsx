import { Star } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { sharePercent } from "./schema";
import type { RatingBucket } from "../types";

/**
 * The rating distribution — one bar per star count, each one a filter.
 *
 * Two decisions worth naming:
 *
 *  - **The bar is a button, not a decoration.** A shopper who wants to know what
 *    the one-star reviews say should be able to click "1 star" and go there,
 *    which is why every row carries the count in its accessible name rather than
 *    leaving it to be inferred from the bar's width.
 *  - **The active filter is announced**, not just coloured, because colour alone
 *    is not a state a screen reader or a colour-blind shopper can perceive.
 */
export function RatingBreakdown({
  distribution,
  total,
  activeRating,
  onSelect,
  disabled = false,
}: {
  distribution: RatingBucket[];
  total: number;
  /** The currently applied star filter, if any. */
  activeRating?: number | null;
  onSelect?: (rating: number | null) => void;
  disabled?: boolean;
}) {
  const interactive = typeof onSelect === "function" && !disabled;

  return (
    <ul className="space-y-1.5">
      {distribution.map((bucket) => {
        const percent = sharePercent(bucket.share);
        const active = activeRating === bucket.stars;

        const content = (
          <>
            <span className="w-9 shrink-0 text-[11px] font-bold tabular-nums text-muted-foreground">
              {bucket.stars} <Star size={12} aria-hidden className="inline fill-current" />
            </span>
            <span
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/5 dark:bg-white/5"
              role="presentation"
            >
              <span
                className={cn(
                  "block h-full rounded-full transition-[width] duration-300",
                  active ? "bg-primary" : "bg-primary/70",
                )}
                style={{ width: `${percent}%` }}
              />
            </span>
            <span className="w-7 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
              {bucket.count}
            </span>
          </>
        );

        return (
          <li key={bucket.stars}>
            {interactive ? (
              <button
                type="button"
                onClick={() => onSelect(active ? null : bucket.stars)}
                disabled={disabled}
                aria-pressed={active}
                aria-label={`${bucket.stars} star${bucket.stars === 1 ? "" : "s"} — ${bucket.count} of ${total} reviews`}
                className={cn(
                  "flex w-full items-center gap-2 rounded-full px-1 py-0.5 text-left transition",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                  !disabled && "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]",
                  disabled && "cursor-not-allowed opacity-60",
                )}
              >
                {content}
              </button>
            ) : (
              <div className="flex items-center gap-2">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
