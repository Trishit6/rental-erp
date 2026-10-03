import { and, eq, gt } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { db } from "../db";
import { sessions, users } from "../schema";
import { HttpError } from "./api";
import { getCookie, setCookie, type Ctx, type Next } from "./http";

const SESSION_COOKIE = "revaro_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Sessions store a SHA-256 hash of the opaque token, never the raw value.
 * The hash doubles as the primary key so lookups are a single indexed query.
 */
export function hashSessionToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

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

export async function createSession(c: Ctx, userId: number): Promise<void> {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id: tokenHash, userId, expiresAt });
  setCookie(c, SESSION_COOKIE, rawToken, sessionCookieOptions());
}

/** Key that `attachUser` publishes the resolved session under. */
export const SESSION_USER_KEY = "user";

export async function attachUser(c: Ctx, next: Next) {
  const rawToken = getCookie(c, SESSION_COOKIE);
  c.set(SESSION_USER_KEY, null);
  if (rawToken) {
    const tokenHash = hashSessionToken(rawToken);
    const [row] = await db
      .select({ user: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.id, tokenHash), gt(sessions.expiresAt, new Date())))
      .limit(1);
    if (row) {
      c.set(SESSION_USER_KEY, toSessionUser(row.user));
      // Best-effort session touch; never block the request on it.
      void db
        .update(sessions)
        .set({ lastUsedAt: new Date() })
        .where(eq(sessions.id, tokenHash))
        .catch(() => undefined);
    }
  }
  await next();
}

/** Invalidate a single session by its raw cookie token (logout). */
export async function deleteSession(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  await db.delete(sessions).where(eq(sessions.id, hashSessionToken(rawToken)));
}

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

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "Lax" as const,
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
    secure: process.env.NODE_ENV === "production",
  };
}

export { SESSION_COOKIE };
