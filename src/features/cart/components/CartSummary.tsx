import { Info, ShieldCheck } from "lucide-react";
import { formatInr } from "@/lib/pricing";
import { Card } from "@/components/ui/card";
import { CartPriceBreakdown } from "./CartPriceBreakdown";
import { itemCountLabel } from "./schema";
import type { CartItem, CartTotals } from "../types";

/**
 * The money panel.
 *
 * Every figure is the server's, not the browser's: the cart endpoint computes
 * the lines and these totals together, so what the user reads here is what the
 * checkout will be given. Delivery, tax and any discount belong to Checkout and
 * are deliberately absent rather than guessed at.
 *
 * The deposit is its own line, labelled refundable, because it comes back after
 * a rental is returned — it is not part of what the seller earns.
 */
export function CartSummary({
  items,
  totals,
  showBreakdown = false,
  className,
}: {
  items: CartItem[];
  totals: CartTotals;
  /** The per-line detail. The drawer leaves it out; the page shows it. */
  showBreakdown?: boolean;
  className?: string;
}) {
  const hasRentals = totals.rentalCharges > 0;
  const hasDeposits = totals.securityDeposits > 0;

  return (
    <Card className={className}>
      <div className="space-y-4 p-5">
        <h2 className="font-heading text-lg font-extrabold">Summary</h2>

        {showBreakdown && <CartPriceBreakdown items={items} className="pb-1" />}

        <div className="space-y-2 text-sm">
          {hasRentals && (
            <Row
              label="Subtotal"
              hint="Purchases + rental charges"
              value={formatInr(totals.subtotal)}
            />
          )}
          {hasRentals && (
            <Row
              label="Rental charges"
              hint="Payable for the rental period"
              value={formatInr(totals.rentalCharges)}
            />
          )}
          {!hasRentals && <Row label="Subtotal" value={formatInr(totals.subtotal)} />}

          {hasDeposits && (
            <Row
              label="Security deposits"
              hint="Refundable after return"
              value={formatInr(totals.securityDeposits)}
              tone="accent"
            />
          )}

          <div className="neumo-divider my-3" />

          <div className="flex items-baseline justify-between gap-3">
            <span className="font-heading text-base font-extrabold">Estimated total</span>
            <span className="font-heading text-xl font-black tabular-nums">
              {formatInr(totals.estimatedTotal)}
            </span>
          </div>
        </div>

        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <Info size={12} aria-hidden className="mt-0.5 shrink-0" />
          Delivery, taxes and any discounts are worked out at checkout. Deposits are
          returned to you after a rental is handed back.
        </p>
      </div>
    </Card>
  );
}

function Row({
  label,
  hint,
  value,
  tone,
}: {
  label: string;
  hint?: string;
  value: string;
  tone?: "accent";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="min-w-0">
        <span className={tone === "accent" ? "font-semibold text-accent" : "text-muted-foreground"}>
          {label}
        </span>
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
      <span className="shrink-0 font-bold tabular-nums">{value}</span>
    </div>
  );
}

/** A compact "N items · ₹X" strip for the drawer header. */
export function CartSummaryBadge({
  totals,
}: {
  totals: CartTotals;
}) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
      <ShieldCheck size={13} aria-hidden className="text-accent" />
      {itemCountLabel(totals.itemCount)} · {formatInr(totals.estimatedTotal)}
    </span>
  );
}
