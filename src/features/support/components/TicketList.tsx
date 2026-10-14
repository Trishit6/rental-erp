import { Link } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import { relativeTime } from "../format";
import type { TicketSummary } from "../types";
import { TicketStatusBadge } from "./TicketStatusBadge";

/**
 * The customer's ticket list.
 *
 * Each row is a link to the ticket, and the whole row is the target rather than a "View"
 * button — the row *is* the affordance. The number of messages and the last-updated time
 * are the two things that tell someone which ticket moved while they were away.
 */
export function TicketList({ tickets }: { tickets: TicketSummary[] }) {
  return (
    <ul className="space-y-3" data-testid="ticket-list">
      {tickets.map((ticket) => (
        <li key={ticket.id}>
          <Link
            to="/support/$ticketId"
            params={{ ticketId: String(ticket.id) }}
            className="block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Card className="flex items-center justify-between gap-4 p-4 transition hover:border-primary/40 hover:elev-2">
              <div className="min-w-0">
                <p className="truncate font-semibold">{ticket.subject}</p>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">{ticket.ticketNumber}</span>
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare size={11} aria-hidden />
                    {ticket.messageCount}
                  </span>
                  <span>· updated {relativeTime(ticket.updatedAt)}</span>
                </p>
              </div>
              <TicketStatusBadge status={ticket.status} className="shrink-0" />
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
