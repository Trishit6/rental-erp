import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import { TICKET_STATUS_LABELS, type TicketStatus } from "../types";

/**
 * The status pill.
 *
 * Colour is a secondary cue: every state has a word, and the words are the labels the
 * customer would use ("Awaiting your reply"), not the database's (`PENDING`). A user
 * reading a ticket should not have to learn our enum.
 */
const STATUS_CLASSES: Record<TicketStatus, string> = {
  OPEN: "bg-primary/10 text-primary",
  PENDING: "bg-accent/15 text-accent",
  IN_PROGRESS: "bg-primary/10 text-primary",
  RESOLVED: "bg-emerald-500/12 text-emerald-600",
  CLOSED: "bg-muted text-muted-foreground",
};

export function TicketStatusBadge({
  status,
  className,
}: {
  status: TicketStatus;
  className?: string;
}) {
  return (
    <Badge className={cn(STATUS_CLASSES[status], className)}>{TICKET_STATUS_LABELS[status]}</Badge>
  );
}
