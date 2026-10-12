import { Loader2, ReceiptText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils/cn";
import { useAdminTransactionDetail } from "../query";
import { formatAdminDateTime, formatAdminMoney, humanizeEnum } from "./format";
import {
  MODERATION_STATUS_BADGE,
  NEUTRAL_BADGE,
  ORDER_STATUS_BADGE,
  PAYMENT_STATUS_BADGE,
} from "./status-badge";

/**
 * One payment, its webhook evidence, and what it refunded.
 *
 * ## Why the raw payload is shown, folded away
 *
 * "The transaction says FAILED" is a conclusion; the events are the evidence for it.
 * An operator investigating a payment that a customer says succeeded needs to read
 * what the provider actually sent, so the payload is here in full — but behind a
 * disclosure, because the common case is reading the event *list*, not the JSON.
 *
 * ## Why there is no card number anywhere
 *
 * There never is. The provider boundary stores references and amounts, never card
 * data (`server/lib/payments/types.ts`), so this dialog cannot show one even by
 * mistake — there is nothing to redact.
 */
export function AdminTransactionDetailDialog({
  transactionId,
  open,
  onOpenChange,
}: {
  transactionId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const detail = useAdminTransactionDetail(open ? transactionId : null);
  const data = detail.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <ReceiptText size={16} aria-hidden className="text-muted-foreground" />
            <span>{data ? `Transaction #${data.transaction.id}` : "Transaction"}</span>
            {data ? (
              <Badge
                className={cn(
                  "whitespace-nowrap",
                  PAYMENT_STATUS_BADGE[data.transaction.status] ?? NEUTRAL_BADGE,
                )}
              >
                {humanizeEnum(data.transaction.status)}
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {data
              ? `${humanizeEnum(data.transaction.type)} · ${formatAdminDateTime(
                  data.transaction.createdAt,
                )}`
              : "Loading the payment…"}
          </DialogDescription>
        </DialogHeader>

        {detail.isLoading && !data ? (
          <div className="space-y-2 py-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : detail.isError || !data ? (
          <div className="py-4 text-sm text-destructive" role="alert">
            This transaction could not be loaded.
          </div>
        ) : (
          <div className="space-y-5">
            <section className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <Field label="Amount" value={formatAdminMoney(data.transaction.amount, data.transaction.currency)} />
              <Field label="Provider" value={data.transaction.provider} />
              <Field label="Provider reference" value={data.transaction.providerTransactionId ?? "—"} />
              <Field
                label="Method"
                value={data.transaction.paymentMethod ? humanizeEnum(data.transaction.paymentMethod) : "—"}
              />
            </section>

            {data.retryHint ? (
              <section className="rounded-xl bg-warning/10 p-3 text-sm text-warning">
                <p className="font-semibold">Next step</p>
                <p>{data.retryHint}</p>
              </section>
            ) : null}

            {data.transaction.failureReason ? (
              <section className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                <p className="font-semibold">Recorded failure</p>
                <p>{data.transaction.failureReason}</p>
              </section>
            ) : null}

            {data.order ? (
              <section>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Order
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">
                    {data.order.orderNumber ?? `Order #${data.order.id}`}
                  </span>
                  <Badge
                    className={cn(
                      "whitespace-nowrap",
                      ORDER_STATUS_BADGE[data.order.status] ?? NEUTRAL_BADGE,
                    )}
                  >
                    {humanizeEnum(data.order.status)}
                  </Badge>
                  <Badge
                    className={cn(
                      "whitespace-nowrap",
                      PAYMENT_STATUS_BADGE[data.order.paymentStatus] ?? NEUTRAL_BADGE,
                    )}
                  >
                    {humanizeEnum(data.order.paymentStatus)}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {formatAdminMoney(data.order.total, data.order.currency)}
                  </span>
                </div>
              </section>
            ) : (
              <p className="text-sm text-muted-foreground">
                This payment is not attached to an order.
              </p>
            )}

            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Customer
              </h3>
              <Field label="Paid by" value={`${data.customer.name} · ${data.customer.email}`} />
            </section>

            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Webhook events ({data.webhookEvents.length})
              </h3>
              {data.webhookEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No provider events were recorded for this payment.
                </p>
              ) : (
                <ul className="space-y-2">
                  {data.webhookEvents.map((event) => (
                    <li
                      key={event.id}
                      className="rounded-xl border border-[var(--divider)] p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{event.eventType}</span>
                        <Badge
                          className={cn(
                            "whitespace-nowrap",
                            MODERATION_STATUS_BADGE[event.status] ?? NEUTRAL_BADGE,
                          )}
                        >
                          {humanizeEnum(event.status)}
                        </Badge>
                        {event.signatureVerified ? (
                          <span className="text-xs text-muted-foreground">signature verified</span>
                        ) : null}
                        <span className="ml-auto text-xs text-muted-foreground">
                          {formatAdminDateTime(event.processedAt ?? event.createdAt)}
                        </span>
                      </div>
                      {event.errorMessage ? (
                        <p className="mt-1 text-xs text-destructive">{event.errorMessage}</p>
                      ) : null}
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                          Raw payload
                        </summary>
                        <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-muted/50 p-2 text-xs">
                          {pretty(event.payload)}
                        </pre>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {data.refunds.length > 0 ? (
              <section>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Refunds against this order
                </h3>
                <ul className="space-y-2">
                  {data.refunds.map((refund) => (
                    <li
                      key={refund.id}
                      className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--divider)] p-3 text-sm"
                    >
                      <span className="font-semibold">{refund.refundNumber}</span>
                      <Badge
                        className={cn(
                          "whitespace-nowrap",
                          PAYMENT_STATUS_BADGE[refund.status] ?? NEUTRAL_BADGE,
                        )}
                      >
                        {humanizeEnum(refund.status)}
                      </Badge>
                      <span className="tabular-nums">
                        {formatAdminMoney(refund.amount, data.transaction.currency)}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {refund.providerReference ?? formatAdminDateTime(refund.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {detail.isFetching ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 size={12} aria-hidden className="animate-spin" /> Refreshing…
              </p>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function pretty(payload: string): string {
  try {
    return JSON.stringify(JSON.parse(payload), null, 2);
  } catch {
    return payload;
  }
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm">{value}</dd>
    </div>
  );
}
