import { useState } from "react";
import { BadgeIndianRupee, Loader2, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";
import { useAdminRefundDecision, useAdminRefundDetail } from "../query";
import { formatAdminDateTime, formatAdminMoney, humanizeEnum } from "./format";
import {
  NEUTRAL_BADGE,
  ORDER_STATUS_BADGE,
  PAYMENT_STATUS_BADGE,
} from "./status-badge";

/**
 * One refund request, and the decision form that releases the money.
 *
 * ## Why the captured total is on screen
 *
 * The invariant the whole refund flow enforces is "no more is returned than was
 * captured". Showing the captured total and what is still refundable beside the
 * requested amount turns that from a server error the operator discovers by clicking
 * into a number they can see before they do.
 *
 * ## Why a decision needs a reason and a step-up
 *
 * Returning money is irreversible. The reason is written to the audit log and to the
 * order timeline; the step-up is enforced server-side, so an operator who walked away
 * from an unlocked terminal cannot complete one with a borrowed session.
 */
export function AdminRefundDetailDialog({
  refundId,
  open,
  onOpenChange,
}: {
  refundId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const detail = useAdminRefundDetail(open ? refundId : null);
  const decide = useAdminRefundDecision();

  const [decision, setDecision] = useState<"APPROVE" | "REJECT">("APPROVE");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");

  const data = detail.data;
  const terminal =
    data !== undefined &&
    ["SUCCEEDED", "FAILED", "CANCELLED"].includes(data.refund.status);
  const canSubmit = reason.trim().length >= 3 && !decide.isPending;

  function submit() {
    if (!data) return;
    void decide
      .mutateAsync({
        id: data.refund.id,
        input: {
          decision,
          reason,
          providerReference: reference.trim() || null,
        },
      })
      .then(() => {
        setReason("");
        setReference("");
      })
      .catch(() => undefined);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <RotateCcw size={16} aria-hidden className="text-muted-foreground" />
            <span>{data?.refund.refundNumber ?? "Refund"}</span>
            {data ? (
              <Badge
                className={cn(
                  "whitespace-nowrap",
                  PAYMENT_STATUS_BADGE[data.refund.status] ?? NEUTRAL_BADGE,
                )}
              >
                {humanizeEnum(data.refund.status)}
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {data
              ? `Requested ${formatAdminDateTime(data.refund.createdAt)}${
                  data.refund.createdByName ? ` by ${data.refund.createdByName}` : ""
                }`
              : "Loading the refund…"}
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
            This refund could not be loaded.
          </div>
        ) : (
          <div className="space-y-5">
            <section className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <Field
                label="Requested amount"
                value={formatAdminMoney(data.refund.amount, data.refund.currency)}
              />
              <Field
                label="Captured on the order"
                value={formatAdminMoney(data.captured, data.order.currency)}
              />
              <Field
                label="Still refundable"
                value={formatAdminMoney(data.remaining, data.order.currency)}
              />
              <Field label="Customer" value={`${data.customer.name} · ${data.customer.email}`} />
            </section>

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
              {data.transaction ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Against {data.transaction.provider} ·{" "}
                  {data.transaction.providerTransactionId ?? `transaction #${data.transaction.id}`}
                </p>
              ) : null}
            </section>

            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Reason on the request
              </h3>
              <p className="whitespace-pre-line text-sm">{data.refund.reason ?? "No reason given."}</p>
            </section>

            {data.refund.providerReference ? (
              <section className="rounded-xl bg-muted/50 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Provider reference
                </p>
                <p className="break-words text-sm">{data.refund.providerReference}</p>
              </section>
            ) : null}

            {terminal ? (
              <p className="text-sm text-muted-foreground">
                This refund has been decided and cannot be changed.
              </p>
            ) : (
              <section className="space-y-3 rounded-xl border border-[var(--divider)] p-3">
                <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  <BadgeIndianRupee size={14} aria-hidden /> Decision
                </h3>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={decision === "APPROVE" ? "default" : "secondary"}
                    onClick={() => setDecision("APPROVE")}
                  >
                    Approve and return
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={decision === "REJECT" ? "default" : "secondary"}
                    onClick={() => setDecision("REJECT")}
                  >
                    Decline
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {decision === "APPROVE"
                    ? "The money is returned through the payment provider and the customer is told."
                    : "No money moves. The customer is told the request was declined."}
                </p>
                <Textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Why? This is written to the audit log and the order timeline."
                  rows={3}
                  maxLength={300}
                />
                {decision === "APPROVE" ? (
                  <Input
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    placeholder="Offline reference (optional — only if the provider returns none)"
                    maxLength={100}
                  />
                ) : null}
                <div className="flex justify-end">
                  <Button type="button" size="sm" disabled={!canSubmit} onClick={submit}>
                    {decide.isPending ? (
                      <Loader2 size={14} aria-hidden className="animate-spin" />
                    ) : null}
                    {decision === "APPROVE" ? "Approve and return" : "Decline refund"}
                  </Button>
                </div>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm">{value}</dd>
    </div>
  );
}
