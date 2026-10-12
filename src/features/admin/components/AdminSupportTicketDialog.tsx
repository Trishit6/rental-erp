import { useState } from "react";
import { LifeBuoy, Loader2, Lock, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";
import {
  useAdminAccess,
  useAdminSupportReply,
  useAdminSupportTicketDetail,
  useAdminSupportUpdate,
} from "../query";
import {
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  type AdminSupportTicketUpdate,
  type AdminTicketPriority,
  type AdminTicketStatus,
} from "../api";
import { formatAdminDateTime, formatAdminMoney, humanizeEnum } from "./format";
import {
  NEUTRAL_BADGE,
  ORDER_STATUS_BADGE,
  PAYMENT_STATUS_BADGE,
  TICKET_PRIORITY_BADGE,
  TICKET_STATUS_BADGE,
} from "./status-badge";

/**
 * One support ticket, opened by the agent who is going to answer it.
 *
 * ## The thread is the whole screen
 *
 * The customer's words are above the reply box, with internal notes marked in place —
 * a note that reads like part of the conversation but is invisible to the customer is
 * the single easiest way for an agent to say the wrong thing. Every message says who
 * wrote it and whether the customer can see it.
 *
 * ## The state controls are separate from the reply
 *
 * Replying already moves an `OPEN` ticket to `PENDING` (the customer owes an answer),
 * so the status/priority/assignee controls are for the deliberate edits an agent makes
 * on top of that. They are one write with one reason, because "why did this ticket
 * change hands" is the question the audit log has to be able to answer.
 *
 * ## Refunds are handed off, not re-implemented
 *
 * A ticket linked to an order shows the order and, for an account that holds
 * `orders.refund`, a button that opens the *real* order dialog. Support can read every
 * ticket but cannot return money; the refund still runs through the one flow that
 * enforces "never more than was captured".
 */
export function AdminSupportTicketDialog({
  ticketId,
  open,
  onOpenChange,
  onOpenOrder,
}: {
  ticketId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Hand the linked order to the page's order dialog, so refunds reuse that flow. */
  onOpenOrder: (orderId: number) => void;
}) {
  const detail = useAdminSupportTicketDetail(open ? ticketId : null);
  const access = useAdminAccess();
  const reply = useAdminSupportReply();
  const update = useAdminSupportUpdate();

  const [replyBody, setReplyBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [assignee, setAssignee] = useState("");
  const [reason, setReason] = useState("");
  const [seededId, setSeededId] = useState<number | null>(null);

  const ticket = detail.data;

  // Seed the workflow controls the first time each ticket loads. This is the documented
  // "adjust state when a prop changes" render-phase update, not an effect: it converges
  // in one render and never fights the agent's own edits afterwards.
  if (ticket && seededId !== ticket.id) {
    setSeededId(ticket.id);
    setStatus(ticket.status);
    setPriority(ticket.priority);
    setAssignee(ticket.assigneeId === null ? "" : String(ticket.assigneeId));
    setReason("");
  }

  const meId = access.data?.id ?? null;
  const assigneeOptions = [
    { value: "", label: "Unassigned" },
    ...(meId ? [{ value: String(meId), label: "Me" }] : []),
    ...(ticket?.assigneeId && ticket.assigneeId !== meId
      ? [
          {
            value: String(ticket.assigneeId),
            label: ticket.assigneeName ?? `#${ticket.assigneeId}`,
          },
        ]
      : []),
  ];

  const nextAssignee = assignee === "" ? null : Number(assignee);
  const changed =
    ticket !== undefined &&
    (status !== ticket.status ||
      priority !== ticket.priority ||
      nextAssignee !== ticket.assigneeId);
  const canSave = changed && reason.trim().length >= 3 && !update.isPending;
  const canRefund = access.data?.permissions.includes("orders.refund") ?? false;

  function saveWorkflow() {
    if (!ticket) return;
    const input: AdminSupportTicketUpdate = { reason };
    if (status !== ticket.status) input.status = status as AdminTicketStatus;
    if (priority !== ticket.priority) input.priority = priority as AdminTicketPriority;
    if (nextAssignee !== ticket.assigneeId) input.assigneeId = nextAssignee;
    update.mutate({ id: ticket.id, input }, { onSuccess: () => setReason("") });
  }

  function sendReply() {
    if (!ticket || replyBody.trim().length === 0) return;
    reply.mutate(
      { id: ticket.id, input: { body: replyBody, isInternal } },
      {
        onSuccess: () => {
          setReplyBody("");
          setIsInternal(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <LifeBuoy size={16} aria-hidden className="text-muted-foreground" />
            <span>{ticket?.ticketNumber ?? (ticketId ? `Ticket #${ticketId}` : "Ticket")}</span>
            {ticket ? (
              <>
                <Badge
                  className={cn(
                    "whitespace-nowrap",
                    TICKET_STATUS_BADGE[ticket.status] ?? NEUTRAL_BADGE,
                  )}
                >
                  {TICKET_STATUS_LABELS[ticket.status as AdminTicketStatus] ??
                    humanizeEnum(ticket.status)}
                </Badge>
                <Badge
                  className={cn(
                    "whitespace-nowrap",
                    TICKET_PRIORITY_BADGE[ticket.priority] ?? NEUTRAL_BADGE,
                  )}
                >
                  {TICKET_PRIORITY_LABELS[ticket.priority as AdminTicketPriority] ??
                    humanizeEnum(ticket.priority)}
                </Badge>
              </>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {ticket
              ? `${ticket.subject} · raised by ${ticket.requesterName}`
              : "Loading the ticket…"}
          </DialogDescription>
        </DialogHeader>

        {detail.isLoading && !ticket ? (
          <div className="space-y-2 py-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : detail.isError || !ticket ? (
          <div className="py-4 text-sm text-destructive" role="alert">
            This ticket could not be loaded.
          </div>
        ) : (
          <div className="space-y-5">
            <section className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <Info
                label="Requester"
                value={`${ticket.requester.name} · ${ticket.requester.email}`}
              />
              <Info
                label="Assignee"
                value={ticket.assignee ? ticket.assignee.name : "Unassigned"}
              />
              <Info label="Opened" value={formatAdminDateTime(ticket.createdAt)} />
              <Info
                label="SLA"
                value={ticket.slaDueAt ? formatAdminDateTime(ticket.slaDueAt) : "No SLA set"}
              />
            </section>

            {ticket.order ? (
              <section className="rounded-xl bg-muted/40 p-3">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Linked order
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">
                    {ticket.order.orderNumber ?? `Order #${ticket.order.id}`}
                  </span>
                  <Badge
                    className={cn(
                      "whitespace-nowrap",
                      ORDER_STATUS_BADGE[ticket.order.status] ?? NEUTRAL_BADGE,
                    )}
                  >
                    {humanizeEnum(ticket.order.status)}
                  </Badge>
                  <Badge
                    className={cn(
                      "whitespace-nowrap",
                      PAYMENT_STATUS_BADGE[ticket.order.paymentStatus] ?? NEUTRAL_BADGE,
                    )}
                  >
                    {humanizeEnum(ticket.order.paymentStatus)}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {formatAdminMoney(ticket.order.total, ticket.order.currency)}
                  </span>
                  {/* The refund itself runs in the order dialog, which enforces the
                      captured-total rule and the `orders.refund` gate. */}
                  {canRefund ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => onOpenOrder(ticket.order!.id)}
                    >
                      Open order to refund
                    </Button>
                  ) : null}
                </div>
              </section>
            ) : null}

            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Conversation
              </h3>
              <ol className="space-y-2">
                {ticket.messages.map((message) => (
                  <li
                    key={message.id}
                    className={cn(
                      "rounded-xl px-3 py-2",
                      message.isInternal
                        ? "border border-dashed border-[var(--divider)] bg-warning/15"
                        : message.authorIsStaff
                          ? "bg-primary/10"
                          : "bg-muted/40",
                    )}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-semibold">
                        {message.authorName}
                        {message.isInternal ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-warning">
                            <Lock size={11} aria-hidden /> Internal note
                          </span>
                        ) : null}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatAdminDateTime(message.createdAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 whitespace-pre-line text-sm">{message.body}</p>
                    {message.attachments.length > 0 ? (
                      <ul className="mt-1 flex flex-wrap gap-2">
                        {message.attachments.map((attachment) => (
                          <li key={attachment.id}>
                            <a
                              href={attachment.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-semibold text-primary underline"
                            >
                              {attachment.fileName}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>

            <section className="space-y-3 rounded-xl border border-[var(--divider)] p-3">
              <Textarea
                aria-label="Reply to the customer"
                value={replyBody}
                onChange={(event) => setReplyBody(event.target.value)}
                placeholder="Write a reply…"
                rows={3}
                maxLength={4000}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isInternal}
                    onChange={(event) => setIsInternal(event.target.checked)}
                  />
                  Internal note (not shown to the customer)
                </label>
                <Button
                  type="button"
                  size="sm"
                  disabled={replyBody.trim().length === 0 || reply.isPending}
                  onClick={sendReply}
                >
                  {reply.isPending ? (
                    <Loader2 size={14} aria-hidden className="animate-spin" />
                  ) : (
                    <Send size={14} aria-hidden />
                  )}
                  {isInternal ? "Add note" : "Send reply"}
                </Button>
              </div>
            </section>

            <section className="space-y-3 rounded-xl border border-[var(--divider)] p-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Ticket state
              </h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <NativeSelect
                  label="Status"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  options={TICKET_STATUSES.map((value) => ({
                    value,
                    label: TICKET_STATUS_LABELS[value],
                  }))}
                />
                <NativeSelect
                  label="Priority"
                  value={priority}
                  onChange={(event) => setPriority(event.target.value)}
                  options={TICKET_PRIORITIES.map((value) => ({
                    value,
                    label: TICKET_PRIORITY_LABELS[value],
                  }))}
                />
                <NativeSelect
                  label="Assignee"
                  value={assignee}
                  onChange={(event) => setAssignee(event.target.value)}
                  options={assigneeOptions}
                />
              </div>
              <Textarea
                aria-label="Reason for the change"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why is the ticket changing? Recorded in the audit log."
                rows={2}
                maxLength={300}
              />
              <div className="flex justify-end">
                <Button type="button" size="sm" disabled={!canSave} onClick={saveWorkflow}>
                  {update.isPending ? (
                    <Loader2 size={14} aria-hidden className="animate-spin" />
                  ) : null}
                  Save changes
                </Button>
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="break-words text-sm">{value}</p>
    </div>
  );
}
