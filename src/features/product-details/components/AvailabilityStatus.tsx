import { AlertTriangle, CalendarX2, CheckCircle2, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { StockState } from "../types";

const STATES: Record<StockState, { label: string; icon: typeof CheckCircle2; tone: string }> = {
  AVAILABLE: {
    label: "Available",
    icon: CheckCircle2,
    tone: "text-accent",
  },
  LIMITED: {
    label: "Limited availability",
    icon: Clock3,
    tone: "text-primary",
  },
  OUT_OF_STOCK: {
    label: "Out of stock",
    icon: CalendarX2,
    tone: "text-muted-foreground",
  },
  UNAVAILABLE: {
    label: "Currently unavailable",
    icon: AlertTriangle,
    tone: "text-muted-foreground",
  },
};

/**
 * Availability for the listing — or for one date window when `state` reflects a
 * checked range. Every state carries an icon *and* a word, so it reads correctly
 * without colour.
 */
export function AvailabilityStatus({
  state,
  detail,
  className,
}: {
  state: StockState;
  detail?: string;
  className?: string;
}) {
  const { label, icon: Icon, tone } = STATES[state];

  return (
    <div
      role="status"
      className={cn(
        "inset-surface inline-flex flex-col gap-0.5 rounded-2xl px-3.5 py-2",
        className,
      )}
    >
      <span className={cn("flex items-center gap-1.5 text-xs font-bold", tone)}>
        <Icon size={14} aria-hidden />
        {label}
      </span>
      {detail && <span className="text-[11px] text-muted-foreground">{detail}</span>}
    </div>
  );
}
