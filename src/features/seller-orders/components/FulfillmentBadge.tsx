import { cn } from "@/lib/utils/cn";
import { fulfillmentLabel } from "../types";

/**
 * A fulfilment pill.
 *
 * Colour is never the only signal — the label is always rendered — but the tone
 * carries the meaning at a glance: done is positive, moving is informational,
 * a problem is destructive, and a terminal-not-good state is muted.
 */
const TONE_CLASSES: Record<string, string> = {
  PENDING_PAYMENT: "bg-foreground/8 text-muted-foreground",
  CONFIRMED: "bg-primary/12 text-primary",
  PROCESSING: "bg-primary/12 text-primary",
  READY_FOR_PICKUP: "bg-primary/18 text-primary",
  SHIPPED: "bg-primary/18 text-primary",
  DELIVERED: "bg-accent/15 text-accent",
  COMPLETED: "bg-accent/15 text-accent",
  CANCELLED: "bg-destructive/12 text-destructive",
};

export function FulfillmentBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold",
        TONE_CLASSES[status] ?? "bg-foreground/8 text-muted-foreground",
        className,
      )}
    >
      {fulfillmentLabel(status)}
    </span>
  );
}
