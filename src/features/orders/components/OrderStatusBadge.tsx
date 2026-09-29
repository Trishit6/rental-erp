import {
  Ban,
  CheckCircle2,
  Circle,
  Clock,
  Package,
  RotateCcw,
  Truck,
  XCircle,
} from "lucide-react";
import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { statusLabel, statusTone, type StatusTone } from "./schema";
import type { OrderStatus, PaymentStatus, RentalStatus } from "../types";

/**
 * A status pill.
 *
 * Colour alone is never the signal: every badge renders its label *and* an icon,
 * so it survives greyscale, colour-blindness and the dark theme. The tone drives
 * the palette; the icon describes the state — which is why the two are chosen
 * separately rather than one switch deciding both.
 */

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-foreground/8 text-muted-foreground",
  info: "bg-primary/12 text-primary",
  success: "bg-accent/15 text-accent",
  warning: "bg-[color-mix(in_oklab,var(--color-primary)_22%,transparent)] text-primary",
  danger: "bg-destructive/12 text-destructive",
};

/**
 * Icon per status. A static lookup rather than a function that returns a
 * component: deciding *which* component to render is fine, "creating" one during
 * render is not, and a map makes the distinction obvious.
 */
const ICONS: Record<string, ComponentType<LucideProps>> = {
  PENDING_PAYMENT: Clock,
  PENDING: Clock,
  RETURN_PENDING: Clock,
  CONFIRMED: CheckCircle2,
  PAID: CheckCircle2,
  COMPLETED: CheckCircle2,
  RETURNED: CheckCircle2,
  DELIVERED: CheckCircle2,
  PROCESSING: Package,
  SHIPPED: Truck,
  READY_FOR_PICKUP: Truck,
  ACTIVE: RotateCcw,
  OVERDUE: Clock,
  DISPUTED: Clock,
  CANCELLED: Ban,
  FAILED: XCircle,
  REFUNDED: RotateCcw,
  PARTIALLY_REFUNDED: RotateCcw,
};

export function OrderStatusBadge({
  status,
  className,
  size = "default",
}: {
  status: OrderStatus | PaymentStatus | RentalStatus;
  className?: string;
  size?: "default" | "sm";
}) {
  const Icon = ICONS[status] ?? Circle;
  const label = statusLabel(status);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-bold",
        size === "sm" ? "px-2.5 py-0.5 text-[11px]" : "px-3 py-1 text-xs",
        TONE_CLASSES[statusTone(status)],
        className,
      )}
      // The icon is decorative; the text is the accessible name.
      data-status={status}
    >
      <Icon size={size === "sm" ? 11 : 13} aria-hidden="true" />
      {label}
    </span>
  );
}
