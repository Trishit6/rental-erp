import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock, Loader2, PackageCheck, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useAdminRentalActions, useAdminRentalDetail } from "../query";
import { formatAdminDate, formatAdminDateTime, formatAdminMoney, humanizeEnum } from "./format";
import { NEUTRAL_BADGE, RENTAL_STATUS_BADGE } from "./status-badge";

/**
 * One rental, and the actions an operator may take on it.
 *
 * ## Why "force status" is a row of buttons and not a dropdown
 *
 * A rental has at most four or five reachable states, and the legal set is computed
 * server-side (`nextStatuses`). Buttons make the legal moves visible at a glance and
 * make an illegal one impossible to click, which a free-text status field cannot.
 *
 * ## Why deposit settlement lives here
 *
 * Releasing or deducting the security deposit is what marks a returned rental
 * `COMPLETED` on the server, so there is no separate "complete" button that could
 * orphan a held deposit. The form asks for the deduction and a reason; the release is
 * the remainder, computed and shown before the operator commits.
 */
export function AdminRentalDetailDialog({
  rentalId,
  open,
  onOpenChange,
}: {
  rentalId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const detail = useAdminRentalDetail(open ? rentalId : null);
  const actions = useAdminRentalActions();

  const [deductionRupees, setDeductionRupees] = useState("");
  const [depositReason, setDepositReason] = useState("");
  const [extensionReason, setExtensionReason] = useState("");
  const [extensionDays, setExtensionDays] = useState("");

  const data = detail.data;
  const rental = data?.rental;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span>{data?.product.title ?? "Rental"}</span>
            {rental ? (
              <Badge className={cn("whitespace-nowrap", RENTAL_STATUS_BADGE[rental.status] ?? NEUTRAL_BADGE)}>
                {humanizeEnum(rental.status)}
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {rental
              ? `${formatAdminDate(rental.startDate)} → ${formatAdminDate(rental.endDate)}`
              : "Loading the rental's full record…"}
          </DialogDescription>
        </DialogHeader>

        {detail.isLoading && !data ? (
          <div className="space-y-2 py-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        ) : detail.isError || !data || !rental ? (
          <div className="py-4 text-sm text-destructive" role="alert">
            This rental could not be loaded.
          </div>
        ) : (
          <div className="space-y-5">
            <section className="rounded-xl border border-[var(--divider)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                {data.nextStatuses.map((status) => (
                  <Button
                    key={status}
                    type="button"
                    size="sm"
                    disabled={actions.isPending}
                    onClick={() => void actions.forceStatus({ id: rental.id, status })}
                  >
                    {humanizeEnum(status)}
                  </Button>
                ))}
                {data.nextStatuses.length === 0 ? (
                  <span className="text-xs text-muted-foreground">No further steps.</span>
                ) : null}
                {["ACTIVE", "RETURN_PENDING", "OVERDUE"].includes(rental.status) ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="ml-auto"
                    disabled={actions.isPending}
                    onClick={() => void actions.confirmReturn(rental.id)}
                  >
                    <PackageCheck size={14} aria-hidden /> Confirm return
                  </Button>
                ) : null}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Parties &amp; order
              </h3>
              <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                <Field label="Renter" value={`${data.renter.name} · ${data.renter.email}`} />
                <Field label="Owner" value={`${data.owner.name} · ${data.owner.email}`} />
                <Field
                  label="Order"
                  value={data.order.orderNumber ?? `#${data.order.id}`}
                />
                <Field label="Rate" value={`${formatAdminMoney(rental.dailyRate, rental.currency)} / day`} />
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Deposit
              </h3>
              <p className="text-sm">
                Held {formatAdminMoney(rental.securityDeposit, rental.currency)}
                {data.deposit.settled
                  ? ` · settled, released ${formatAdminMoney(data.deposit.released ?? 0, rental.currency)}`
                  : ""}
              </p>

              {!data.deposit.settled && rental.securityDeposit > 0 ? (
                <div className="mt-3 space-y-2">
                  <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      aria-label="Deduction in rupees"
                      placeholder="Deduct ₹"
                      value={deductionRupees}
                      onChange={(event) => setDeductionRupees(event.target.value)}
                    />
                    <Input
                      aria-label="Deposit settlement reason"
                      placeholder="Reason (why is any amount withheld?)"
                      value={depositReason}
                      onChange={(event) => setDepositReason(event.target.value)}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Released on settlement:{" "}
                    {formatAdminMoney(
                      Math.max(
                        0,
                        rental.securityDeposit -
                          Math.round(Number(deductionRupees || 0) * PAISE_PER_RUPEE),
                      ),
                      rental.currency,
                    )}
                  </p>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      disabled={depositReason.trim().length < 3 || actions.isPending}
                      onClick={() =>
                        void actions
                          .settleDeposit({
                            id: rental.id,
                            input: {
                              deduction: Math.round(Number(deductionRupees || 0) * PAISE_PER_RUPEE),
                              reason: depositReason,
                            },
                          })
                          .then(() => {
                            setDeductionRupees("");
                            setDepositReason("");
                          })
                          .catch(() => undefined)
                      }
                    >
                      {actions.isPending ? (
                        <Loader2 size={14} aria-hidden className="animate-spin" />
                      ) : null}{" "}
                      <Undo2 size={14} aria-hidden /> Settle deposit
                    </Button>
                  </div>
                </div>
              ) : null}

              {!data.deposit.settled && rental.securityDeposit === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  This rental carries no security deposit.
                </p>
              ) : null}
            </section>

            {rental.extensionRequestedAt ? (
              <section className="rounded-xl border border-info/30 bg-info/5 p-3">
                <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  <CalendarClock size={14} aria-hidden /> Extension requested
                </h3>
                <p className="text-sm">
                  The renter asked for{" "}
                  <strong>{rental.extensionRequestedDays ?? 0} more day(s)</strong> on{" "}
                  {formatAdminDateTime(rental.extensionRequestedAt)}.
                </p>
                <div className="mt-3 space-y-2">
                  <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      inputMode="numeric"
                      aria-label="Approved days"
                      placeholder="Days"
                      value={extensionDays}
                      onChange={(event) => setExtensionDays(event.target.value)}
                    />
                    <Input
                      aria-label="Extension decision reason"
                      placeholder="Reason for the decision"
                      value={extensionReason}
                      onChange={(event) => setExtensionReason(event.target.value)}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={extensionReason.trim().length < 3 || actions.isPending}
                      onClick={() =>
                        void actions
                          .decideExtension({
                            id: rental.id,
                            input: { decision: "REJECT", reason: extensionReason },
                          })
                          .then(() => setExtensionReason(""))
                          .catch(() => undefined)
                      }
                    >
                      Decline
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={extensionReason.trim().length < 3 || actions.isPending}
                      onClick={() =>
                        void actions
                          .decideExtension({
                            id: rental.id,
                            input: {
                              decision: "APPROVE",
                              days: extensionDays ? Number(extensionDays) : undefined,
                              reason: extensionReason,
                            },
                          })
                          .then(() => {
                            setExtensionReason("");
                            setExtensionDays("");
                          })
                          .catch(() => undefined)
                      }
                    >
                      Approve
                    </Button>
                  </div>
                </div>
              </section>
            ) : null}

            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Timeline
              </h3>
              <ol className="space-y-2.5 border-l border-[var(--divider)] pl-4">
                {data.timeline.map((step) => (
                  <li key={step.key} className="relative">
                    <span
                      className={cn(
                        "absolute -left-[21px] top-1.5 size-2 rounded-full",
                        step.state === "done" || step.state === "current"
                          ? "bg-primary"
                          : "bg-muted-foreground/40",
                      )}
                    />
                    <p className="text-sm font-medium">{step.label}</p>
                    {step.description ? (
                      <p className="text-xs text-muted-foreground">{step.description}</p>
                    ) : null}
                    <p className="text-[11px] text-muted-foreground">
                      {step.at ? formatAdminDateTime(step.at) : "Not yet recorded"}
                    </p>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-xs text-muted-foreground">
                Manage this rental on the{" "}
                <Link to="/admin/rentals" className="underline">
                  rentals
                </Link>{" "}
                screen, or the order on the{" "}
                <Link to="/admin/orders" className="underline">
                  orders
                </Link>{" "}
                screen.
              </p>
            </section>
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
