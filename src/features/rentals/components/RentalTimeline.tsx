import { motion, useReducedMotion } from "framer-motion";
import { Check, Circle, Dot, X } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils/cn";
import type { RentalTimelineEvent } from "../types";

/**
 * The rental's history.
 *
 * Renders exactly the events it is given, and a step gets a timestamp **only**
 * when the database holds one. The steps come from the `rental_events` table
 * (`buildRentalTimeline` on the server), with `createdAt` as the real fallback
 * for the confirmed step of rentals that predate that table. A step that was
 * never recorded has no time, so it renders without one rather than with an
 * invented "now".
 *
 * Takes a plain array, so a change in where the history comes from touches only
 * the builder that feeds it.
 */
export function RentalTimeline({ events }: { events: RentalTimelineEvent[] }) {
  const prefersReducedMotion = useReducedMotion();
  if (events.length === 0) return null;

  return (
    <ol className="space-y-0" data-testid="rental-timeline">
      {events.map((event, index) => (
        <Row
          key={event.key}
          event={event}
          isLast={index === events.length - 1}
          animate={!prefersReducedMotion}
        />
      ))}
    </ol>
  );
}

function Row({
  event,
  isLast,
  animate,
}: {
  event: RentalTimelineEvent;
  isLast: boolean;
  animate: boolean;
}) {
  return (
    <motion.li
      initial={animate ? { opacity: 0, x: -6 } : false}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className="flex gap-3"
    >
      <div className="flex flex-col items-center">
        <Marker state={event.state} />
        {!isLast && (
          <span
            aria-hidden="true"
            className={cn(
              "w-px flex-1",
              event.state === "done" ? "bg-accent/50" : "bg-[var(--divider)]",
            )}
          />
        )}
      </div>

      <div className={cn("min-w-0 pb-5", isLast && "pb-0")}>
        <p
          className={cn(
            "text-sm font-semibold",
            event.state === "pending" ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {event.label}
          {/* State in text, never by colour alone. */}
          <span className="sr-only">
            {event.state === "done"
              ? " — done"
              : event.state === "current"
                ? " — in progress"
                : event.state === "failed"
                  ? " — failed"
                  : event.state === "cancelled"
                    ? " — cancelled"
                    : " — waiting"}
          </span>
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {event.at
            ? format(new Date(event.at), "d MMM, h:mm a")
            : event.state === "pending"
              ? "Waiting"
              : event.state === "current"
                ? "In progress"
                : " "}
        </p>
        {event.description && (
          <p className="mt-1 text-xs text-muted-foreground">{event.description}</p>
        )}
      </div>
    </motion.li>
  );
}

function Marker({ state }: { state: RentalTimelineEvent["state"] }) {
  const base = "flex size-6 shrink-0 items-center justify-center rounded-full";

  if (state === "failed" || state === "cancelled") {
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
