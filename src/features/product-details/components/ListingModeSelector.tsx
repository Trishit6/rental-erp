import { motion, useReducedMotion } from "framer-motion";
import { ShoppingBag, Repeat2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { ListingMode } from "../types";

const MODE_LABELS: Record<ListingMode, string> = {
  RENT: "Rent",
  BUY: "Buy",
  RENT_AND_BUY: "Rent & Buy",
};

const MODE_ICONS = {
  RENT: Repeat2,
  BUY: ShoppingBag,
  RENT_AND_BUY: Repeat2,
} as const;

/**
 * Only the modes the product actually supports are rendered — a rent-only item
 * never offers a Buy tab. Implemented as a radiogroup so arrow keys and screen
 * readers behave like a real choice, not a row of buttons.
 */
export function ListingModeSelector({
  modes,
  value,
  onChange,
}: {
  modes: ListingMode[];
  value: ListingMode;
  onChange: (mode: ListingMode) => void;
}) {
  const reduceMotion = useReducedMotion();
  if (modes.length <= 1) return null;

  const Icon = MODE_ICONS[value];

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        <Icon size={13} aria-hidden />
        How would you like this?
      </p>
      <div
        role="radiogroup"
        aria-label="How would you like this?"
        className="inset-surface flex gap-1 rounded-full p-1"
      >
        {modes.map((mode) => {
          const selected = mode === value;
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(mode)}
              className={cn(
                "relative flex-1 rounded-full px-3 py-2.5 text-sm font-bold transition-colors duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                selected
                  ? "text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {selected && (
                <motion.span
                  layoutId="listing-mode-pill"
                  transition={
                    reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }
                  }
                  className="primary-button absolute inset-0 -z-10 rounded-full"
                  aria-hidden
                />
              )}
              {MODE_LABELS[mode]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
