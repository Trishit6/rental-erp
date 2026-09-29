import { CreditCard, Landmark, Smartphone, Wallet } from "lucide-react";
import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { PaymentMethod, PaymentMethodDescriptor } from "../types";

const ICONS: Record<PaymentMethod, ComponentType<LucideProps>> = {
  UPI: Smartphone,
  CARD: CreditCard,
  NET_BANKING: Landmark,
  WALLET: Wallet,
};

/**
 * One payment method option.
 *
 * A native `<input type="radio">` under a `<label>`, not a div with a click
 * handler. That buys keyboard navigation, screen-reader announcement and focus
 * behaviour from the platform instead of reimplementing them — which is both
 * less code and more correct than a hand-rolled `role="radio"`.
 */
export function PaymentMethodCard({
  option,
  selected,
  onSelect,
  disabled,
}: {
  option: PaymentMethodDescriptor;
  selected: boolean;
  onSelect: (method: PaymentMethod) => void;
  disabled?: boolean;
}) {
  const Icon = ICONS[option.method] ?? CreditCard;

  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-2xl p-4 transition-all",
        "focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2",
        selected ? "raised-surface" : "inset-surface hover:brightness-[0.99]",
        disabled && "cursor-not-allowed opacity-60",
      )}
      data-testid={`payment-method-${option.method}`}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl",
          selected ? "soft-button text-primary" : "inset-surface text-muted-foreground",
        )}
        aria-hidden="true"
      >
        <Icon size={17} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-foreground">{option.label}</span>
        <span className="block truncate text-xs text-muted-foreground">{option.description}</span>
      </span>

      <input
        type="radio"
        name="payment-method"
        value={option.method}
        checked={selected}
        disabled={disabled}
        onChange={() => onSelect(option.method)}
        className="size-4 shrink-0 accent-[var(--color-primary)]"
      />
    </label>
  );
}
