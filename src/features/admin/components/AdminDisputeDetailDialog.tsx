import { useState } from "react";
import { Loader2, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { PAISE_PER_RUPEE } from "@/lib/pricing";
import { cn } from "@/lib/utils/cn";
import { useAdminDisputeDecision, useAdminDisputeDetail } from "../query";
import { formatAdminDateTime, formatAdminMoney, humanizeEnum } from "./format";
import {
  MODERATION_STATUS_BADGE,
  NEUTRAL_BADGE,
  ORDER_STATUS_BADGE,
  PAYMENT_STATUS_BADGE,
} from "./status-badge";

/**
 * One dispute, its evidence, and the decision form.
 *
 * ## Why both parties are always shown
 *
 * A decision is only fair if it was made knowing who is on each side — an operator who
 * sees an accusation without seeing who made it is deciding on half the record. The
 * dialog therefore names the opener and the party they named, with the order beneath,
 * before it offers a single button.
 *
 * ## Why a refund is a checkbox, not a second flow
 *
 * A resolution sometimes includes money back. Modelling that inline keeps the decision —
 * the resolution *and* the refund that goes with it — one recorded action, with one
 * audit line, rather than a decision here and a refund somewhere else that can drift
 * out of step. The refund is still only a *request*: it lands in the finance queue.
 */
export function AdminDisputeDetailDialog({
  disputeId,
  open,
  onOpenChange,
}: {
  disputeId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const detail = useAdminDisputeDetail(open ? disputeId : null);
  const decide = useAdminDisputeDecision();

  const [decision, setDecision] = useState<"UNDER_REVIEW" | "RESOLVED" | "DISMISSED">("RESOLVED");
  const [resolution, setResolution] = useState("");
  const [withRefund, setWithRefund] = useState(false);
  const [refundRupees, setRefundRupees] = useState("");
  const [refundReason, setRefundReason] = useState("");

  const data = detail.data;
  const terminal = data?.dispute.status === "RESOLVED" || data?.dispute.status === "DISMISSED";
  const needsResolution = decision !== "UNDER_REVIEW";
  const refundAmount = Math.round(Number(refundRupees || 0) * PAISE_PER_RUPEE);
  const canSubmit =
    (!needsResolution || resolution.trim().length >= 3) &&
    (!withRefund || (refundAmount > 0 && refundReason.trim().length >= 3)) &&
    !decide.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <Scale size={16} aria-hidden className="text-muted-foreground" />
            <span>{data?.dispute.disputeNumber ?? "Dispute"}</span>
            {data ? (
              <Badge
                className={cn(
                  "whitespace-nowrap",
                  MODERATION_STATUS_BADGE[data.dispute.status] ?? NEUTRAL_BADGE,
                )}
              >
                {humanizeEnum(data.dispute.status)}
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {data
              ? `Opened ${formatAdminDateTime(data.dispute.createdAt)}${
                  data.dispute.resolvedAt
                    ? ` · decided ${formatAdminDateTime(data.dispute.resolvedAt)}`
                    : ""
                }`
              : "Loading the dispute…"}
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
            This dispute could not be loaded.
          </div>
        ) : (
          <div className="space-y-5">
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

            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Parties
              </h3>
              <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                <Field label="Opened by" value={`${data.opener.name} · ${data.opener.email}`} />
                <Field
                  label="Against"
                  value={data.against ? `${data.against.name} · ${data.against.email}` : "Not attributed"}
                />
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                The complaint
              </h3>
              <p className="text-sm font-medium">{data.dispute.reason}</p>
              {data.dispute.description ? (
                <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                  {data.dispute.description}
                </p>
              ) : null}
            </section>

            {data.dispute.resolution ? (
              <section className="rounded-xl bg-muted/50 p-3">
                <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Recorded resolution
                </h3>
                <p className="whitespace-pre-line text-sm">{data.dispute.resolution}</p>
              </section>
            ) : null}

            {terminal ? (
              <p className="text-sm text-muted-foreground">
                This dispute has been decided. Both parties were notified.
              </p>
            ) : (
              <section className="space-y-3 rounded-xl border border-[var(--divider)] p-3">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Decision
                </h3>
                <NativeSelect
                  label="Decision"
                  value={decision}
                  onChange={(event) =>
                    setDecision(event.target.value as "UNDER_REVIEW" | "RESOLVED" | "DISMISSED")
                  }
                  options={[
                    { value: "UNDER_REVIEW", label: "Mark as under review" },
                    { value: "RESOLVED", label: "Resolve in favour of a remedy" },
                    { value: "DISMISSED", label: "Dismiss" },
                  ]}
                />
                <Textarea
                  value={resolution}
                  onChange={(event) => setResolution(event.target.value)}
                  placeholder={
                    needsResolution
                      ? "The written resolution. Both parties are told this."
                      : "An optional note while you review."
                  }
                  rows={3}
                  maxLength={2000}
                />

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-primary)]"
                    checked={withRefund}
                    onChange={(event) => setWithRefund(event.target.checked)}
                  />
                  Include a refund request
                </label>

                {withRefund ? (
                  <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
                    <Input
                      type="number"
                      min={1}
                      step="0.01"
                      inputMode="decimal"
                      aria-label="Refund amount in rupees"
                      placeholder="Amount ₹"
                      value={refundRupees}
                      onChange={(event) => setRefundRupees(event.target.value)}
                    />
                    <Input
                      aria-label="Refund reason"
                      placeholder="Why is money going back?"
                      value={refundReason}
                      onChange={(event) => setRefundReason(event.target.value)}
                    />
                  </div>
                ) : null}

                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    disabled={!canSubmit}
                    onClick={() =>
                      void decide
                        .mutateAsync({
                          id: data.dispute.id,
                          input: {
                            status: decision,
                            resolution,
                            refund: withRefund
                              ? { amount: refundAmount, reason: refundReason }
                              : null,
                          },
                        })
                        .then(() => {
                          setResolution("");
                          setWithRefund(false);
                          setRefundRupees("");
                          setRefundReason("");
                        })
                        .catch(() => undefined)
                    }
                  >
                    {decide.isPending ? (
                      <Loader2 size={14} aria-hidden className="animate-spin" />
                    ) : null}
                    Record decision
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
