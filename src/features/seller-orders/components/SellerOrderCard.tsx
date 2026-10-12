import { useState } from "react";
import { format } from "date-fns";
import { ChevronDown, MapPin, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProductImage } from "@/components/shared/product-image";
import { formatInr } from "@/lib/pricing";
import { cn } from "@/lib/utils/cn";
import { useSellerOrder } from "../query";
import {
  SELLER_NEXT_STATES,
  fulfillmentLabel,
  paymentStatusLabel,
  type SellerOrderSummary,
} from "../types";
import { FulfillmentBadge } from "./FulfillmentBadge";

/**
 * One order, as the seller sees it.
 *
 * The card shows the summary immediately and fetches the detail **only when
 * expanded**, so a page of twenty orders costs one request rather than twenty.
 * Every action offered comes from the server's own `actions` block (or, on a
 * collapsed row, the same transition table the server validates against), so the
 * buttons and the API can never disagree about what is legal.
 */
export function SellerOrderCard({
  order,
  selected,
  expanded,
  busy,
  onToggleSelected,
  onToggleExpanded,
  onFulfill,
  onCancel,
}: {
  order: SellerOrderSummary;
  selected: boolean;
  expanded: boolean;
  busy: boolean;
  onToggleSelected: (id: number) => void;
  onToggleExpanded: (id: number) => void;
  onFulfill: (reference: string, status: string) => void;
  onCancel: (reference: string, reason: string) => void;
}) {
  const reference = order.orderNumber ?? String(order.id);
  const detail = useSellerOrder(expanded ? reference : null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");

  // A row can join a bulk action only if it has a step left to take.
  const selectable = (SELLER_NEXT_STATES[order.fulfillmentStatus]?.length ?? 0) > 0;

  return (
    <Card className={cn("overflow-hidden p-0", selected && "ring-2 ring-primary/40")}>
      <div className="flex flex-wrap items-start gap-4 p-5">
        <label className="mt-1 flex items-center">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-primary)]"
            checked={selected}
            disabled={!selectable}
            onChange={() => onToggleSelected(order.id)}
            aria-label={`Select order ${reference} for a bulk action`}
          />
        </label>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-heading text-sm font-extrabold">Order {reference}</span>
            <FulfillmentBadge status={order.fulfillmentStatus} />
            <span className="text-[11px] text-muted-foreground">
              Payment {paymentStatusLabel(order.paymentStatus)}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {format(new Date(order.createdAt), "d MMM yyyy")}
            {order.customerName ? ` · ${order.customerName}` : ""} · {order.unitCount} unit
            {order.unitCount === 1 ? "" : "s"}
            {order.deliveryMethod === "DELIVERY" ? " · Delivery" : " · Pickup"}
          </p>
        </div>

        <div className="text-right">
          <p className="font-heading text-lg font-black">{formatInr(order.sellerSubtotal)}</p>
          <p className="text-[11px] text-muted-foreground">your items</p>
        </div>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-expanded={expanded}
          onClick={() => onToggleExpanded(order.id)}
        >
          {expanded ? "Hide" : "Details"}
          <ChevronDown
            size={14}
            aria-hidden
            className={cn("transition-transform", expanded && "rotate-180")}
          />
        </Button>
      </div>

      {expanded && (
        <div className="border-t border-border/60 bg-[var(--inset-bg)] p-5">
          {detail.isLoading ? (
            <div className="h-24 animate-pulse rounded-2xl bg-foreground/5" />
          ) : detail.isError ? (
            <p className="text-sm text-destructive">
              {detail.error instanceof Error ? detail.error.message : "Could not load this order."}
            </p>
          ) : detail.data ? (
            <div className="space-y-5">
              <ul className="space-y-3">
                {detail.data.items.map((line) => (
                  <li key={line.id} className="flex items-center gap-3">
                    <ProductImage
                      src={line.imageUrl}
                      alt={line.title}
                      className="size-12 shrink-0 rounded-xl"
                      label="No photo"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{line.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {line.mode === "RENT" ? "Rental" : "Purchase"} · Qty {line.quantity} ·{" "}
                        {formatInr(line.lineTotal)}
                      </p>
                    </div>
                    <FulfillmentBadge status={line.fulfillmentStatus} />
                  </li>
                ))}
              </ul>

              {detail.data.delivery.method === "DELIVERY" && detail.data.delivery.address && (
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <MapPin size={14} aria-hidden className="mt-0.5 shrink-0 text-primary" />
                  <address className="not-italic">
                    {[
                      detail.data.delivery.address.name,
                      detail.data.delivery.address.line1,
                      detail.data.delivery.address.line2,
                      detail.data.delivery.address.city,
                      detail.data.delivery.address.state,
                      detail.data.delivery.address.postalCode,
                      detail.data.delivery.address.country,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </address>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {detail.data.actions.next.map((status) => (
                  <Button
                    key={status}
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() => onFulfill(reference, status)}
                  >
                    Mark {fulfillmentLabel(status).toLowerCase()}
                  </Button>
                ))}

                {detail.data.actions.canCancel &&
                  (cancelling ? (
                    <form
                      className="flex w-full flex-wrap items-center gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (reason.trim().length < 3) return;
                        onCancel(reference, reason.trim());
                        setCancelling(false);
                        setReason("");
                      }}
                    >
                      <input
                        autoFocus
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Reason (at least 3 characters)"
                        maxLength={300}
                        className="h-9 min-w-0 flex-1 rounded-full border border-border bg-background px-4 text-xs"
                      />
                      <Button type="submit" size="sm" variant="destructive" disabled={busy}>
                        Confirm cancellation
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setCancelling(false);
                          setReason("");
                        }}
                      >
                        Keep order
                      </Button>
                    </form>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => setCancelling(true)}
                    >
                      Cancel order
                    </Button>
                  ))}
              </div>

              {detail.data.actions.next.length === 0 && !detail.data.actions.canCancel && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Package size={14} aria-hidden />
                  Nothing left to do on this order.
                </p>
              )}
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
