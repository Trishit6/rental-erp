import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { onErrorHandler } from "../server/lib/api";
import { SESSION_USER_KEY } from "../server/lib/auth";
import { Router } from "../server/lib/http";
import { reportInputSchema } from "../server/lib/reports";
import { reportsRoute } from "../server/routes/reports";
import { RATE_LIMITS } from "../server/lib/rate-limit";
import { startRouter, type Harness } from "./support/http-harness";
import { codeLines, stripComments } from "./support/source-scanning";

/**
 * The reporting API (PROMPT 18).
 *
 * ## What is checked here, and what is not
 *
 * The target-resolution queries need a database, which this suite does not mount — the
 * live MariaDB checks belong to `pnpm db:verify:constraints`. What *is* pure, and what
 * this file pins, is the rule that decides whether the queries may run at all:
 * a report names exactly one thing. That rule is a schema refinement precisely so it
 * can be tested here, and so the route rejects a malformed body before it opens a
 * connection.
 *
 * The remaining assertions are the authorization-shaped ones: an anonymous caller gets
 * `401` and not a directory of what exists, and the reporter is read from the session
 * rather than from the request body.
 */

const ROOT = join(__dirname, "..");

function anonymousRouter(): Router {
  const router = new Router();
  router.onError(onErrorHandler);
  router.use(async (c, next) => {
    c.set(SESSION_USER_KEY, null);
    await next();
  });
  router.route("/api/reports", reportsRoute);
  return router;
}

describe("the reporting API refuses anonymous callers", () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startRouter(anonymousRouter());
  });

  afterAll(async () => {
    await harness.close();
  });

  it("POST /api/reports answers 401, not 404", async () => {
    const res = await harness.request("/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: 1, reason: "Spam or scam" }),
    });

    expect(res.status).toBe(401);
    const payload = (await res.json()) as { error?: { code?: string } };
    expect(payload.error?.code).toBe("UNAUTHENTICATED");
  });
});

describe("a report names exactly one target", () => {
  const reason = "Spam or scam";

  it("accepts a single target of any kind", () => {
    for (const body of [
      { productId: 1, reason },
      { reportedUserId: 2, reason },
      { reviewId: 3, reason },
      { messageId: 4, reason },
      { orderId: 5, reason },
      { rentalId: 6, reason },
    ]) {
      expect(reportInputSchema.safeParse(body).success, JSON.stringify(body)).toBe(true);
    }
  });

  it("refuses a report that names nothing", () => {
    expect(reportInputSchema.safeParse({ reason }).success).toBe(false);
  });

  it("refuses a report that names more than one thing", () => {
    expect(reportInputSchema.safeParse({ productId: 1, reportedUserId: 2, reason }).success).toBe(
      false,
    );
  });

  it("refuses a non-positive or fractional id", () => {
    expect(reportInputSchema.safeParse({ productId: 0, reason }).success).toBe(false);
    expect(reportInputSchema.safeParse({ productId: 1.5, reason }).success).toBe(false);
  });

  it("refuses a reason that is empty or longer than the column", () => {
    expect(reportInputSchema.safeParse({ productId: 1, reason: "" }).success).toBe(false);
    expect(reportInputSchema.safeParse({ productId: 1, reason: "x".repeat(33) }).success).toBe(
      false,
    );
  });

  it("refuses a field the report format does not define", () => {
    // `.strict()` is what stops a client smuggling a `status` or `reporterId` through.
    expect(reportInputSchema.safeParse({ productId: 1, reason, status: "RESOLVED" }).success).toBe(
      false,
    );
    expect(reportInputSchema.safeParse({ productId: 1, reason, reporterId: 99 }).success).toBe(
      false,
    );
  });
});

describe("the reporter is the session, never the request", () => {
  const source = readFileSync(join(ROOT, "server/routes/reports.ts"), "utf8");
  const code = stripComments(source);

  it("reads the file it is meant to be checking", () => {
    expect(source).toContain("reportsRoute.post(");
  });

  it("passes the session user's id into createReport", () => {
    expect(code).toContain("createReport(user.id");
  });

  it("reads no reporter-shaped field off the request", () => {
    const forbidden = /\b(reporterId|userId|authorId|actorId)\b/;
    const offenders = codeLines(code).filter(
      (line) => forbidden.test(line) && line.includes("c.req"),
    );
    expect(offenders).toEqual([]);
  });

  it("rate-limits report submission under its own budget", () => {
    expect(code).toContain('guarded("reports.create"');
    expect(RATE_LIMITS["reports.create"].limit).toBeGreaterThan(0);
  });
});
