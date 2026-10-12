import { useState } from "react";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, StickyNote, Undo2, Wand2 } from "lucide-react";
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
import {
  useAdminOrderActions,
  useAdminOrderDetail,
  useAdminOrderStatusMutation,
} from "../query";
import type { AdminOrderDetail } from "../api";
import { AdminConfirmDialog } from "./AdminConfirmDialog";
import { formatAdminDateTime, formatAdminMoney, humanizeEnum } from "./format";
import {
  NEUTRAL_BADGE,
  ORDER_STATUS_BADGE,
  PAYMENT_STATUS_BADGE,
  RENTAL_STATUS_BADGE,
} from "./status-badge";

const ALL_ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "CONFIRMED",
  "PROCESSING",
  "READY_FOR_PICKUP",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
];

/**
 * One order, and the actions an operator may take on it.
 *
 * ## Why the buttons are derived from the record
 *
 * `nextStatuses` and `canCancel` arrive from the server computed from the *same*
 * state machine the handlers enforce. Rendering the buttons from those fields rather
 * than from a client-side copy of the ladder means the UI cannot offer a move the
 * API would refuse, and a server-side change to the machine reaches the buttons
 * without a second edit here.
 *
 * ## Why override and cancel are visually separate
 *
 * Everything in the "advance" row is a normal move. Cancellation has money and stock
 * consequences, and an override can put the order into any state at all — so both
 * demand a reason before the button enables, and both are visually set apart from the
 * one-click advances. The distinction the state machine draws on the server is the
 * same one the UI draws here.
 */
export function AdminOrderDetailDialog({
  orderId,
  open,
  onOpenChange,
}: {
  orderId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const detail = useAdminOrderDetail(open ? orderId : null);
  const setStatus = useAdminOrderStatusMutation();
  const actions = useAdminOrderActions();

  const [note, setNote] = useState("");
  const [refundRupees, setRefundRupees] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [overrideStatus, setOverrideStatus] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);

  const order = detail.data;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <span>{order?.order.orderNumber ?? (orderId ? `Order #${orderId}` : "Order")}</span>
              {order ? (
                <>
                  <Badge
                    className={cn(
                      "whitespace-nowrap",
                      ORDER_STATUS_BADGE[order.order.status] ?? NEUTRAL_BADGE,
                    )}
                  >
                    {humanizeEnum(order.order.status)}
                  </Badge>
                  <Badge
                    className={cn(
                      "whitespace-nowrap",
                      PAYMENT_STATUS_BADGE[order.order.paymentStatus] ?? NEUTRAL_BADGE,
                    )}
                  >
                    {humanizeEnum(order.order.paymentStatus)}
                  </Badge>
                </>
              ) : null}
            </DialogTitle>
            <DialogDescription>
              {order
                ? `${humanizeEnum(order.order.orderType)} · placed ${formatAdminDateTime(order.order.createdAt)}`
                : "Loading the order's full record…"}
            </DialogDescription>
          </DialogHeader>

          {detail.isLoading && !order ? (
            <div className="space-y-2 py-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-14 w-full" />
              ))}
            </div>
          ) : detail.isError || !order ? (
            <div className="py-4 text-sm text-destructive" role="alert">
              This order could not be loaded.
            </div>
          ) : (
            <div className="space-y-5">
              <ActionsPanel
                order={order}
                isBusy={setStatus.isPending || actions.isPending}
                onAdvance={(status) => setStatus.mutate({ id: order.order.id, status })}
                onCancel={() => setCancelOpen(true)}
                note={note}
                onNoteChange={setNote}
                onSaveNote={() => {
                  void actions
                    .addNote({ id: order.order.id, note })
                    .then(() => setNote(""))
                    .catch(() => undefined);
                }}
                refundRupees={refundRupees}
                onRefundRupeesChange={setRefundRupees}
                refundReason={refundReason}
                onRefundReasonChange={setRefundReason}
                onRequestRefund={() => {
                  void actions
                    .requestRefund({
                      id: order.order.id,
                      input: {
                        amount: Math.round(Number(refundRupees || 0) * PAISE_PER_RUPEE),
                        reason: refundReason,
                      },
                    })
                    .then(() => {
                      setRefundRupees("");
                      setRefundReason("");
                    })
                    .catch(() => undefined);
                }}
                overrideStatus={overrideStatus}
                onOverrideStatusChange={setOverrideStatus}
                overrideReason={overrideReason}
                onOverrideReasonChange={setOverrideReason}
                onOverride={() =>
                  void actions
                    .override({
                      id: order.order.id,
                      status: overrideStatus,
                      reason: overrideReason,
                    })
                    .then(() => {
                      setOverrideStatus("");
                      setOverrideReason("");
                    })
                    .catch(() => undefined)
                }
              />

              <Section title="Summary">
                <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  <Field label="Customer" value={`${order.customer.name} · ${order.customer.email}`} />
                  {order.customer.phone ? (
                    <Field label="Phone" value={order.customer.phone} />
                  ) : null}
                  <Field label="Delivery" value={humanizeEnum(order.order.deliveryMethod)} />
                  <Field label="Tracking" value={order.order.trackingNumber ?? "—"} />
                  <Field
                    label="Payment provider"
                    value={`${order.order.paymentProvider}${
                      order.order.paymentReference ? ` · ${order.order.paymentReference}` : ""
                    }`}
                  />
                  <Field label="Updated" value={formatAdminDateTime(order.order.updatedAt)} />
                </div>
                {order.order.deliveryAddress ? (
                  <p className="mt-3 whitespace-pre-line rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
                    {order.order.deliveryAddress}
                  </p>
                ) : null}
              </Section>

              <Section title="Amounts">
                <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                  <Money label="Subtotal" value={order.order.subtotal} currency={order.order.currency} />
                  <Money label="Delivery" value={order.order.deliveryFee} currency={order.order.currency} />
                  <Money label="Deposits" value={order.order.depositTotal} currency={order.order.currency} />
                  <Money label="Discount" value={-order.order.discount} currency={order.order.currency} />
                  <Money label="Tax" value={order.order.tax} currency={order.order.currency} />
                  <Money
                    label="Total"
                    value={order.order.total}
                    currency={order.order.currency}
                    strong
                  />
                </dl>
              </Section>

              <Section title="Seller split">
                <ul className="divide-y divide-[var(--divider)]">
                  {order.sellerSplit.map((seller) => (
                    <li key={seller.sellerId} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{seller.sellerName}</p>
                        <p className="text-xs text-muted-foreground">
                          {seller.lines} line(s) · goods{" "}
                          {formatAdminMoney(seller.goods, order.order.currency)} · deposit{" "}
                          {formatAdminMoney(seller.deposit, order.order.currency)}
                        </p>
                      </div>
                      <span className="shrink-0 tabular-nums text-sm font-semibold">
                        {formatAdminMoney(seller.total, order.order.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>

              <Section title={`Items (${order.items.length})`}>
                <ul className="divide-y divide-[var(--divider)]">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.titleSnapshot}</p>
                        <p className="text-xs text-muted-foreground">
                          {humanizeEnum(item.mode)} · qty {item.quantity} · {item.sellerName}
                          {item.mode !== "BUY" && item.startDate && item.endDate
                            ? ` · ${new Date(item.startDate).toLocaleDateString("en-IN")} → ${new Date(
                                item.endDate,
                              ).toLocaleDateString("en-IN")}`
                            : ""}
                        </p>
                        {item.cancellationReason ? (
                          <p className="mt-0.5 text-xs text-destructive">{item.cancellationReason}</p>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="tabular-nums text-sm font-semibold">
                          {formatAdminMoney(item.lineTotal, order.order.currency)}
                        </p>
                        {item.fulfillmentStatus ? (
                          <Badge className="mt-1 bg-muted text-muted-foreground">
                            {humanizeEnum(item.fulfillmentStatus)}
                          </Badge>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </Section>

              {order.rentals.length > 0 ? (
                <Section title={`Rentals (${order.rentals.length})`}>
                  <ul className="divide-y divide-[var(--divider)]">
                    {order.rentals.map((rental) => (
                      <li key={rental.id} className="flex items-start justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{rental.itemTitle}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(rental.startDate).toLocaleDateString("en-IN")} →{" "}
                            {new Date(rental.endDate).toLocaleDateString("en-IN")}
                            {rental.actualReturnDate
                              ? ` · returned ${new Date(rental.actualReturnDate).toLocaleDateString("en-IN")}`
                              : ""}
                          </p>
                        </div>
                        <Badge className={cn("shrink-0", RENTAL_STATUS_BADGE[rental.status] ?? NEUTRAL_BADGE)}>
                          {humanizeEnum(rental.status)}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : null}

              <Section title={`Transactions (${order.transactions.length})`}>
                {order.transactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No transactions recorded.</p>
                ) : (
                  <ul className="divide-y divide-[var(--divider)]">
                    {order.transactions.map((txn) => (
                      <li key={txn.id} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{humanizeEnum(txn.type)}</p>
                          <p className="text-xs text-muted-foreground">
                            {txn.provider}
                            {txn.providerTransactionId ? ` · ${txn.providerTransactionId}` : ""} ·{" "}
                            {formatAdminDateTime(txn.createdAt)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="tabular-nums text-sm font-semibold">
                            {formatAdminMoney(txn.amount, txn.currency)}
                          </p>
                          <Badge className={cn("mt-1", PAYMENT_STATUS_BADGE[txn.status] ?? NEUTRAL_BADGE)}>
                            {humanizeEnum(txn.status)}
                          </Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title={`Refunds (${order.refunds.length})`}>
                {order.refunds.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No refunds requested.</p>
                ) : (
                  <ul className="divide-y divide-[var(--divider)]">
                    {order.refunds.map((refund) => (
                      <li key={refund.id} className="flex items-start justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{refund.refundNumber}</p>
                          <p className="text-xs text-muted-foreground">{refund.reason ?? "No reason given."}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="tabular-nums text-sm font-semibold">
                            {formatAdminMoney(refund.amount, order.order.currency)}
                          </p>
                          <Badge className={cn("mt-1", PAYMENT_STATUS_BADGE[refund.status] ?? NEUTRAL_BADGE)}>
                            {humanizeEnum(refund.status)}
                          </Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {order.disputes.length > 0 ? (
                <Section title={`Disputes (${order.disputes.length})`}>
                  <ul className="divide-y divide-[var(--divider)]">
                    {order.disputes.map((dispute) => (
                      <li key={dispute.id} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{dispute.disputeNumber}</p>
                          <p className="truncate text-xs text-muted-foreground">{dispute.reason}</p>
                        </div>
                        <Badge className="shrink-0 bg-muted text-muted-foreground">
                          {humanizeEnum(dispute.status)}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Open the{" "}
                    <Link to="/admin/disputes" className="underline">
                      dispute queue
                    </Link>{" "}
                    to read the full evidence and decide.
                  </p>
                </Section>
              ) : null}

              <Section title="Timeline">
                {order.timeline.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No events recorded yet.</p>
                ) : (
                  <ol className="space-y-3 border-l border-[var(--divider)] pl-4">
                    {order.timeline.map((event) => (
                      <li key={event.id} className="relative">
                        <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-primary" />
                        <p className="text-sm font-medium">
                          {humanizeEnum(event.type)}
                          {event.fromStatus && event.fromStatus !== event.toStatus ? (
                            <span className="text-muted-foreground">
                              {" "}
                              · {humanizeEnum(event.fromStatus)} → {humanizeEnum(event.toStatus)}
                            </span>
                          ) : null}
                        </p>
                        {event.note ? (
                          <p className="text-xs text-muted-foreground">{event.note}</p>
                        ) : null}
                        <p className="text-[11px] text-muted-foreground">
                          {event.actorRole ? `${humanizeEnum(event.actorRole)} · ` : ""}
                          {formatAdminDateTime(event.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </Section>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {order ? (
        <AdminConfirmDialog
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          subject={`Order ${order.order.orderNumber ?? order.order.id}`}
          title="Cancel this order?"
          body="The order is marked cancelled and the customer is told why. Money already captured is refunded through a separate refund request."
          confirmLabel="Cancel order"
          tone="destructive"
          requireReason
          isSubmitting={actions.isPending}
          onConfirm={(reason) => {
            void actions
              .cancel({ id: order.order.id, reason })
              .then(() => setCancelOpen(false))
              .catch(() => undefined);
          }}
        />
      ) : null}
    </>
  );
}

function ActionsPanel({
  order,
  isBusy,
  onAdvance,
  onCancel,
  note,
  onNoteChange,
  onSaveNote,
  refundRupees,
  onRefundRupeesChange,
  refundReason,
  onRefundReasonChange,
  onRequestRefund,
  overrideStatus,
  onOverrideStatusChange,
  overrideReason,
  onOverrideReasonChange,
  onOverride,
}: {
  order: AdminOrderDetail;
  isBusy: boolean;
  onAdvance: (status: string) => void;
  onCancel: () => void;
  note: string;
  onNoteChange: (value: string) => void;
  onSaveNote: () => void;
  refundRupees: string;
  onRefundRupeesChange: (value: string) => void;
  refundReason: string;
  onRefundReasonChange: (value: string) => void;
  onRequestRefund: () => void;
  overrideStatus: string;
  onOverrideStatusChange: (value: string) => void;
  overrideReason: string;
  onOverrideReasonChange: (value: string) => void;
  onOverride: () => void;
}) {
  const [panel, setPanel] = useState<"none" | "note" | "refund" | "override">("none");

  return (
    <section className="rounded-xl border border-[var(--divider)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        {order.nextStatuses.length > 0 ? (
          order.nextStatuses.map((status) => (
            <Button
              key={status}
              type="button"
              size="sm"
              disabled={isBusy}
              onClick={() => onAdvance(status)}
            >
              {humanizeEnum(status)}
            </Button>
          ))
        ) : (
          <span className="text-xs text-muted-foreground">No further steps — the order is closed.</span>
        )}

        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setPanel(panel === "note" ? "none" : "note")}
          >
            <StickyNote size={14} aria-hidden /> Note
          </Button>
          {order.order.paymentStatus === "PAID" ||
          order.order.paymentStatus === "PARTIALLY_REFUNDED" ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setPanel(panel === "refund" ? "none" : "refund")}
            >
              <Undo2 size={14} aria-hidden /> Refund
            </Button>
          ) : null}
          {order.canCancel ? (
            <Button type="button" size="sm" variant="destructive" onClick={onCancel}>
              Cancel order
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setPanel(panel === "override" ? "none" : "override")}
          >
            <Wand2 size={14} aria-hidden /> Override
          </Button>
        </div>
      </div>

      {panel === "note" ? (
        <div className="mt-3 space-y-2">
          <Textarea
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="An internal note. Only staff can see it."
            rows={2}
            maxLength={300}
          />
          <div className="flex justify-end">
            <Button type="button" size="sm" disabled={note.trim() === "" || isBusy} onClick={onSaveNote}>
              {isBusy ? <Loader2 size={14} aria-hidden className="animate-spin" /> : null} Save note
            </Button>
          </div>
        </div>
      ) : null}

      {panel === "refund" ? (
        <div className="mt-3 space-y-2">
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
            <Input
              type="number"
              min={1}
              step="0.01"
              inputMode="decimal"
              aria-label="Refund amount in rupees"
              placeholder="Amount ₹"
              value={refundRupees}
              onChange={(event) => onRefundRupeesChange(event.target.value)}
            />
            <Input
              aria-label="Refund reason"
              placeholder="Why is this being refunded?"
              value={refundReason}
              onChange={(event) => onRefundReasonChange(event.target.value)}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            A refund is a request: it is reviewed and executed by the payment architecture. A request
            can never exceed what was captured.
          </p>
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              disabled={Number(refundRupees) <= 0 || refundReason.trim() === "" || isBusy}
              onClick={onRequestRefund}
            >
              {isBusy ? <Loader2 size={14} aria-hidden className="animate-spin" /> : null} Request refund
            </Button>
          </div>
        </div>
      ) : null}

      {panel === "override" ? (
        <div className="mt-3 space-y-2">
          <div className="grid gap-2 sm:grid-cols-[12rem_1fr]">
            <NativeSelect
              label="Override status"
              value={overrideStatus}
              onChange={(event) => onOverrideStatusChange(event.target.value)}
              options={[
                { value: "", label: "Set status…" },
                ...ALL_ORDER_STATUSES.map((status) => ({
                  value: status,
                  label: humanizeEnum(status),
                })),
              ]}
            />
            <Input
              aria-label="Override reason"
              placeholder="Reason (recorded on the order timeline and in the audit log)"
              value={overrideReason}
              onChange={(event) => onOverrideReasonChange(event.target.value)}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            An override may place the order in any state. It is always recorded with its reason.
          </p>
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={
                overrideStatus === "" ||
                overrideStatus === order.order.status ||
                overrideReason.trim().length < 3 ||
                isBusy
              }
              onClick={onOverride}
            >
              {isBusy ? <Loader2 size={14} aria-hidden className="animate-spin" /> : null} Force status
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
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

function Money({
  label,
  value,
  currency,
  strong,
}: {
  label: string;
  value: number;
  currency: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className={cn("text-muted-foreground", strong && "font-semibold text-foreground")}>
        {label}
      </dt>
      <dd className={cn("tabular-nums", strong && "font-semibold")}>
        {formatAdminMoney(value, currency)}
      </dd>
    </div>
  );
}
