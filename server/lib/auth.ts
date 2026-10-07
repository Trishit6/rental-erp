import { and, eq, gt, isNull, not } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { z } from "zod";
import { db } from "../db";
import { sessions, users } from "../schema";
import { HttpError } from "./api";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_REUSE_GRACE_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  isProduction,
} from "./env";
import {
  deleteCookie,
  getCookie,
  setCookie,
  type CookieOptions,
  type Ctx,
  type Next,
} from "./http";
import { signAccessToken, verifyAccessToken, type AccessTokenClaims } from "./jwt";

/**
 * Sessions: JWT access tokens, opaque refresh tokens, and one row per device.
 *
 * ## The shape of a sign-in
 *
 * ```text
 * login ──► sessions row ──► access JWT  (15 min, HttpOnly cookie)
 *                          └─ refresh token (7 days, HttpOnly cookie, SHA-256 in the row)
 * ```
 *
 * Neither cookie is readable by JavaScript — not by the app, not by a script
 * injected into it. The client's entire idea of "who am I" is `GET /auth/me`,
 * which the browser answers by attaching the cookie on its own.
 *
 * ## Why the database is still involved at all
 *
 * A signed JWT could be verified on its own, and that is exactly the problem:
 * with only a signature there is nothing to revoke. A stolen token would stay
 * valid until it expired, the user's only recourse being to change a password
 * and hope the thief had not already acted. Every request here therefore checks
 * the token *and* the session row it names — so "sign out this device", "sign out
 * everywhere" and "this refresh token was replayed, kill it" all take effect on
 * the next request rather than in fifteen minutes.
 *
 * ## The three invariants this module exists to hold
 *
 *  1. **Raw refresh tokens never touch the database.** The row stores SHA-256;
 *     the plaintext lives only in an HttpOnly cookie. A dump of `sessions` is
 *     useless as a credential.
 *  2. **A refresh token is single-use.** Rotation moves the presented hash to
 *     `previousRefreshTokenHash` and writes a new one, so a replayed cookie is
 *     recognisable as a replay rather than silently accepted (see
 *     `classifyRefreshToken`).
 *  3. **The client never sees a token.** Nothing here returns one; every caller
 *     gets a cookie set on its behalf and a sanitized user row back.
 */

/* --------------------------------- cookies --------------------------------- */

/**
 * Cookie names, defined once.
 *
 * The client must never mention them: `document.cookie` cannot read an HttpOnly
 * cookie anyway, so any client reference to these names is either dead code or
 * an attempt to do something the browser will refuse. `no-client-secrets` in the
 * test suite enforces that mechanically.
 */
export const ACCESS_TOKEN_COOKIE = "revaro_access_token";
export const REFRESH_TOKEN_COOKIE = "revaro_refresh_token";
/** The retired pre-JWT cookie. Still cleared on logout so an old browser loses it. */
export const LEGACY_SESSION_COOKIE = "revaro_session";

/** `Secure` in production; overridable to `Secure` early (a TLS-terminating dev proxy). */
function cookieSecure(): boolean {
  return isProduction() || process.env.AUTH_COOKIE_SECURE === "true";
}

/**
 * Both cookies share these three attributes, and the reasons are the same for
 * each:
 *
 *  - `httpOnly` — no script can read the value. This is the whole reason a token
 *    in a cookie is not a token in `localStorage`.
 *  - `sameSite: "Lax"` — not sent on cross-site POSTs, which is the browser-side
 *    half of CSRF protection for exactly the state-changing requests that need
 *    it. `Strict` would break the one thing a cookie-authenticated app needs from
 *    a top-level navigation: arriving at a link while signed in.
 *  - `path: "/"` — the API is mounted under `/api` but the browser decides
 *    cookie scope before the proxy, so anything narrower risks a request that
 *    arrives without its credential.
 *
 * `secure` is the environment-dependent one: `false` under local HTTP (a browser
 * silently drops a `Secure` cookie on `http://localhost`, which looks like "the
 * login did nothing"), `true` in production, and forceable to `true` anywhere via
 * `AUTH_COOKIE_SECURE` for a dev proxy that already terminates TLS.
 */
function baseCookieOptions(maxAgeSeconds: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: maxAgeSeconds,
    secure: cookieSecure(),
  };
}

/** The access cookie: short-lived, so its `Max-Age` matches the JWT's own `exp`. */
export function accessTokenCookieOptions(): CookieOptions {
  return baseCookieOptions(ACCESS_TOKEN_TTL_SECONDS);
}

/** The refresh cookie: the long-lived half, expired by the browser on its own schedule. */
export function refreshTokenCookieOptions(): CookieOptions {
  return baseCookieOptions(REFRESH_TOKEN_TTL_SECONDS);
}

/**
 * Forget every authentication cookie this API has ever set.
 *
 * Three clears, not two: a browser that signed in before the JWT migration
 * still holds `revaro_session`, and a logout that leaves it behind means the
 * "signed out" state is a lie the moment anything still reads that name.
 */
export function clearAuthCookies(c: Ctx): void {
  deleteCookie(c, ACCESS_TOKEN_COOKIE, { path: "/" });
  deleteCookie(c, REFRESH_TOKEN_COOKIE, { path: "/" });
  deleteCookie(c, LEGACY_SESSION_COOKIE, { path: "/" });
}

/* --------------------------------- tokens --------------------------------- */

/** SHA-256, hex-encoded — the form a refresh token is stored and looked up in. */
export function hashRefreshToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** A fresh opaque refresh token. 32 random bytes; the hex form is what the cookie holds. */
function newRefreshToken(): string {
  return randomBytes(32).toString("hex");
}

/** A session id. Random rather than derived from anything about the user or the token. */
function newSessionId(): string {
  return randomBytes(16).toString("hex");
}

/* --------------------------------- users ---------------------------------- */

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  verified: boolean;
  avatarUrl: string | null;
};

function toSessionUser(user: typeof users.$inferSelect): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    verified: user.verified,
    avatarUrl: user.avatarUrl,
  };
}

/* ------------------------------ session lifecycle -------------------------- */

/**
 * Create a session and arm both cookies.
 *
 * One call for register, login and refresh: the three flows must be
 * indistinguishable on the wire (same cookies, same claims, same session row
 * shape), and three copies of this is how they drift.
 */
export async function issueSession(c: Ctx, user: { id: number; role: string }): Promise<string> {
  const sessionId = newSessionId();
  const refreshToken = newRefreshToken();

  await db.insert(sessions).values({
    id: sessionId,
    userId: user.id,
    refreshTokenHash: hashRefreshToken(refreshToken),
    rotatedAt: new Date(),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
  });

  await setAuthCookies(c, { sessionId, userId: user.id, role: user.role, refreshToken });
  return sessionId;
}

/** Sign the access token and write both cookies. Never writes a token to a response body. */
async function setAuthCookies(
  c: Ctx,
  input: { sessionId: string; userId: number; role: string; refreshToken: string },
): Promise<void> {
  const accessToken = await signAccessToken({
    userId: input.userId,
    sessionId: input.sessionId,
    role: input.role,
  });
  setCookie(c, ACCESS_TOKEN_COOKIE, accessToken, accessTokenCookieOptions());
  setCookie(c, REFRESH_TOKEN_COOKIE, input.refreshToken, refreshTokenCookieOptions());
}

/**
 * What a presented refresh token means for the session it claims to belong to.
 *
 * Pure, and worth being pure: these are the four cases that decide whether a
 * browser stays signed in, gets a new credential, or gets the session killed —
 * and only one of them can be exercised end-to-end by hand.
 *
 *  - **rotate** — this is the session's current token. Normal refresh.
 *  - **grace**  — the token *just* rotated away. Two tabs of one browser share a
 *    cookie jar, so an expiring access token wakes both and both refresh before
 *    either response lands. Rotating again keeps the second tab alive; the
 *    browser's single jar means the first tab picks up the newest token anyway.
 *  - **reuse**  — a rotated-away token presented after the grace window. Either
 *    a stolen cookie or a very stale client, and both are answered the same way:
 *    the session dies, because the only safe assumption is that the credential
 *    is in someone else's hands.
 *  - **reject** — not this session's token at all (an orphaned, or a
 *    two-generations-old cookie). Refused without touching the session: an
 *    unknown token is not evidence that the real one leaked.
 */
export type RefreshDecision = "rotate" | "grace" | "reuse" | "reject";

export function classifyRefreshToken(input: {
  presentedHash: string;
  currentHash: string | null;
  previousHash: string | null;
  revokedAt: Date | null;
  expiresAt: Date;
  rotatedAt: Date | null;
  now: Date;
  graceSeconds?: number;
}): RefreshDecision {
  if (input.revokedAt) return "reject";
  if (input.expiresAt.getTime() <= input.now.getTime()) return "reject";
  if (input.currentHash && input.currentHash === input.presentedHash) return "rotate";
  if (input.previousHash && input.previousHash === input.presentedHash) {
    const rotatedAt = input.rotatedAt?.getTime();
    const grace = (input.graceSeconds ?? REFRESH_REUSE_GRACE_SECONDS) * 1000;
    if (rotatedAt !== undefined && input.now.getTime() - rotatedAt <= grace) return "grace";
    return "reuse";
  }
  return "reject";
}

/**
 * Exchange the refresh cookie for a new pair of cookies and the session's user.
 *
 * ## Why this is where the reuse alarm lives
 *
 * Rotation alone is not enough: a replay would simply be refused, and the owner
 * of the stolen cookie and the owner of the real one would both keep trying
 * against a session that quietly still works. Detecting the replay and *killing
 * the session* is what turns an unknown party's credential into a known-bad one,
 * and it is the reason the previous hash is retained at all.
 *
 * ## Why the errors say nothing about which case failed
 *
 * "No such cookie", "expired" and "replay detected" are three sentences the
 * requester is not entitled to. They are collapsed into one: this browser is not
 * signed in any more. The distinction *is* recorded — the session id, never the
 * token — in the server log, which is where an operator investigating a real
 * replay needs it.
 */
export async function rotateSession(c: Ctx): Promise<typeof users.$inferSelect> {
  const presented = getCookie(c, REFRESH_TOKEN_COOKIE);
  if (!presented) {
    throw new HttpError(401, "SESSION_EXPIRED", "Your session has expired. Please sign in again.");
  }

  const presentedHash = hashRefreshToken(presented);
  const now = new Date();

  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.refreshTokenHash, presentedHash))
    .limit(1);

  if (!session) {
    // Not the current token. Either a rotated-away one, or not ours at all.
    const [previous] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.previousRefreshTokenHash, presentedHash))
      .limit(1);

    const decision = previous
      ? classifyRefreshToken({
          presentedHash,
          currentHash: previous.refreshTokenHash,
          previousHash: previous.previousRefreshTokenHash,
          revokedAt: previous.revokedAt,
          expiresAt: previous.expiresAt,
          rotatedAt: previous.rotatedAt,
          now,
        })
      : "reject";

    if (decision === "grace" && previous) {
      // Two tabs refreshed at once. Rotate again and let the browser's single
      // cookie jar settle on the newest token — nobody is signed out.
      const user = await rotateFromRow(c, previous, presentedHash, now);
      if (user) return user;
    }

    if (decision === "reuse" && previous) {
      // Revoked by *timestamp* rather than deleted: this row is now evidence.
      await db.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, previous.id));
      console.warn(
        `[auth] refresh token reuse detected; revoked session ${previous.id} for user ${previous.userId}`,
      );
    }

    clearAuthCookies(c);
    throw new HttpError(401, "SESSION_EXPIRED", "Your session has expired. Please sign in again.");
  }

  const decision = classifyRefreshToken({
    presentedHash,
    currentHash: session.refreshTokenHash,
    previousHash: session.previousRefreshTokenHash,
    revokedAt: session.revokedAt,
    expiresAt: session.expiresAt,
    rotatedAt: session.rotatedAt,
    now,
  });

  if (decision !== "rotate") {
    clearAuthCookies(c);
    throw new HttpError(401, "SESSION_EXPIRED", "Your session has expired. Please sign in again.");
  }

  const user = await rotateFromRow(c, session, presentedHash, now);
  if (!user) {
    clearAuthCookies(c);
    throw new HttpError(401, "SESSION_EXPIRED", "Your session has expired. Please sign in again.");
  }
  return user;
}

/**
 * Write the rotation: new hash in, presented hash demoted to "previous", expiry
 * pushed out, and both cookies re-armed.
 *
 * The account row is re-read rather than trusted from the token, so a role change
 * or a deletion made since sign-in is reflected in the very next refresh.
 */
async function rotateFromRow(
  c: Ctx,
  session: typeof sessions.$inferSelect,
  presentedHash: string,
  now: Date,
): Promise<typeof users.$inferSelect | null> {
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user) {
    // The account is gone; the session is a pointer to nothing.
    await db.delete(sessions).where(eq(sessions.id, session.id));
    return null;
  }

  const refreshToken = newRefreshToken();
  await db
    .update(sessions)
    .set({
      refreshTokenHash: hashRefreshToken(refreshToken),
      previousRefreshTokenHash: presentedHash,
      rotatedAt: now,
      lastUsedAt: now,
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    })
    .where(eq(sessions.id, session.id));

  await setAuthCookies(c, {
    sessionId: session.id,
    userId: user.id,
    role: user.role,
    refreshToken,
  });
  return user;
}

/**
 * Revoke the session this request authenticated with, then clear the cookies.
 *
 * The session id comes from the access token when it verifies — the credential
 * the browser just used, and the most precise answer to "which session is
 * logging out". The refresh cookie is the fallback for the case where the access
 * token has already expired: a user who lets the tab sit for an hour and then
 * signs out must not leave a live session behind simply because their access
 * token lapsed first.
 */
export async function revokeCurrentSession(c: Ctx): Promise<void> {
  const claims = await readAccessClaims(c);
  if (claims) {
    await db.delete(sessions).where(eq(sessions.id, claims.sid));
  } else {
    const presented = getCookie(c, REFRESH_TOKEN_COOKIE);
    if (presented) {
      await db.delete(sessions).where(eq(sessions.refreshTokenHash, hashRefreshToken(presented)));
    }
  }
  clearAuthCookies(c);
}

/**
 * The session this request is riding on, if any.
 *
 * `null` means "no usable access token" — which includes an expired one, so a
 * caller that revokes the *other* sessions with this as the session to keep may
 * occasionally keep nothing. That is the correct direction to fail: revoking one
 * session too many is a signed-out user, and revoking one too few is an attacker
 * who just watched the victim change their password.
 */
export async function currentSessionId(c: Ctx): Promise<string | null> {
  const claims = await readAccessClaims(c);
  if (!claims) return null;
  const [session] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.id, claims.sid),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return session?.id ?? null;
}

/** Verify the access cookie without touching the database. */
async function readAccessClaims(c: Ctx): Promise<AccessTokenClaims | null> {
  const token = getCookie(c, ACCESS_TOKEN_COOKIE);
  if (!token) return null;
  return verifyAccessToken(token);
}

/* -------------------------------- middleware ------------------------------- */

/** Key that `attachUser` publishes the resolved session under. */
export const SESSION_USER_KEY = "user";

/**
 * Resolve the session for every request, from the access cookie alone.
 *
 * Three checks, in the order they can cheaply fail:
 *
 *  1. the JWT verifies — signature, issuer, expiry;
 *  2. the session it names exists, is not revoked and has not expired;
 *  3. the token's `sub` and the session's `userId` agree.
 *
 * The third is the one that is easy to skip: the first two alone would accept a
 * token whose session was re-pointed, and a mismatch there is by definition not
 * something an honest client produces. `null` is published for every failure —
 * this middleware never rejects, because a signed-out visitor is a legitimate
 * caller for most of the API, and the refusal belongs to `requireUser`.
 *
 * An expired access token lands here as `null` too. That is the normal state of
 * a tab left open past fifteen minutes, and the client's answer is a refresh
 * (see `lib/api/client.ts`), not an error surfaced from this layer.
 */
export async function attachUser(c: Ctx, next: Next) {
  c.set(SESSION_USER_KEY, null);

  const claims = await readAccessClaims(c);
  if (claims) {
    const [row] = await db
      .select({ user: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(
        and(
          eq(sessions.id, claims.sid),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (row && String(row.user.id) === claims.sub) {
      c.set(SESSION_USER_KEY, toSessionUser(row.user));
      // Best-effort session touch; never block the request on it.
      void db
        .update(sessions)
        .set({ lastUsedAt: new Date() })
        .where(eq(sessions.id, claims.sid))
        .catch(() => undefined);
    }
  }

  await next();
}

/* ------------------------------- revocation -------------------------------- */

/**
 * Invalidate **every** session belonging to a user, including the caller's.
 *
 * Two callers, two different instincts:
 *
 *  - "Sign out of all devices", where including the caller is the entire point.
 *  - A credential that changed. A password is only worth changing because it
 *    might have leaked, so the sessions minted while the old one was valid are
 *    exactly what has to go — leaving them means whoever stole it keeps access
 *    even after the owner reacted.
 *
 * The count is returned so the caller can log how many were revoked; nothing is
 * derived from it in the response, because telling an anonymous attacker how
 * many devices a victim had is not information the requester is entitled to.
 */
export async function deleteAllSessions(userId: number): Promise<number> {
  const existing = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.userId, userId));
  if (existing.length === 0) return 0;
  await db.delete(sessions).where(eq(sessions.userId, userId));
  return existing.length;
}

/**
 * Invalidate every session **except** the one making the current request.
 *
 * This is the password-change variant. The user is mid-flow in a browser they are
 * holding, and signing them out of the tab they just used — right after confirming a
 * password change — reads as a bug and loses their place. Everything *else* is revoked,
 * which is where an attacker's session would actually be.
 *
 * The keeper is a **session id**, not a raw token: the old signature compared a hash
 * of the cookie against every row, which meant the session being protected had to be
 * found by its credential. An id is a reference the caller already holds and cannot
 * leak, and `currentSessionId` returns `null` when it cannot be established — in
 * which case everything goes, which is the safe direction (see that function).
 */
export async function deleteOtherSessions(
  userId: number,
  keepSessionId: string | null,
): Promise<number> {
  const condition = keepSessionId
    ? and(eq(sessions.userId, userId), not(eq(sessions.id, keepSessionId)))
    : eq(sessions.userId, userId);

  // Selected before deleted, rather than deleted with `.returning()`. MariaDB has no
  // `DELETE … RETURNING`, and Drizzle only offers `.returning()` on backends that do — so
  // the count the caller is told about ("we signed out 2 other sessions") has to come from
  // a read. It is a count of rows this request is about to remove, so there is no window
  // for it to be misleading in a way that matters.
  const existing = await db.select({ id: sessions.id }).from(sessions).where(condition);
  if (existing.length === 0) return 0;
  await db.delete(sessions).where(condition);
  return existing.length;
}

/* --------------------------------- guards ---------------------------------- */

export function requireUser(c: Ctx): SessionUser {
  const user = c.get(SESSION_USER_KEY);
  if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Please sign in to continue.");
  return user;
}

export function requireAdmin(c: Ctx): SessionUser {
  const user = requireUser(c);
  if (user.role !== "ADMIN") {
    throw new HttpError(403, "FORBIDDEN", "Admin access required.");
  }
  return user;
}

/** Role-based authorization helper for route middleware. */
export function requireRole(...allowed: SessionUser["role"][]) {
  return (c: Ctx): SessionUser => {
    const user = requireUser(c);
    if (!allowed.includes(user.role)) {
      throw new HttpError(403, "FORBIDDEN", "You do not have access to this resource.");
    }
    return user;
  };
}

/* --------------------------------- profile --------------------------------- */

/**
 * The fields a user may change on their **own** account.
 *
 * ## Why this list is a whitelist and not a filtered object
 *
 * The obvious way to build "the user cannot promote themselves" is to parse a loose
 * schema and then strip `role`, `verified` and `passwordHash` before writing. That
 * makes every future column on `users` a field the filter has to remember to exclude,
 * and the day someone adds `stripeCustomerId` the strip list is one line short of a
 * privilege escalation. A schema that only *names* what is editable cannot be
 * incomplete in that way: `role` is not writable here because it is not in here.
 *
 * `.strict()` is belt-and-braces on top of that — it turns a client that sends
 * `{"name":"x","role":"ADMIN"}` into a 400 rather than a silent no-op, so a caller
 * that *thinks* it promoted itself finds out immediately instead of assuming it did.
 */
export const selfEditableProfileFields = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80, "Name is too long").optional(),
  phone: z.string().trim().max(20, "Phone number is too long").optional(),
  avatarUrl: z.string().url().max(500).nullable().optional(),
});

export type SelfEditableProfile = z.infer<typeof selfEditableProfileFields>;

/**
 * Apply a self-service profile edit and return the row that resulted.
 *
 * ## Why the actor is an argument and never a body field
 *
 * The `where` clause is `eq(users.id, userId)` and the caller derives `userId` from
 * the session. There is no code path here in which a request body could influence
 * *whose* row is written — which is the whole of the "users cannot modify another
 * user's account" property, and it is structural rather than a check that could be
 * forgotten.
 *
 * `updatedAt` is written explicitly. Nothing in this codebase sets it on update
 * automatically, and `routes/social.ts` keys its "profile updated" notification on it.
 */
export async function applyProfileUpdate(
  userId: number,
  input: SelfEditableProfile,
): Promise<typeof users.$inferSelect> {
  // An untouched optional field must stay untouched. Spreading `input` straight into
  // `set` would write `name: undefined` over the existing value for any key the client
  // omitted, and Drizzle does not treat `undefined` as "leave this alone" here.
  const changes = Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
  const now = new Date();
  await db
    .update(users)
    .set({ ...changes, updatedAt: now })
    .where(eq(users.id, userId));
  const [updated] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!updated) throw new HttpError(404, "NOT_FOUND", "Account not found.");
  return updated;
}
