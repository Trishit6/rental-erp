import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { maxCartQuantity } from "./schema";

/**
 * Quantity stepper.
 *
 * `−` is disabled at 1 and `+` at the stock on hand, so an invalid quantity
 * cannot be produced from the UI at all — the server would reject it anyway, but
 * the control should not offer it. Every button carries a real label; the glyph
 * is decoration, not the accessible name.
 */
export function CartItemQuantity({
  value,
  availableQuantity,
  onChange,
  disabled,
  isPending,
  label,
}: {
  value: number;
  /** Stock on hand for this listing. */
  availableQuantity: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  isPending?: boolean;
  /** Names the product for the +/- labels, e.g. "Sony WH-1000XM5". */
  label: string;
}) {
  const max = maxCartQuantity(availableQuantity);
  const atMin = value <= 1;
  const atMax = value >= max;
  const locked = disabled || isPending;

  return (
    <div className="flex items-center gap-2.5">
      <div
        className="inset-surface flex items-center gap-1 rounded-full p-1"
        role="group"
        aria-label={`Quantity for ${label}`}
      >
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          disabled={locked || atMin}
          aria-label={`Decrease quantity of ${label}`}
          className="flex size-7 items-center justify-center rounded-full transition hover:bg-primary/10 disabled:opacity-35 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Minus size={13} aria-hidden />
        </button>

        <span
          aria-live="polite"
          className="min-w-7 text-center font-heading text-sm font-extrabold tabular-nums"
        >
          {value}
        </span>

        <button
          type="button"
          onClick={() => onChange(value + 1)}
          disabled={locked || atMax}
          aria-label={`Increase quantity of ${label}`}
          className="flex size-7 items-center justify-center rounded-full transition hover:bg-primary/10 disabled:opacity-35 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Plus size={13} aria-hidden />
        </button>
      </div>

      <p className={cn("text-[11px] font-semibold text-muted-foreground")}>
        {atMax ? <span className="text-primary">Max {max}</span> : `${max} available`}
      </p>
    </div>
  );
}
