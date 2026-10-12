import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { onErrorHandler } from "../server/lib/api";
import { SESSION_USER_KEY } from "../server/lib/auth";
import { Router } from "../server/lib/http";
import { notificationDestination, NOTIFICATION_TYPES } from "../server/lib/notification-events";
import { RATE_LIMITS } from "../server/lib/rate-limit";
import { supportRoute } from "../server/routes/support";
import { startRouter, type Harness } from "./support/http-harness";
import { codeLines, stripComments } from "./support/source-scanning";

/**
 * The support API's authorization and route table (PROMPT 19).
 *
 * ## What is checked here, and what is not
 *
 * The ownership queries need MariaDB, which this suite does not mount — the live
 * database checks belong to `pnpm db:verify:constraints`. What *is* pinned here is the
 * session gate (an anonymous caller cannot even enumerate which ticket paths exist) and
 * the file-level properties that are easy to regress: that customer reads filter
 * internal notes in SQL, that every mutation is scoped by the session user's id, and
 * that a staff reply reaches the requester through a real notification type.
 */

const ROOT = join(__dirname, "..");

/** The real router at its real mount, with the session explicitly empty. */
function anonymousRouter(): Router {
  const router = new Router();
  router.onError(onErrorHandler);
  router.use(async (c, next) => {
    c.set(SESSION_USER_KEY, null);
    await next();
  });
  router.route("/api/support", supportRoute);
  return router;
}

const ENDPOINTS: [method: string, path: string][] = [
  ["GET", "/api/support/help-topics?q=refund"],
  ["GET", "/api/support/tickets"],
  ["GET", "/api/support/tickets/duplicate?orderId=1"],
  ["GET", "/api/support/tickets/1"],
  ["POST", "/api/support/tickets"],
  ["POST", "/api/support/tickets/1/messages"],
  ["POST", "/api/support/tickets/1/reopen"],
  ["POST", "/api/support/tickets/1/rating"],
  // Not a real endpoint: the gate runs before routing, so an anonymous caller cannot
  // learn which paths exist by watching for a 404 instead of a 401.
  ["GET", "/api/support/does-not-exist"],
];

describe("the support API refuses anonymous callers", () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startRouter(anonymousRouter());
  });

  afterAll(async () => {
    await harness.close();
  });

  for (const [method, path] of ENDPOINTS) {
    it(`${method} ${path} answers 401, not 404`, async () => {
      const res = await harness.request(path, {
        method,
        headers: { "content-type": "application/json" },
        body: method === "GET" ? undefined : JSON.stringify({ subject: "s", body: "b" }),
      });

      expect(res.status).toBe(401);
      const payload = (await res.json()) as { error?: { code?: string } };
      expect(payload.error?.code).toBe("UNAUTHENTICATED");
    });
  }
});

describe("the support routes are scoped to the session user", () => {
  const source = readFileSync(join(ROOT, "server/routes/support.ts"), "utf8");
  const code = stripComments(source);

  it("reads the file it is meant to be checking", () => {
    expect(source).toContain("supportRoute.post(");
  });

  it("gates the whole router on a signed-in user", () => {
    expect(code).toContain('supportRoute.use("*"');
    expect(code).toContain("requireUser(c)");
  });

  it("passes the session user's id into every data-layer call", () => {
    for (const call of [
      "createTicket(user.id",
      "appendTicketMessage(user.id",
      "getCustomerTicket(user.id",
      "listTickets(user.id",
      "rateTicket(user.id",
      "reopenTicket(user.id",
      "findOpenTicketForOrder(user.id",
    ]) {
      expect(code).toContain(call);
    }
  });

  it("reads no owner-shaped field off the request", () => {
    const forbidden = /\b(userId|authorId|requesterId|reporterId|assigneeId)\b/;
    const offenders = codeLines(code).filter(
      (line) => forbidden.test(line) && line.includes("c.req"),
    );
    expect(offenders).toEqual([]);
  });

  it("rate-limits creation and replies under their own budgets", () => {
    expect(code).toContain('guarded("support.create"');
    expect(code).toContain('guarded("support.reply"');
    expect(RATE_LIMITS["support.create"].limit).toBeGreaterThan(0);
    expect(RATE_LIMITS["support.reply"].limit).toBeGreaterThan(0);
  });

  it("registers the duplicate lookup before the id route", () => {
    // A `/:id` registered first would swallow the literal `duplicate`.
    const duplicateIndex = code.indexOf('"/tickets/duplicate"');
    const idIndex = code.indexOf('"/tickets/:id"');
    expect(duplicateIndex).toBeGreaterThan(-1);
    expect(idIndex).toBeGreaterThan(-1);
    expect(duplicateIndex).toBeLessThan(idIndex);
  });
});

describe("customer reads never include internal staff notes", () => {
  const source = readFileSync(join(ROOT, "server/lib/support.ts"), "utf8");
  const code = stripComments(source);

  it("scopes every read that answers a customer by the ticket owner", () => {
    expect(code).toContain("eq(supportTickets.userId, userId)");
    expect(code).toContain("requireOwnTicket");
  });

  it("filters internal notes in SQL for the user-facing transcript", () => {
    // Not CSS, not a post-fetch filter: an internal note must never leave the database
    // on a customer's request.
    expect(code).toContain("eq(ticketMessages.isInternal, false)");
    expect(code).toContain("is_internal = 0");
  });

  it("lets staff write an internal note that carries a flag", () => {
    expect(code).toContain("isInternal");
    expect(code).toContain("addStaffMessage");
  });
});

describe("a staff reply reaches the requester", () => {
  it("uses a notification type that exists and is emitted", () => {
    const definition = NOTIFICATION_TYPES.SUPPORT_TICKET_REPLY;
    expect(definition).toBeTruthy();
    expect(definition.supported).toBe(true);
  });

  it("deep-links to the ticket, and degrades to the support centre without an id", () => {
    expect(notificationDestination("SUPPORT_TICKET_REPLY", { ticketId: 7 })).toBe("/support/7");
    expect(notificationDestination("SUPPORT_TICKET_REPLY", {})).toBe("/support");
  });

  it("notifies from the staff reply path", () => {
    const code = stripComments(readFileSync(join(ROOT, "server/lib/support.ts"), "utf8"));
    expect(code).toContain("SUPPORT_TICKET_REPLY");
    expect(code).toContain("notificationEventKey");
  });
});

describe("the admin side is behind the admin gate", () => {
  const code = stripComments(readFileSync(join(ROOT, "server/routes/admin.ts"), "utf8"));

  it("exposes ticket list, detail and reply under /api/admin/support", () => {
    expect(code).toContain('adminRoute.get("/support/tickets"');
    expect(code).toContain('adminRoute.get("/support/tickets/:id"');
    // The post's path sits on its own line after the opening paren.
    expect(code).toContain('"/support/tickets/:id/messages"');
  });

  it("attributes a staff reply to the admin's own identity", () => {
    expect(code).toContain("addStaffMessage(admin.id");
    expect(code).toContain("staffTicketReplySchema");
  });
});
