import { describe, expect, it } from "vitest";
import { staffTicketUpdateSchema, TICKET_PRIORITIES, TICKET_STATUSES } from "../server/lib/support";
import {
  TICKET_PRIORITIES as CLIENT_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_STATUSES as CLIENT_STATUSES,
} from "../src/features/admin/api";
import { ROLE_PERMISSION_GRANTS } from "../server/lib/permission-catalogue";

/**
 * PROMPT 30 — the pure parts of the support inbox.
 *
 * The ticket vocabularies, the staff-edit schema and the permission layout are the
 * pieces a database cannot get wrong on its own, so they are asserted without one. The
 * route wiring is covered by `admin-permissions.test.ts` and the emitters by
 * `notification-events.test.ts`.
 */

describe("the ticket vocabularies", () => {
  it("agree between the server and the client", () => {
    // Two copies exist because the app and server compile separately. If they drift,
    // the filter dropdown offers a status the server never stores.
    expect([...CLIENT_STATUSES]).toEqual([...TICKET_STATUSES]);
    expect([...CLIENT_PRIORITIES]).toEqual([...TICKET_PRIORITIES]);
  });

  it("label every status and priority the server can store", () => {
    for (const status of TICKET_STATUSES) {
      expect(TICKET_STATUS_LABELS[status]).toBeTruthy();
    }
    for (const priority of TICKET_PRIORITIES) {
      expect(TICKET_PRIORITY_LABELS[priority]).toBeTruthy();
    }
  });
});

describe("staffTicketUpdateSchema", () => {
  it("accepts a status change with a reason", () => {
    expect(staffTicketUpdateSchema.parse({ status: "RESOLVED", reason: "Answered." })).toEqual({
      status: "RESOLVED",
      reason: "Answered.",
    });
  });

  it("accepts a priority change and a release", () => {
    expect(
      staffTicketUpdateSchema.parse({ priority: "URGENT", reason: "Escalated." }),
    ).toMatchObject({
      priority: "URGENT",
    });
    expect(
      staffTicketUpdateSchema.parse({ assigneeId: null, reason: "Back to the pool." }),
    ).toMatchObject({ assigneeId: null });
  });

  it("refuses a change with no reason", () => {
    expect(() => staffTicketUpdateSchema.parse({ status: "CLOSED" })).toThrow();
    expect(() => staffTicketUpdateSchema.parse({ status: "CLOSED", reason: "  " })).toThrow();
  });

  it("refuses an unknown status or priority", () => {
    expect(() =>
      staffTicketUpdateSchema.parse({ status: "DONE", reason: "not a status" }),
    ).toThrow();
    expect(() =>
      staffTicketUpdateSchema.parse({ priority: "WHENEVER", reason: "not a priority" }),
    ).toThrow();
  });

  it("refuses an update that changes nothing", () => {
    expect(() => staffTicketUpdateSchema.parse({ reason: "changed nothing" })).toThrow();
  });

  it("refuses unknown keys rather than dropping them silently", () => {
    expect(() =>
      staffTicketUpdateSchema.parse({ status: "RESOLVED", reason: "ok", note: "sneak" }),
    ).toThrow();
  });

  it("refuses a non-positive assignee", () => {
    expect(() => staffTicketUpdateSchema.parse({ assigneeId: 0, reason: "bad id" })).toThrow();
  });
});

describe("who can work the support inbox", () => {
  it("lets SUPPORT read and answer tickets", () => {
    expect(ROLE_PERMISSION_GRANTS.SUPPORT).toContain("support.view");
    expect(ROLE_PERMISSION_GRANTS.SUPPORT).toContain("support.reply");
  });

  it("lets MODERATOR read but not answer", () => {
    expect(ROLE_PERMISSION_GRANTS.MODERATOR).toContain("support.view");
    expect(ROLE_PERMISSION_GRANTS.MODERATOR).not.toContain("support.reply");
  });

  it("keeps FINANCE out of the ticket queue", () => {
    expect(ROLE_PERMISSION_GRANTS.FINANCE).not.toContain("support.view");
    expect(ROLE_PERMISSION_GRANTS.FINANCE).not.toContain("support.reply");
  });

  it("keeps the refund capability away from SUPPORT", () => {
    // The ticket screen offers a refund hand-off, but only the order flow can create
    // one — and only for an account that holds `orders.refund`.
    expect(ROLE_PERMISSION_GRANTS.SUPPORT).not.toContain("orders.refund");
    expect(ROLE_PERMISSION_GRANTS.FINANCE).toContain("orders.refund");
  });
});
