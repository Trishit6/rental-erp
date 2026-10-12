/**
 * Support-ticket types (PROMPT 19).
 *
 * These mirror the payloads `server/lib/support.ts` returns. Two details are worth
 * stating because they are what keep the client honest:
 *
 *  - `authorIsStaff` is computed **server-side** from the author's role. The client does
 *    not compare an id against a cached session to decide whether a line came from
 *    support — a stale session would then mislabel a staff reply as the user's own.
 *  - `messageCount` counts only the customer-visible messages, so a badge or a summary
 *    cannot be inflated by internal notes the customer must never see.
 */
export type TicketStatus = "OPEN" | "PENDING" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type TicketPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export type TicketAttachment = {
  id: number;
  fileName: string;
  url: string;
  mimeType: string | null;
  sizeBytes: number | null;
};

export type TicketMessageRecord = {
  id: number;
  body: string;
  createdAt: string;
  authorId: number;
  authorName: string;
  /** True when the author is staff. Resolved by the server, never guessed here. */
  authorIsStaff: boolean;
  attachments: TicketAttachment[];
};

export type TicketSummary = {
  id: number;
  /** The quotable reference, e.g. `TK-2026-000123`. */
  ticketNumber: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  orderId: number | null;
  rentalId: number | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  resolutionRating: number | null;
  messageCount: number;
};

export type TicketDetail = TicketSummary & {
  messages: TicketMessageRecord[];
};

export type HelpTopic = {
  id: string;
  title: string;
};

export type AttachmentInput = {
  fileName: string;
  url: string;
  mimeType?: string;
  sizeBytes?: number;
};

export type CreateTicketInput = {
  subject: string;
  body: string;
  orderId?: number;
  rentalId?: number;
  attachments?: AttachmentInput[];
};

export type TicketReplyInput = {
  body: string;
  attachments?: AttachmentInput[];
};

/**
 * The states a customer may still post into.
 *
 * Mirrors `CUSTOMER_REPLYABLE_STATUSES` on the server; the server is the authority, and
 * this copy only decides whether the composer is shown. A disagreement shows a form that
 * would 409, never a missing form the server would have accepted.
 */
export const CUSTOMER_REPLYABLE_STATUSES: readonly TicketStatus[] = [
  "OPEN",
  "PENDING",
  "IN_PROGRESS",
];

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: "Open",
  PENDING: "Awaiting your reply",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};
