import { useState } from "react";
import { Loader2, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatInr } from "@/lib/pricing";

/**
 * The coupon entry on the payment page.
 *
 * The field owns only the *typed* text; whether a code is applied is the page's
 * state, because the applied code has to survive into the intent. The message
 * shown is the server's own reason, verbatim — the client never decides whether
 * a code is valid, and never computes the discount.
 */
export function CouponField({
  appliedCode,
  appliedDiscountPaise,
  message,
  isChecking,
  onApply,
  onClear,
}: {
  appliedCode: string | null;
  appliedDiscountPaise: number | null;
  message: string | null;
  isChecking: boolean;
  onApply: (code: string) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState("");

  if (appliedCode) {
    return (
      <section
        className="raised-surface flex items-center justify-between gap-3 p-4"
        aria-label="Coupon"
        data-testid="coupon-applied"
      >
        <div className="flex items-center gap-2 text-sm">
          <Tag size={15} className="text-primary" aria-hidden="true" />
          <span className="font-semibold tracking-wide">{appliedCode}</span>
          {appliedDiscountPaise ? (
            <span className="text-muted-foreground">−{formatInr(appliedDiscountPaise)}</span>
          ) : null}
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onClear}>
          <X size={14} aria-hidden="true" />
          Remove
        </Button>
      </section>
    );
  }

  return (
    <section className="raised-surface space-y-2 p-4" aria-label="Coupon">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor="payment-coupon" className="text-xs font-semibold text-muted-foreground">
            Have a code?
          </label>
          <Input
            id="payment-coupon"
            value={draft}
            onChange={(event) => setDraft(event.target.value.toUpperCase())}
            placeholder="SAVE10"
            maxLength={40}
            autoComplete="off"
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={draft.trim().length === 0 || isChecking}
          onClick={() => onApply(draft.trim())}
        >
          {isChecking ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null}
          Apply
        </Button>
      </div>
      {message ? (
        <p className="text-xs text-destructive" role="alert">
          {message}
        </p>
      ) : null}
    </section>
  );
}
