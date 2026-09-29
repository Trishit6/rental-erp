import {
  AlertTriangle,
  Ban,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  Circle,
  Hourglass,
  RotateCcw,
  ShieldQuestion,
} from "lucide-react";
import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { rentalStatusLabel, type RentalStatus } from "../types";

/**
 * A rental status pill.
 *
 * Colour is never the only signal: the label and an icon carry the meaning, so
 * the badge survives greyscale, colour-blindness and the dark theme. The icon
 * map is a static lookup rather than a factory function, because "choose which
 * component to render" is fine and "create one during render" is not.
 */
const ICONS: Record<string, ComponentType<LucideProps>> = {
  CONFIRMED: CalendarCheck,
  UPCOMING: CalendarClock,
  ACTIVE: Hourglass,
  RETURN_PENDING: RotateCcw,
  RETURNED: CheckCircle2,
  COMPLETED: CheckCircle2,
  CANCELLED: Ban,
  OVERDUE: AlertTriangle,
  DISPUTED: ShieldQuestion,
};

const TONE_CLASSES: Record<string, string> = {
  // Muted for "booked but not started", the olive accent for "you have it",
  // burnt orange for "needs attention", destructive for "cancelled early".
  upcoming: "bg-foreground/8 text-muted-foreground",
  active: "bg-accent/15 text-accent",
  done: "bg-primary/12 text-primary",
  warning: "bg-[color-mix(in_oklab,var(--color-primary)_22%,transparent)] text-primary",
  danger: "bg-destructive/12 text-destructive",
};

function toneFor(status: RentalStatus): string {
  switch (status) {
    case "CONFIRMED":
    case "UPCOMING":
      return TONE_CLASSES.upcoming;
    case "ACTIVE":
      return TONE_CLASSES.active;
    case "RETURN_PENDING":
    case "OVERDUE":
    case "DISPUTED":
      return TONE_CLASSES.warning;
    // Returned and completed are the story ending well, not badly.
    case "RETURNED":
    case "COMPLETED":
      return TONE_CLASSES.done;
    case "CANCELLED":
      return TONE_CLASSES.danger;
    default:
      return TONE_CLASSES.upcoming;
  }
}

export function RentalStatusBadge({
  status,
  className,
  size = "default",
}: {
  status: RentalStatus;
  className?: string;
  size?: "default" | "sm";
}) {
  const Icon = ICONS[status] ?? Circle;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-bold",
        size === "sm" ? "px-2.5 py-0.5 text-[11px]" : "px-3 py-1 text-xs",
        toneFor(status),
        className,
      )}
      data-status={status}
    >
      <Icon size={size === "sm" ? 11 : 13} aria-hidden="true" />
      {rentalStatusLabel(status)}
    </span>
  );
}
