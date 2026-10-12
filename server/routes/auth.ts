import { Router } from "../lib/http";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getCookie } from "../lib/http";
import { db } from "../db";
import { users } from "../schema";
import { fail, ok, HttpError } from "../lib/api";
import { rateLimit } from "../lib/rate-limit";
import { limitBody, emailAddress, trimmed } from "../lib/validation";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  applyProfileUpdate,
  clearAuthCookies,
  currentSessionId,
  deleteAllSessions,
  deleteOtherSessions,
  issueSession,
  listSessions,
  requireUser,
  revokeCurrentSession,
  revokeSessionById,
  rotateSession,
  selfEditableProfileFields,
  type SessionUser,
} from "../lib/auth";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  hashPassword,
  passwordIssues,
  verifyAndRehash,
  verifyPassword,
} from "../lib/password";
import {
  beginEnrolment,
  confirmEnrolment,
  disableMfa,
  getMfaRow,
  regenerateRecoveryCodes,
  unusedRecoveryCodeCount,
  verifyUserCode,
} from "../lib/mfa-service";
import { signMfaTicket, verifyMfaTicket } from "../lib/jwt";
import {
  lockoutState,
  recordLoginAttempt,
  recordSecurityEvent,
  requestIp,
  requestUserAgent,
} from "../lib/security-log";
import { consumeResetToken, issueResetToken } from "../lib/password-reset";
import { sendEmail } from "../lib/email";
import { resolveAccess } from "../lib/permissions";
import { SYSTEM_ROLES } from "../lib/enums";
import { notificationEventKey } from "../lib/notification-events";
import { notify } from "../lib/notifications";

export const auth = new Router();

/* --------------------------------- schemas --------------------------------- */

/**
 * Password rules, shared by registration, reset and change.
 *
 * One definition, because the flows must never disagree. The length bound is the
 * boundary check; the blocklist and email-similarity checks run in
 * `assertPassword`, because they need the address and a 400 with every reason.
 */
const passwordRules = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, "Password is too long");

const registerSchema = z
  .object({
    name: trimmed(2, 80),
    email: emailAddress,
    password: passwordRules,
  })
  .strict();

const loginSchema = z
  .object({
    email: emailAddress,
    password: z.string().min(1),
  })
  .strict();

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: passwordRules,
  })
  .strict();

const forgotPasswordSchema = z
  .object({
    email: emailAddress,
  })
  .strict();

const resetPasswordSchema = z
  .object({
    token: z.string().trim().min(10),
    newPassword: passwordRules,
  })
  .strict();

const mfaChallengeSchema = z
  .object({
    ticket: z.string().min(10),
    code: z.string().trim().min(6).max(20),
  })
  .strict();

const mfaCodeSchema = z.object({ code: z.string().trim().min(6).max(20) }).strict();

const mfaDisableSchema = z
  .object({
    password: z.string().min(1),
    code: z.string().trim().min(6).max(20),
  })
  .strict();

const passwordOnlySchema = z.object({ password: z.string().min(1) }).strict();

/** Throw a 400 naming every policy problem at once. */
function assertPassword(password: string, context?: { email?: string }): void {
  const issues = passwordIssues(password, context);
  if (issues.length > 0) {
    throw new HttpError(400, "PASSWORD_TOO_WEAK", issues.join(". "));
  }
}

/** True when the account holds any staff role (coarse `ADMIN` or a `SYSTEM_ROLES` grant). */
async function isStaffUser(user: SessionUser): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  const access = await resolveAccess(user.id);
  return SYSTEM_ROLES.some((role) => access.roles.has(role));
}

export function publicUser(user: typeof users.$inferSelect, mfaEnabled = false) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    verified: user.verified,
    avatarUrl: user.avatarUrl,
    phone: user.phone,
    createdAt: user.createdAt,
    // PROMPT 3 — the client uses these to route a first login into the
    // change-password / enrol-MFA flow, and to render the security card.
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    mustEnrollMfa: user.mustEnrollMfa,
    mfaEnabled,
  };
}

/* --------------------------------- limits ---------------------------------- */

// Every auth endpoint is small by design: a name, an email, a password, a code.
// The global parser allows 2 MB; nothing here needs more than 32 KB, and an
// oversized auth body is itself a smell rather than a real request.
auth.use(limitBody(32 * 1024));

auth.use("/register", rateLimit("auth.register"));
auth.use("/login", rateLimit("auth.login"));
auth.use("/change-password", rateLimit("auth.password"));
auth.use("/refresh", rateLimit("auth.refresh"));
// The reset endpoints are unauthenticated and send mail / consume tokens, so they
// get the tight limits a "someone is grinding addresses" pattern deserves. They
// keep separate budgets because the two have different abuse shapes and costs.
auth.use("/forgot-password", rateLimit("auth.forgot"));
auth.use("/reset-password", rateLimit("auth.reset"));
auth.use("/mfa/challenge", rateLimit("auth.mfa"));
auth.use("/mfa/setup", rateLimit("auth.mfa"));
auth.use("/mfa/verify", rateLimit("auth.mfa"));
auth.use("/mfa/disable", rateLimit("auth.mfa"));
auth.use("/mfa/recovery-codes", rateLimit("auth.mfa"));
auth.use("/sessions", rateLimit("auth.sessions"));

/* ------------------------------------ csrf ---------------------------------- */

/**
 * `GET /api/auth/csrf` — hand the client a CSRF token to echo.
 *
 * The middleware in `lib/security.ts` issues the `revaro_csrf` cookie and echoes
 * the token in the `X-CSRF-Token` response header on every request, so this route
 * exists only so a cold page that is about to mutate something can prime that
 * header without reading the cookie jar (which client JavaScript deliberately
 * never does) and without racing its own first mutation.
 */
auth.get("/csrf", (c) => c.json(ok({ csrf: true })));

/* -------------------------------- register --------------------------------- */

auth.post("/register", async (c) => {
  const input = registerSchema.parse(await c.req.json());
  assertPassword(input.password, { email: input.email });

  const [existing] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  if (existing) {
    throw new HttpError(409, "EMAIL_TAKEN", "An account with this email already exists.");
  }

  const passwordHash = await hashPassword(input.password);
  // Registration always creates a plain USER — roles are never taken from the client.
  const [created] = await db
    .insert(users)
    .values({ name: input.name, email: input.email, passwordHash, role: "USER" })
    .$returningId();

  const [user] = await db.select().from(users).where(eq(users.id, created.id)).limit(1);
  if (!user) throw new HttpError(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");

  // Password-only accounts are "MFA satisfied" at session creation; an account with
  // a second factor will not be, and the challenge is what stamps it.
  await issueSession(c, user, { mfaVerified: true });

  await notify(db, {
    userId: user.id,
    type: "ACCOUNT_WELCOME",
    title: `Welcome to Revaro, ${user.name.split(" ")[0]}`,
    body: "Your account is ready. Save an item you like and we will keep an eye on it for you.",
    eventKey: notificationEventKey("ACCOUNT_WELCOME", user.id),
  });

  await recordSecurityEvent({
    userId: user.id,
    type: "LOGIN_SUCCESS",
    ip: requestIp(c),
    userAgent: requestUserAgent(c),
    details: { via: "register" },
  });

  return c.json(ok(publicUser(user, false)), 201);
});

/* ---------------------------------- login ---------------------------------- */

auth.post("/login", async (c) => {
  const input = loginSchema.parse(await c.req.json());
  const ip = requestIp(c);
  const userAgent = requestUserAgent(c);

  // Durable lockout, checked before the password is even looked at. A locked
  // attempt is *not* recorded: recording it would push the lockout window forward
  // on every request and let an attacker hold an account locked indefinitely.
  const lock = await lockoutState(input.email);
  if (lock.lockedUntil) {
    await recordSecurityEvent({
      type: "LOGIN_FAILURE",
      ip,
      userAgent,
      details: { reason: "rate_limited", retryAfterSeconds: lock.retryAfterSeconds },
    });
    throw new HttpError(
      429,
      "TOO_MANY_ATTEMPTS",
      `Too many sign-in attempts. Try again in ${lock.retryAfterSeconds} seconds.`,
    );
  }

  const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);

  // Verify even when no user was found? No — there is no hash to compare. The
  // response is identical either way, which is what prevents enumeration.
  const verification = user ? await verifyAndRehash(input.password, user.passwordHash) : null;

  if (!user || !verification?.ok) {
    const reason = user ? "bad_password" : "no_such_user";
    await recordLoginAttempt({
      identifier: input.email,
      userId: user?.id ?? null,
      ip,
      userAgent,
      success: false,
      failureReason: reason,
    });
    await recordSecurityEvent({
      userId: user?.id ?? null,
      type: "LOGIN_FAILURE",
      ip,
      userAgent,
      details: { reason },
    });
    return c.json(fail("INVALID_CREDENTIALS", "Email or password is incorrect."), 401);
  }

  // Transparent upgrade of a legacy bcrypt (or old-parameter scrypt) hash. The
  // password is in hand only here, so this is the one moment it can be rehashed.
  if (verification.upgradedHash) {
    await db
      .update(users)
      .set({ passwordHash: verification.upgradedHash, updatedAt: new Date() })
      .where(eq(users.id, user.id));
  }

  // Suspension is checked *after* the password verifies, so the endpoint cannot be
  // used to discover which accounts are suspended without knowing the password.
  if (user.status !== "ACTIVE") {
    await recordLoginAttempt({
      identifier: input.email,
      userId: user.id,
      ip,
      userAgent,
      success: false,
      failureReason: "account_suspended",
    });
    await recordSecurityEvent({ userId: user.id, type: "LOGIN_FAILURE", ip, userAgent, details: { reason: "account_suspended" } });
    throw new HttpError(403, "ACCOUNT_SUSPENDED", "This account is suspended.");
  }

  const mfaRow = await getMfaRow(user.id);
  const hadSession = Boolean(
    getCookie(c, ACCESS_TOKEN_COOKIE) || getCookie(c, REFRESH_TOKEN_COOKIE),
  );

  if (mfaRow?.enabledAt) {
    // Password is the first factor; the second is the challenge. No session is
    // created yet, so a stolen password alone buys nothing.
    const ticket = await signMfaTicket({ userId: user.id });
    return c.json(ok({ mfaRequired: true, ticket }));
  }

  await issueSession(c, user, { mfaVerified: true });
  await recordLoginAttempt({
    identifier: input.email,
    userId: user.id,
    ip,
    userAgent,
    success: true,
  });
  await recordSecurityEvent({ userId: user.id, type: "LOGIN_SUCCESS", ip, userAgent });

  if (!hadSession) {
    const today = new Date().toISOString().slice(0, 10);
    await notify(db, {
      userId: user.id,
      type: "LOGIN_NEW_DEVICE",
      title: "New sign-in",
      body: "Your account was just signed in to from a new browser or device. If this wasn't you, change your password.",
      eventKey: notificationEventKey("LOGIN_NEW_DEVICE", user.id, today),
    });
  }

  return c.json(ok(publicUser(user, false)));
});

/* ------------------------------ MFA challenge ------------------------------ */

/**
 * `POST /auth/mfa/challenge`
 *
 * The second half of a sign-in for an account with MFA enabled. It consumes the
 * ticket minted by a correct password and, on a valid TOTP or unused recovery code,
 * creates the session. A wrong code is a 401 and a `MFA_CHALLENGE_FAILED` event, not
 * a login attempt, so a slow authenticator cannot lock the account out.
 */
auth.post("/mfa/challenge", async (c) => {
  const input = mfaChallengeSchema.parse(await c.req.json());
  const userId = await verifyMfaTicket(input.ticket);
  if (!userId) {
    throw new HttpError(401, "MFA_TICKET_INVALID", "That sign-in attempt has expired. Please sign in again.");
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.status !== "ACTIVE") {
    throw new HttpError(403, "ACCOUNT_SUSPENDED", "This account is suspended.");
  }

  const ip = requestIp(c);
  const userAgent = requestUserAgent(c);
  const result = await verifyUserCode(user.id, input.code);
  if (!result.ok) {
    await recordSecurityEvent({
      userId: user.id,
      type: "MFA_CHALLENGE_FAILED",
      ip,
      userAgent,
      details: { reason: result.reason },
    });
    return c.json(fail("INVALID_MFA_CODE", "That code is not valid."), 401);
  }

  const hadSession = Boolean(
    getCookie(c, ACCESS_TOKEN_COOKIE) || getCookie(c, REFRESH_TOKEN_COOKIE),
  );
  await issueSession(c, user, { mfaVerified: true });
  await recordLoginAttempt({ identifier: user.email, userId: user.id, ip, userAgent, success: true });
  await recordSecurityEvent({
    userId: user.id,
    type: result.method === "recovery" ? "RECOVERY_CODE_USED" : "MFA_CHALLENGE_PASSED",
    ip,
    userAgent,
  });

  if (!hadSession) {
    const today = new Date().toISOString().slice(0, 10);
    await notify(db, {
      userId: user.id,
      type: "LOGIN_NEW_DEVICE",
      title: "New sign-in",
      body: "Your account was just signed in to from a new browser or device. If this wasn't you, change your password.",
      eventKey: notificationEventKey("LOGIN_NEW_DEVICE", user.id, today),
    });
  }

  return c.json(ok(publicUser(user, true)));
});

/* --------------------------------- logout ---------------------------------- */

auth.post("/logout", async (c) => {
  const user = c.get("user");
  await revokeCurrentSession(c);
  if (user) {
    await recordSecurityEvent({ userId: user.id, type: "SESSION_REVOKED", ip: requestIp(c), userAgent: requestUserAgent(c), details: { scope: "current" } });
  }
  return c.json(ok({ loggedOut: true }));
});

auth.post("/refresh", async (c) => {
  const user = await rotateSession(c);
  return c.json(ok(publicUser(user, await isMfaEnabledFor(user.id))));
});

auth.post("/logout-all", async (c) => {
  const user = requireUser(c);
  const revokedSessions = await deleteAllSessions(user.id);
  clearAuthCookies(c);
  await recordSecurityEvent({ userId: user.id, type: "SESSION_REVOKED", ip: requestIp(c), userAgent: requestUserAgent(c), details: { scope: "all", revokedSessions } });
  return c.json(ok({ loggedOut: true, revokedSessions }));
});

async function isMfaEnabledFor(userId: number): Promise<boolean> {
  const row = await getMfaRow(userId);
  return row?.enabledAt !== null && row?.enabledAt !== undefined;
}

/* ------------------------------- password reset ---------------------------- */

/**
 * `POST /auth/forgot-password`
 *
 * Always answers `{ sent: true }` — whether or not the address exists. The one
 * difference is invisible to the caller: an existing, active account gets a token
 * and an email. That is the whole no-enumeration property; a 404 here would turn
 * the endpoint into an address oracle.
 */
auth.post("/forgot-password", async (c) => {
  const input = forgotPasswordSchema.parse(await c.req.json());
  const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);

  if (user && user.status === "ACTIVE") {
    const { rawToken } = await issueResetToken(user.id, requestIp(c));
    const base = process.env.APP_URL?.trim() || "http://localhost:5173";
    const link = `${base}/reset-password?token=${rawToken}`;
    // The body is plain text delivered through the provider-independent mailer;
    // with no provider configured that degrades to a console capture in dev and a
    // silent discard in production — either way the endpoint still answers the same.
    const recipientName = user.name.replace(/[<>&]/g, "");
    await sendEmail({
      to: user.email,
      subject: "Reset your Revaro password",
      body:
        `Hi ${recipientName},\n\n` +
        `Someone asked to reset the password for this account. If that was you, open this link:\n\n` +
        `${link}\n\n` +
        `The link expires in an hour and can be used once. If you did not ask, you can ignore this message.\n\n` +
        `— the Revaro team`,
      template: "PASSWORD_RESET",
    });
    await recordSecurityEvent({ userId: user.id, type: "PASSWORD_RESET_REQUESTED", ip: requestIp(c), userAgent: requestUserAgent(c) });
  }

  return c.json(ok({ sent: true }));
});

/**
 * `POST /auth/reset-password`
 *
 * Spends a token, writes the new scrypt hash and ends every session. The token is
 * single-use and expiring; a replayed or stale one is refused with the same generic
 * message so a probe learns nothing about which tokens existed.
 */
auth.post("/reset-password", async (c) => {
  const input = resetPasswordSchema.parse(await c.req.json());
  assertPassword(input.newPassword);

  const passwordHash = await hashPassword(input.newPassword);
  const result = await consumeResetToken(input.token, passwordHash);
  if (!result.ok) {
    throw new HttpError(
      400,
      "RESET_LINK_INVALID",
      "This reset link is invalid or has expired. Request a new one.",
    );
  }
  clearAuthCookies(c);
  await recordSecurityEvent({ userId: result.userId, type: "PASSWORD_CHANGED", ip: requestIp(c), userAgent: requestUserAgent(c), details: { via: "reset" } });
  return c.json(ok({ reset: true }));
});

/* ------------------------------ change password ---------------------------- */

auth.post("/change-password", async (c) => {
  const user = requireUser(c);
  const input = changePasswordSchema.parse(await c.req.json());
  assertPassword(input.newPassword);

  const [row] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (!row) throw new HttpError(404, "NOT_FOUND", "Account not found.");

  if (!(await verifyPassword(input.currentPassword, row.passwordHash))) {
    throw new HttpError(401, "WRONG_PASSWORD", "Your current password is incorrect.");
  }

  const passwordHash = await hashPassword(input.newPassword);
  await db
    .update(users)
    .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  const revokedSessions = await deleteOtherSessions(user.id, await currentSessionId(c));
  console.log(
    `[auth] password changed for user ${user.id}; ${revokedSessions} other session(s) revoked`,
  );

  await recordSecurityEvent({ userId: user.id, type: "PASSWORD_CHANGED", ip: requestIp(c), userAgent: requestUserAgent(c), details: { revokedSessions } });

  await notify(db, {
    userId: user.id,
    type: "ACCOUNT_PASSWORD_CHANGED",
    title: "Your password was changed",
    body:
      revokedSessions > 0
        ? `We signed out ${revokedSessions} other session${revokedSessions === 1 ? "" : "s"} so nobody else keeps access. If this wasn't you, contact support.`
        : "If this wasn't you, contact support right away.",
    relatedEntityType: "ACCOUNT",
    relatedEntityId: user.id,
    eventKey: `ACCOUNT_PASSWORD_CHANGED:${user.id}:${passwordHash.slice(-16)}`,
  });

  return c.json(ok({ changed: true, revokedSessions }));
});

/* ---------------------------------- me ------------------------------------- */

auth.get("/me", (c) => {
  const user = requireUser(c);
  return c.json(ok(user));
});

auth.patch("/me", async (c) => {
  const user = requireUser(c);
  const input = selfEditableProfileFields.strict().parse(await c.req.json());
  const updated = await applyProfileUpdate(user.id, input);
  return c.json(ok(publicUser(updated, user.mfaEnabled)));
});

/* ------------------------------- my sessions ------------------------------- */

auth.get("/sessions", async (c) => {
  const user = requireUser(c);
  const current = await currentSessionId(c);
  const rows = await listSessions(user.id);
  return c.json(ok(rows.map((row) => ({ ...row, current: row.id === current }))));
});

auth.delete("/sessions/:id", async (c) => {
  const user = requireUser(c);
  const sessionId = c.req.param("id");
  const revoked = await revokeSessionById(user.id, sessionId);
  if (!revoked) throw new HttpError(404, "NOT_FOUND", "That session no longer exists.");

  const current = await currentSessionId(c);
  if (current === sessionId) clearAuthCookies(c);
  await recordSecurityEvent({ userId: user.id, type: "SESSION_REVOKED", ip: requestIp(c), userAgent: requestUserAgent(c), details: { sessionId } });
  return c.json(ok({ revoked: true }));
});

/* ----------------------------------- MFA ----------------------------------- */

auth.get("/mfa/status", async (c) => {
  const user = requireUser(c);
  const row = await getMfaRow(user.id);
  return c.json(
    ok({
      enabled: row?.enabledAt !== null && row?.enabledAt !== undefined,
      mustEnrollMfa: user.mustEnrollMfa,
      recoveryCodesRemaining: await unusedRecoveryCodeCount(user.id),
    }),
  );
});

auth.post("/mfa/setup", async (c) => {
  const user = requireUser(c);
  const { secret, otpauthUrl } = await beginEnrolment(user.id, user.email);
  // The secret is returned exactly once, to the browser that is enrolling. It is
  // never logged and never stored in plaintext.
  return c.json(ok({ secret, otpauthUrl }));
});

auth.post("/mfa/verify", async (c) => {
  const user = requireUser(c);
  const { code } = mfaCodeSchema.parse(await c.req.json());
  try {
    const { recoveryCodes } = await confirmEnrolment(user.id, code);
    await recordSecurityEvent({ userId: user.id, type: "MFA_ENABLED", ip: requestIp(c), userAgent: requestUserAgent(c) });
    return c.json(ok({ enabled: true, recoveryCodes }));
  } catch {
    return c.json(fail("INVALID_MFA_CODE", "That code is not valid. Check your authenticator and try again."), 400);
  }
});

auth.post("/mfa/disable", async (c) => {
  const user = requireUser(c);
  const input = mfaDisableSchema.parse(await c.req.json());

  const [row] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (!row || !(await verifyPassword(input.password, row.passwordHash))) {
    throw new HttpError(401, "WRONG_PASSWORD", "Your password is incorrect.");
  }
  const result = await verifyUserCode(user.id, input.code);
  if (!result.ok) return c.json(fail("INVALID_MFA_CODE", "That code is not valid."), 400);

  await disableMfa(user.id);
  // Staff must keep a second factor: disabling is allowed, but the account is
  // immediately flagged to enrol again, so the admin gate stays closed until it does.
  const staff = await isStaffUser(user);
  if (staff) await db.update(users).set({ mustEnrollMfa: true }).where(eq(users.id, user.id));
  await recordSecurityEvent({ userId: user.id, type: "MFA_DISABLED", ip: requestIp(c), userAgent: requestUserAgent(c) });
  return c.json(ok({ enabled: false, mustEnrollMfa: staff }));
});

auth.post("/mfa/recovery-codes", async (c) => {
  const user = requireUser(c);
  const { password } = passwordOnlySchema.parse(await c.req.json());
  const [row] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (!row || !(await verifyPassword(password, row.passwordHash))) {
    throw new HttpError(401, "WRONG_PASSWORD", "Your password is incorrect.");
  }
  try {
    const recoveryCodes = await regenerateRecoveryCodes(user.id);
    return c.json(ok({ recoveryCodes }));
  } catch {
    return c.json(fail("MFA_NOT_ENABLED", "Enable two-factor authentication first."), 400);
  }
});
