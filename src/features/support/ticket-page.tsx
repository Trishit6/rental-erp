import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, LifeBuoy, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/empty-state";
import { AttachmentPicker } from "./components/AttachmentPicker";
import { TicketRating } from "./components/TicketRating";
import { TicketStatusBadge } from "./components/TicketStatusBadge";
import { TicketThread } from "./components/TicketThread";
import { relativeTime } from "./format";
import { supportErrorMessage, useReopenTicket, useReplyToTicket, useTicket } from "./query";
import { CUSTOMER_REPLYABLE_STATUSES, type AttachmentInput } from "./types";

/**
 * `/support/$ticketId` — one ticket, as the customer sees it.
 *
 * The server returns only messages the customer may read, so this page renders the
 * transcript it is given and never has to filter. The reply box appears only for a
 * ticket the customer can still post to; a resolved ticket shows the reopen control and
 * the optional rating instead, because those are the only two things left to do with it.
 */
export function TicketDetailPage({ ticketId }: { ticketId: number }) {
  const { data: ticket, isLoading, isError, refetch } = useTicket(ticketId);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<AttachmentInput[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reply = useReplyToTicket(ticketId);
  const reopen = useReopenTicket(ticketId);

  if (isLoading) {
    return (
      <div className="page-wrap max-w-3xl space-y-4 pb-12 pt-8">
        <div className="inset-surface h-24 animate-pulse rounded-3xl" />
        <div className="inset-surface h-64 animate-pulse rounded-3xl" />
      </div>
    );
  }

  if (isError || !ticket) {
    return (
      <div className="page-wrap max-w-3xl pb-12 pt-8">
        <EmptyState
          icon={LifeBuoy}
          title="Couldn't load this ticket"
          description="It may have been removed, or you may not have access to it."
          action={
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => void refetch()}>
                Try again
              </Button>
              <Button asChild size="sm">
                <Link to="/support">Back to support</Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  const replyable = CUSTOMER_REPLYABLE_STATUSES.includes(ticket.status);
  const settled = ticket.status === "RESOLVED" || ticket.status === "CLOSED";

  function handleReply() {
    const body = draft.trim();
    if (!body) return;
    setError(null);
    reply.mutate(
      { body, attachments: attachments.length > 0 ? attachments : undefined },
      {
        onSuccess: () => {
          setDraft("");
          setAttachments([]);
        },
        onError: (mutationError) => setError(supportErrorMessage(mutationError)),
      },
    );
  }

  return (
    <div className="page-wrap max-w-3xl space-y-6 pb-12 pt-8">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/support">
            <ArrowLeft size={14} aria-hidden />
            All tickets
          </Link>
        </Button>
      </div>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="section-title text-2xl">{ticket.subject}</h1>
          <TicketStatusBadge status={ticket.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="font-mono">{ticket.ticketNumber}</span> · opened{" "}
          {relativeTime(ticket.createdAt)}
          {ticket.orderId ? <> · about order #{ticket.orderId}</> : null}
          {ticket.rentalId ? <> · about rental #{ticket.rentalId}</> : null}
        </p>
      </header>

      <TicketThread messages={ticket.messages} />

      {replyable ? (
        <section className="inset-surface space-y-3 rounded-3xl p-5">
          <label htmlFor="ticket-reply" className="text-sm font-medium">
            Reply
          </label>
          <Textarea
            id="ticket-reply"
            value={draft}
            rows={4}
            maxLength={4000}
            placeholder="Add a message…"
            onChange={(event) => setDraft(event.target.value)}
          />
          <AttachmentPicker attachments={attachments} onChange={setAttachments} />
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button disabled={reply.isPending || draft.trim().length === 0} onClick={handleReply}>
            {reply.isPending ? "Sending…" : "Send reply"}
          </Button>
        </section>
      ) : (
        <section className="inset-surface space-y-4 rounded-3xl p-5">
          <p className="text-sm text-muted-foreground">
            This ticket is {ticket.status === "RESOLVED" ? "resolved" : "closed"}. If it is not
            sorted, you can reopen it within a few days and keep the same conversation.
          </p>
          <Button
            variant="secondary"
            size="sm"
            disabled={reopen.isPending}
            onClick={() => reopen.mutate()}
          >
            <RotateCcw size={14} aria-hidden />
            {reopen.isPending ? "Reopening…" : "Reopen ticket"}
          </Button>
          {settled ? <TicketRating ticketId={ticket.id} rating={ticket.resolutionRating} /> : null}
        </section>
      )}
    </div>
  );
}
