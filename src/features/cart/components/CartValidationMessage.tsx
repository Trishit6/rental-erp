import { AlertTriangle, ArrowRight, Ban, CalendarX2, Tag, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { CartValidation } from "../types";

/** A reason a line cannot be ordered as it stands, in plain words. */
const TONE: Record<string, { icon: typeof AlertTriangle; className: string }> = {
  PRICE_CHANGED: { icon: Tag, className: "text-primary" },
  QUANTITY_UNAVAILABLE: { icon: TrendingDown, className: "text-primary" },
  RENTAL_UNAVAILABLE: { icon: CalendarX2, className: "text-primary" },
  PRODUCT_UNAVAILABLE: { icon: Ban, className: "text-destructive" },
  MODE_UNSUPPORTED: { icon: Ban, className: "text-destructive" },
  OWN_LISTING: { icon: Ban, className: "text-destructive" },
};

/**
 * What is wrong with a line, and what to do about it.
 *
 * A price change is never hidden behind a generic "something went wrong": the
 * old and the new amount are both shown, because the user agreed to one number
 * and deserves to see the other before paying it.
 */
export function CartValidationMessage({
  issues,
  className,
}: {
  issues: CartValidation[];
  className?: string;
}) {
  if (!issues.length) return null;

  return (
    <ul className={cn("space-y-1.5", className)} role="list">
      {issues.map((issue, index) => {
        const { icon: Icon, className: tone } = TONE[issue.code] ?? TONE.PRODUCT_UNAVAILABLE!;
        return (
          <li
            key={`${issue.code}-${index}`}
            role="status"
            className="flex items-start gap-2 text-xs font-semibold"
          >
            <Icon size={13} aria-hidden className={cn("mt-0.5 shrink-0", tone)} />
            <span className="min-w-0">
              <span className={tone}>{issue.message}</span>
              {issue.code === "PRICE_CHANGED" && issue.previousValue && issue.currentValue && (
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <span>Was {issue.previousValue}</span>
                  <ArrowRight size={11} aria-hidden />
                  <span className="font-bold text-foreground">Now {issue.currentValue}</span>
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
