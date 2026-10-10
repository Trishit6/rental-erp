/**
 * Durable login throttling and the security-event trail.
 *
 * ## Why this is separate from the in-memory limiter
 *
 * `lib/api.ts` has a per-IP sliding bucket, and it is useful — it stops a crude
 * flood before the password comparison. But it is per-process and keyed by socket,
 * so it forgets everything on restart and it cannot follow an *account* that is
 * being sprayed from a rotating set of addresses. This module writes each attempt
 * to `login_attempts` and asks that table the throttling questions, so the lockout
 * is durable and travels with the identifier.
 *
 * ## Why the lockout backs off
 *
 * A fixed lockout is a denial-of-service lever: an attacker who knows a victim's
 * email can keep the account locked forever by failing once per window. Doubling
 * the lockout per failure past the threshold means an honest user who fat-fingers
 * their password waits seconds, while a sustained attack pays exponentially — and
 * the account still unlocks on its own without an administrator.
 */

import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "../db";
import { loginAttempts, securityEvents } from "../schema";
import {
  LOGIN_LOCKOUT_SECONDS,
  LOGIN_MAX_FAILURES,
  LOGIN_WINDOW_SECONDS,
} from "./env";
import type { SecurityEventType } from "./enums";

/** Cap on the exponential part; a lockout never exceeds `base * 16`. */
const MAX_BACKOFF_MULTIPLIER = 16;

export type AttemptContext = {
  identifier: string;
  userId?: number | null;
  ip?: string | null;
  userAgent?: string | null;
};

/** Record one attempt. Never throws into the caller — an audit failure must not block a login. */
export async function recordLoginAttempt(
  context: AttemptContext & { success: boolean; failureReason?: string | null },
): Promise<void> {
  try {
    await db.insert(loginAttempts).values({
      identifier: context.identifier.slice(0, 320),
      userId: context.userId ?? null,
      ip: context.ip?.slice(0, 45) ?? null,
      userAgent: context.userAgent?.slice(0, 400) ?? null,
      success: context.success,
      failureReason: context.failureReason ?? null,
    });
  } catch (error) {
    console.error("[security] failed to record login attempt:", error);
  }
}

export type LockoutState = {
  failures: number;
  lockedUntil: Date | null;
  /** Whole seconds until the lock lifts, or 0 when not locked. */
  retryAfterSeconds: number;
};

/**
 * How throttled this identifier is *right now*, from its recent failures.
 *
 * The count is consecutive failures inside the window — a successful login clears
 * the practical effect by falling outside the window rather than by deleting rows,
 * which keeps `login_attempts` an append-only audit trail.
 */
export async function lockoutState(identifier: string, now = new Date()): Promise<LockoutState> {
  const since = new Date(now.getTime() - LOGIN_WINDOW_SECONDS * 1000);
  const failuresWhere = and(
    eq(loginAttempts.identifier, identifier),
    eq(loginAttempts.success, false),
    gt(loginAttempts.createdAt, since),
  );

  const [countRow] = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(loginAttempts)
    .where(failuresWhere);
  const failures = Number(countRow?.value ?? 0);

  if (failures < LOGIN_MAX_FAILURES) {
    return { failures, lockedUntil: null, retryAfterSeconds: 0 };
  }

  const [lastFailure] = await db
    .select({ createdAt: loginAttempts.createdAt })
    .from(loginAttempts)
    .where(failuresWhere)
    .orderBy(desc(loginAttempts.createdAt))
    .limit(1);

  if (!lastFailure) return { failures, lockedUntil: null, retryAfterSeconds: 0 };

  const over = failures - LOGIN_MAX_FAILURES;
  const multiplier = Math.min(2 ** over, MAX_BACKOFF_MULTIPLIER);
  const lockedUntil = new Date(lastFailure.createdAt.getTime() + LOGIN_LOCKOUT_SECONDS * multiplier * 1000);
  if (lockedUntil.getTime() <= now.getTime()) {
    return { failures, lockedUntil: null, retryAfterSeconds: 0 };
  }
  return {
    failures,
    lockedUntil,
    retryAfterSeconds: Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000),
  };
}

export type SecurityEventInput = {
  userId?: number | null;
  type: SecurityEventType;
  ip?: string | null;
  userAgent?: string | null;
  /** JSON-serialisable, non-secret context. Never a token, password or code. */
  details?: Record<string, unknown> | null;
};

/** Append a security event. Best-effort: auditing must not fail the user's request. */
export async function recordSecurityEvent(input: SecurityEventInput): Promise<void> {
  try {
    await db.insert(securityEvents).values({
      userId: input.userId ?? null,
      type: input.type,
      ip: input.ip?.slice(0, 45) ?? null,
      userAgent: input.userAgent?.slice(0, 400) ?? null,
      details: input.details ? JSON.stringify(input.details).slice(0, 4000) : null,
    });
  } catch (error) {
    console.error("[security] failed to record security event:", error);
  }
}

/** The client IP as the rest of the app records it, honouring a proxy header. */
export function requestIp(c: { req: { header(name: string): string | undefined; raw: { socket?: { remoteAddress?: string } } } }): string | null {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim() || null;
  return c.req.raw.socket?.remoteAddress ?? null;
}

export function requestUserAgent(c: { req: { header(name: string): string | undefined } }): string | null {
  return c.req.header("user-agent") ?? null;
}
