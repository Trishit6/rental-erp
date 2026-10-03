import { CreditCard, Info, Receipt } from "lucide-react";
import { format } from "date-fns";
import { formatInr } from "@/lib/pricing";
import { OrderStatusBadge } from "./OrderStatusBadge";
import type { OrderPayment } from "../types";

/**
 * Payment information.
 *
 * Shows only what the server considers safe: a method, a status, an amount, a
 * currency, a date and the provider's reference. There is deliberately no field
 * for a card number, an expiry, a CVV or a UPI PIN — none of those exist in the
 * `transactions` row this reads from, so there is nothing to accidentally print.
 *
 * The reference is rendered in full because it is the one value a customer needs
 * to quote when something goes wrong, and it is an internal reference rather
 * than a credential.
 */
export function OrderPaymentSummary({
  payment,
  fallbackProvider,
}: {
  payment: OrderPayment | null;
  fallbackProvider: string;
}) {
  if (!payment) {
    return (
      <section className="raised-surface p-5" aria-labelledby="order-payment-heading">
        <h2
          id="order-payment-heading"
          className="flex items-center gap-2 font-heading text-lg font-extrabold"
        >
          <CreditCard size={16} aria-hidden="true" />
          Payment
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No payment record is attached to this order.
        </p>
      </section>
    );
  }

  const isDevelopmentProvider = fallbackProvider === "mock" || fallbackProvider === "dev_mock";

  return (
    <section className="raised-surface p-5" aria-labelledby="order-payment-heading">
      <h2
        id="order-payment-heading"
        className="flex items-center gap-2 font-heading text-lg font-extrabold"
      >
        <CreditCard size={16} aria-hidden="true" />
        Payment
      </h2>

      <dl className="mt-3 space-y-2.5 text-sm" data-testid="order-payment">
        <Row
          label="Method"
          value={payment.paymentMethod ? prettyMethod(payment.paymentMethod) : "—"}
        />
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <OrderStatusBadge status={payment.status} size="sm" />
          </dd>
        </div>
        <Row label="Amount" value={formatInr(payment.amount)} />
        <Row label="Currency" value={payment.currency} />
        <Row label="Paid on" value={format(new Date(payment.createdAt), "d MMM yyyy, h:mm a")} />
        {payment.providerTransactionId && (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">Reference</dt>
            <dd className="flex min-w-0 items-center gap-1.5 font-mono text-xs">
              <Receipt size={12} aria-hidden="true" className="shrink-0 text-muted-foreground" />
              <span className="truncate" title={payment.providerTransactionId}>
                {payment.providerTransactionId}
              </span>
            </dd>
          </div>
        )}
      </dl>

      {isDevelopmentProvider && (
        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <Info size={11} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
          Recorded by the development payment provider. No real money moved.
        </p>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * Payment method labels.
 *
 * An explicit map rather than a generic humaniser: acronyms are the common case
 * here, and turning `UPI` into `Upi` reads like a typo to the customer. A
 * method this build does not know still falls back to readable words, since
 * methods come from the provider.
 */
const METHOD_LABELS: Record<string, string> = {
  UPI: "UPI",
  CARD: "Card",
  NET_BANKING: "Net banking",
  WALLET: "Wallet",
};

function prettyMethod(method: string): string {
  const known = METHOD_LABELS[method];
  if (known) return known;
  return method
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
