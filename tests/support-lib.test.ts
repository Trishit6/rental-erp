import { describe, expect, it } from "vitest";
import {
  autoPriority,
  CUSTOMER_REPLYABLE_STATUSES,
  createTicketSchema,
  isReopenable,
  MAX_ATTACHMENTS_PER_MESSAGE,
  REOPEN_WINDOW_DAYS,
  REOPEN_WINDOW_MS,
  suggestHelpTopics,
  ticketMessageSchema,
  ticketNumberFor,
  ticketRatingSchema,
  TICKET_STATUSES,
} from "../server/lib/support";

/**
 * The pure half of the support module (PROMPT 19).
 *
 * Priority inference, help-topic suggestion, the reopen window and the ticket-number
 * format take no database, so they are tested directly. The rules that decide *whose*
 * ticket a caller may read need MariaDB and are pinned by
 * `pnpm db:verify:constraints`; what is pinned here is everything a route can decide
 * before it opens a connection.
 */

describe("ticket numbers", () => {
  it("uses the documented TK-<year>-<padded id> format", () => {
    expect(ticketNumberFor(123, new Date("2026-05-01T00:00:00Z"))).toBe("TK-2026-000123");
  });

  it("zero-pads so numbers sort and read consistently", () => {
    expect(ticketNumberFor(1, new Date("2026-01-01T00:00:00Z"))).toBe("TK-2026-000001");
  });

  it("stays inside the 20-character column even for a large id", () => {
    const number = ticketNumberFor(9_999_999, new Date("2026-01-01T00:00:00Z"));
    expect(number.length).toBeLessThanOrEqual(20);
  });
});

describe("automatic priority", () => {
  it("escalates fraud-shaped language to URGENT", () => {
    expect(autoPriority("I was charged twice", "")).toBe("URGENT");
    expect(autoPriority("Account hacked", "someone has my password")).toBe("URGENT");
  });

  it("raises money-shaped language to HIGH", () => {
    expect(autoPriority("Where is my refund?", "")).toBe("HIGH");
    expect(autoPriority("Deposit not returned", "")).toBe("HIGH");
  });

  it("leaves everything else at NORMAL", () => {
    expect(autoPriority("How do I return a rental?", "the item is due back")).toBe("NORMAL");
  });

  it("reads the body as well as the subject", () => {
    expect(autoPriority("Help", "my payment was declined")).toBe("HIGH");
  });
});

describe("suggested help topics", () => {
  it("suggests a topic whose keywords match", () => {
    const suggestions = suggestHelpTopics("refund");
    expect(suggestions.map((topic) => topic.id)).toContain("refund-status");
  });

  it("returns nothing for an empty or tiny query", () => {
    expect(suggestHelpTopics("")).toEqual([]);
    expect(suggestHelpTopics("a")).toEqual([]);
  });

  it("caps the number of suggestions", () => {
    expect(suggestHelpTopics("return rental deposit payment refund", 2)).toHaveLength(2);
  });
});

describe("the reopen window", () => {
  const now = new Date("2026-05-10T12:00:00Z");

  it("allows a ticket resolved inside the window", () => {
    const resolvedAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    expect(isReopenable({ status: "RESOLVED", resolvedAt, closedAt: null }, now)).toBe(true);
  });

  it("refuses a ticket resolved before the window", () => {
    const resolvedAt = new Date(now.getTime() - (REOPEN_WINDOW_DAYS + 1) * 24 * 60 * 60 * 1000);
    expect(isReopenable({ status: "RESOLVED", resolvedAt, closedAt: null }, now)).toBe(false);
  });

  it("refuses a ticket that is not resolved or closed", () => {
    expect(isReopenable({ status: "OPEN", resolvedAt: now, closedAt: null }, now)).toBe(false);
  });

  it("refuses when there is no timestamp to measure from", () => {
    expect(isReopenable({ status: "CLOSED", resolvedAt: null, closedAt: null }, now)).toBe(false);
  });

  it("accepts an ISO string timestamp, as a row read from the driver may be", () => {
    const closedAt = new Date(now.getTime() - 60 * 1000).toISOString();
    expect(isReopenable({ status: "CLOSED", resolvedAt: null, closedAt }, now)).toBe(true);
  });

  it("uses a seven-day window", () => {
    expect(REOPEN_WINDOW_MS).toBe(REOPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  });
});

describe("create-ticket validation", () => {
  it("accepts a well-formed ticket", () => {
    expect(
      createTicketSchema.safeParse({ subject: "Refund please", body: "It never arrived." }).success,
    ).toBe(true);
  });

  it("accepts an optionally linked order or rental", () => {
    expect(
      createTicketSchema.safeParse({ subject: "Refund please", body: "…", orderId: 12 }).success,
    ).toBe(true);
    expect(
      createTicketSchema.safeParse({ subject: "Refund please", body: "…", rentalId: 12 }).success,
    ).toBe(true);
  });

  it("requires a subject and a body", () => {
    expect(createTicketSchema.safeParse({ subject: "ab", body: "…" }).success).toBe(false);
    expect(createTicketSchema.safeParse({ subject: "Refund please", body: "" }).success).toBe(false);
  });

  it("refuses a field the format does not define", () => {
    // `.strict()` is what stops a client setting its own status or priority.
    expect(
      createTicketSchema.safeParse({ subject: "Refund", body: "…", priority: "URGENT" }).success,
    ).toBe(false);
    expect(
      createTicketSchema.safeParse({ subject: "Refund", body: "…", userId: 3 }).success,
    ).toBe(false);
  });

  it("caps attachments per message", () => {
    const attachment = { fileName: "a.png", url: "/api/storage/local?key=tickets/1/abcdefgh.png" };
    const tooMany = Array.from({ length: MAX_ATTACHMENTS_PER_MESSAGE + 1 }, () => attachment);
    expect(
      createTicketSchema.safeParse({ subject: "Refund", body: "…", attachments: tooMany }).success,
    ).toBe(false);
  });
});

describe("message and rating validation", () => {
  it("requires a non-empty message", () => {
    expect(ticketMessageSchema.safeParse({ body: "" }).success).toBe(false);
    expect(ticketMessageSchema.safeParse({ body: "Any update?" }).success).toBe(true);
  });

  it("accepts only a 1–5 integer rating", () => {
    expect(ticketRatingSchema.safeParse({ rating: 5 }).success).toBe(true);
    expect(ticketRatingSchema.safeParse({ rating: 0 }).success).toBe(false);
    expect(ticketRatingSchema.safeParse({ rating: 6 }).success).toBe(false);
    expect(ticketRatingSchema.safeParse({ rating: 3.5 }).success).toBe(false);
  });
});

describe("the status vocabulary", () => {
  it("defines exactly the five documented statuses", () => {
    expect([...TICKET_STATUSES]).toEqual(["OPEN", "PENDING", "IN_PROGRESS", "RESOLVED", "CLOSED"]);
  });

  it("lets a customer reply only to a ticket that is still being worked", () => {
    expect([...CUSTOMER_REPLYABLE_STATUSES].sort()).toEqual(["IN_PROGRESS", "OPEN", "PENDING"]);
  });
});
