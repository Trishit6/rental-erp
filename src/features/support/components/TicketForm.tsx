import { useState, type FormEvent } from "react";
import { Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supportErrorMessage, useCreateTicket, useDuplicateTicket, useHelpTopics } from "../query";
import type { AttachmentInput } from "../types";
import { AttachmentPicker } from "./AttachmentPicker";

/**
 * The "new ticket" form.
 *
 * ## Why the order link is a prop, not a field
 *
 * A customer arrives here from the order they are already looking at, so the order id is
 * handed in via the page's search params rather than re-picked from a list. That removes
 * a whole class of mistake — attaching the ticket to the wrong order — and means the form
 * has nothing to fetch for the common case.
 *
 * The duplicate warning is advisory: it surfaces an existing open ticket about the same
 * order but never blocks the new one, because the customer knows their situation better
 * than a heuristic does.
 */
export function TicketForm({
  orderId,
  rentalId,
  onCreated,
}: {
  orderId?: number;
  rentalId?: number;
  onCreated?: (id: number) => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<AttachmentInput[]>([]);
  const [error, setError] = useState<string | null>(null);

  const createTicket = useCreateTicket();
  const topics = useHelpTopics(subject);
  const duplicate = useDuplicateTicket(orderId);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (subject.trim().length < 3) {
      setError("Give your ticket a short subject so support can find it.");
      return;
    }
    if (body.trim().length === 0) {
      setError("Describe what happened so support can help.");
      return;
    }

    createTicket.mutate(
      {
        subject: subject.trim(),
        body: body.trim(),
        orderId,
        rentalId,
        attachments: attachments.length > 0 ? attachments : undefined,
      },
      {
        onSuccess: (result) => onCreated?.(result.id),
        onError: (mutationError) => setError(supportErrorMessage(mutationError)),
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="ticket-form">
      {duplicate.data ? (
        <p
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
          role="status"
        >
          You already have an open ticket about this order ({duplicate.data.ticketNumber}:{" "}
          {duplicate.data.subject}). You can still open another if it is a different problem.
        </p>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="ticket-subject" className="text-sm font-medium">
          Subject
        </label>
        <Input
          id="ticket-subject"
          value={subject}
          maxLength={200}
          placeholder="A few words about the problem"
          onChange={(event) => setSubject(event.target.value)}
        />
      </div>

      {topics.data && topics.data.length > 0 ? (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lightbulb size={12} aria-hidden />
            These help articles might answer it faster
          </p>
          <ul className="flex flex-wrap gap-2">
            {topics.data.map((topic) => (
              <li key={topic.id}>
                <button
                  type="button"
                  className="rounded-full border border-border px-3 py-1 text-xs transition hover:border-primary hover:text-primary"
                  onClick={() => setSubject(topic.title)}
                >
                  {topic.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="ticket-body" className="text-sm font-medium">
          What happened?
        </label>
        <Textarea
          id="ticket-body"
          value={body}
          rows={6}
          maxLength={4000}
          placeholder="Tell us what went wrong, and anything you have already tried."
          onChange={(event) => setBody(event.target.value)}
        />
      </div>

      <AttachmentPicker attachments={attachments} onChange={setAttachments} />

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={createTicket.isPending}>
          {createTicket.isPending ? "Opening…" : "Open ticket"}
        </Button>
      </div>
    </form>
  );
}
