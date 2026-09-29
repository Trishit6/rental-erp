import type { PaymentMethod, PaymentMethodDescriptor } from "../types";
import { PaymentMethodCard } from "./PaymentMethodCard";

/**
 * The method list.
 *
 * Rendered from whatever the provider reports, never from a hardcoded array —
 * a method the provider cannot currently take must not be offered, and one it
 * has just enabled must appear without a frontend release.
 */
export function PaymentMethodSelector({
  methods,
  value,
  onChange,
  disabled,
  isLoading,
}: {
  methods: PaymentMethodDescriptor[];
  value: PaymentMethod | null;
  onChange: (method: PaymentMethod) => void;
  disabled?: boolean;
  isLoading?: boolean;
}) {
  return (
    // `role="radiogroup"` on the fieldset: the radios are one mutually-exclusive
    // choice, and that is what a screen reader needs to announce.
    <fieldset className="space-y-3" disabled={disabled} role="radiogroup">
      <legend className="font-heading text-lg font-extrabold text-foreground">
        Choose payment method
      </legend>

      {isLoading ? (
        <div className="space-y-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="raised-surface h-[68px] animate-pulse rounded-2xl" />
          ))}
        </div>
      ) : methods.length === 0 ? (
        <p className="inset-surface rounded-2xl p-4 text-sm text-muted-foreground">
          No payment methods are available right now. Please try again shortly.
        </p>
      ) : (
        <div className="space-y-2.5" data-testid="payment-methods">
          {methods.map((option) => (
            <PaymentMethodCard
              key={option.method}
              option={option}
              selected={value === option.method}
              onSelect={onChange}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </fieldset>
  );
}
