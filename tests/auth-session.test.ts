import { afterAll, describe, expect, it } from "vitest";
import { onErrorHandler } from "../server/lib/api";
import { SESSION_USER_KEY, type SessionUser } from "../server/lib/auth";
import { Router } from "../server/lib/http";
import { auth } from "../server/routes/auth";
import { startRouter, type Harness } from "./support/http-harness";

/**
 * The account endpoints' *refusals*.
 *
 * ## What is actually being asserted
 *
 * Every assertion here is decided before a handler body reaches the database: `requireUser`
 * runs on the way in, and the request schema parses immediately after it. That is
 * deliberate — these are the properties that must hold regardless of what data exists, so
 * the suite needs no database and cannot pass or fail because of a seeded row.
 *
 * The three properties that matter:
 *
 *  1. **No session, no account mutation.** `PATCH /auth/me` and
 *     `POST /auth/change-password` are 401 for an anonymous caller. The alternative — a
 *     profile endpoint that trusts a user id in the body — is the whole bug class this
 *     file exists to keep closed.
 *  2. **A role cannot be written from the browser.** The profile schema is a *whitelist*.
 *     Sending `role` alongside a valid `name` is a 400, not a silent no-op, so a caller
 *     that believes it promoted itself finds out immediately rather than assuming it did.
 *  3. **Nothing internal leaks.** No stack, no file path, no SQL in a refusal body.
 */

function sessionUser(role: SessionUser["role"] = "USER"): SessionUser {
  return {
    id: 42,
    role,
    name: "Test User",
    email: "user@revaro.local",
    verified: true,
    avatarUrl: null,
  };
}

function routerAs(user: SessionUser | null): Router {
  const router = new Router();
  router.onError(onErrorHandler);
  router.use(async (c, next) => {
    if (user) c.set(SESSION_USER_KEY, user);
    await next();
  });
  router.route("/", auth);
  return router;
}

const anonymous = startRouter(routerAs(null));
const asUser = startRouter(routerAs(sessionUser("USER")));
const asAdmin = startRouter(routerAs(sessionUser("ADMIN")));

afterAll(async () => {
  await (await anonymous).close();
  await (await asUser).close();
  await (await asAdmin).close();
});

function post(harness: Promise<Harness>, path: string, body: unknown) {
  return harness.then((h) =>
    h.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function patch(harness: Promise<Harness>, path: string, body: unknown) {
  return harness.then((h) =>
    h.request(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("the account endpoints without a session", () => {
  it("refuses a profile edit with 401", async () => {
    const response = await patch(anonymous, "/me", { name: "New Name" });
    expect(response.status).toBe(401);
  });

  it("refuses a password change with 401", async () => {
    const response = await post(anonymous, "/change-password", {
      currentPassword: "whatever-it-was",
      newPassword: "a-new-password",
    });
    expect(response.status).toBe(401);
  });

  it("does not confirm or deny whether a password was right", async () => {
    // The refusal must be about the *session*, not the credential. Answering "that
    // password is wrong" to an anonymous caller would turn this endpoint into an oracle
    // for testing passwords against real accounts.
    const body = await (
      await post(anonymous, "/change-password", {
        currentPassword: "guess",
        newPassword: "another-guess",
      })
    ).json();

    expect(body.error?.code).toBe("UNAUTHENTICATED");
    expect(String(body.error?.message)).not.toMatch(/password is incorrect|wrong/i);
  });
});

describe("a profile edit cannot change what the account *is*", () => {
  it("rejects `role` even alongside a legitimate field", async () => {
    // The shape an actual privilege-escalation attempt takes: a valid edit, with the one
    // field that matters smuggled in beside it.
    const response = await patch(asUser, "/me", { name: "Escalated", role: "ADMIN" });

    expect(response.status).toBe(400);
    expect((await response.json()).error?.code).toBe("VALIDATION_ERROR");
  });

  it("rejects `verified`", async () => {
    const response = await patch(asUser, "/me", { name: "Verified By Me", verified: true });
    expect(response.status).toBe(400);
  });

  it("rejects `passwordHash`", async () => {
    // The one field that must never arrive from a browser at all. `.strict()` refuses it
    // rather than stripping it, so a client cannot believe it set a hash.
    const response = await patch(asUser, "/me", {
      name: "Hashed",
      passwordHash: "$2b$12$notarealhashatallnotarealhashatallnotarealhash",
    });
    expect(response.status).toBe(400);
  });

  it("rejects `id` — the actor comes from the session, never the body", async () => {
    const response = await patch(asUser, "/me", { name: "Someone Else", id: 1 });
    expect(response.status).toBe(400);
  });

  it("rejects an admin's attempt to change their own role too", async () => {
    // Self-demotion is not a risk, but it is the same rule: there is no path from this
    // endpoint to the `role` column at all, for any role.
    const response = await patch(asAdmin, "/me", { name: "Still Admin", role: "USER" });
    expect(response.status).toBe(400);
  });
});

describe("the password-change payload", () => {
  it("rejects an unknown key rather than ignoring it", async () => {
    // `newPasswordConfirm` is checked in the form. If this endpoint silently accepted it,
    // a client could reasonably believe the confirmation was enforced *here* — and it
    // would not be.
    const response = await post(asUser, "/change-password", {
      currentPassword: "old-password",
      newPassword: "new-password",
      newPasswordConfirm: "new-password",
    });
    expect(response.status).toBe(400);
  });

  it("requires a current password", async () => {
    const response = await post(asUser, "/change-password", { newPassword: "new-password" });
    expect(response.status).toBe(400);
  });
});

describe("refusal bodies stay free of internals", () => {
  it("exposes no stack, path or SQL", async () => {
    const body = await (
      await patch(asUser, "/me", { name: "X", role: "ADMIN" })
    ).text();

    expect(body).not.toMatch(/\/server\/|\.ts:\d+|SELECT |INSERT |stack|DrizzleQueryError/i);
  });
});