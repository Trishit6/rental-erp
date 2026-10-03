import { motion, useReducedMotion } from "framer-motion";
import { Check, Circle, Dot, X } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils/cn";
import type { OrderTimelineEvent } from "../types";

/**
 * The order's progression.
 *
 * Renders exactly the events it is given. Each event's timestamp is optional:
 * where the backend has no recorded time for a step, the step shows without one
 * rather than with an invented "now". A timeline that quietly fabricates times
 * is worse than one that admits which facts it knows.
 *
 * The component takes a plain array so that when a real order-event table
 * eventually exists, only the builder feeding it changes.
 */
export function OrderDetailsTimeline({ events }: { events: OrderTimelineEvent[] }) {
  const prefersReducedMotion = useReducedMotion();
  if (events.length === 0) return null;

  return (
    <section className="raised-surface p-5" aria-labelledby="order-timeline-heading">
      <h2 id="order-timeline-heading" className="font-heading text-lg font-extrabold">
        Progress
      </h2>

      <ol className="mt-4 space-y-0" data-testid="order-timeline">
        {events.map((event, index) => (
          <TimelineRow
            key={event.key}
            event={event}
            isLast={index === events.length - 1}
            animate={!prefersReducedMotion}
          />
        ))}
      </ol>
    </section>
  );
}

function TimelineRow({
  event,
  isLast,
  animate,
}: {
  event: OrderTimelineEvent;
  isLast: boolean;
  animate: boolean;
}) {
  const { state } = event;

  return (
    <motion.li
      initial={animate ? { opacity: 0, x: -6 } : false}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: Math.min(0.05, 0.01) }}
      className="flex gap-3"
    >
      <div className="flex flex-col items-center">
        <TimelineMarker state={state} />
        {!isLast && (
          <span
            aria-hidden="true"
            className={cn("w-px flex-1", state === "done" ? "bg-accent/50" : "bg-[var(--divider)]")}
          />
        )}
      </div>

      <div className={cn("min-w-0 pb-5", isLast && "pb-0")}>
        <p
          className={cn(
            "text-sm font-semibold",
            state === "pending" ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {event.label}
          {/* State is announced in text, never carried by colour alone. */}
          <span className="sr-only">
            {state === "done"
              ? " — completed"
              : state === "current"
                ? " — in progress"
                : state === "failed"
                  ? " — failed"
                  : state === "cancelled"
                    ? " — cancelled"
                    : " — waiting"}
          </span>
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {event.at
            ? format(new Date(event.at), "d MMM, h:mm a")
            : state === "pending"
              ? "Waiting"
              : state === "current"
                ? "In progress"
                : "\u00a0"}
        </p>
        {event.description && (
          <p className="mt-1 text-xs text-muted-foreground">{event.description}</p>
        )}
      </div>
    </motion.li>
  );
}

function TimelineMarker({ state }: { state: OrderTimelineEvent["state"] }) {
  const base = "flex size-6 shrink-0 items-center justify-center rounded-full";

  if (state === "failed") {
    return (
      <span className={cn(base, "bg-destructive/15 text-destructive")} aria-hidden="true">
        <X size={12} />
      </span>
    );
  }
  if (state === "cancelled") {
    return (
      <span className={cn(base, "bg-destructive/15 text-destructive")} aria-hidden="true">
        <X size={12} />
      </span>
    );
  }
  if (state === "done") {
    return (
      <span className={cn(base, "bg-accent/20 text-accent")} aria-hidden="true">
        <Check size={12} />
      </span>
    );
  }
  if (state === "current") {
    return (
      <span className={cn(base, "primary-button text-primary-foreground")} aria-hidden="true">
        <Dot size={14} />
      </span>
    );
  }
  return (
    <span className={cn(base, "inset-surface text-muted-foreground")} aria-hidden="true">
      <Circle size={8} />
    </span>
  );
}
