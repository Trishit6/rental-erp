/**
 * Permission resolution and the authorization middleware built on it.
 *
 * ## Where authority comes from
 *
 * Never from the token claims and never from the request body. `resolveAccess`
 * reads `user_roles → roles → role_permissions → permissions` for the *session's*
 * user id, so editing `role` in a JWT payload, a cookie or a client store changes
 * nothing: the value the guard uses is a row the server just read. The `role` claim
 * on the access token exists only so a debugger can read a token; it is never
 * consulted here.
 *
 * ## Why a short cache
 *
 * Authorization runs on every protected request and the joins are cheap but not
 * free. A grant or a revocation is an administrative action taken by a person who
 * expects it to apply immediately, so the cache is deliberately short (30 s) and
 * every write path calls `invalidateAccess(userId)`. The alternative — caching for
 * the life of the process — turns "revoke this role" into "revoke this role after
 * the next deploy", which is a security bug wearing a performance costume.
 *
 * The brief asks for roles and permissions to be read from the DB per request,
 * briefly cached. This is that, with the one distinction that the cache is
 * per-process rather than per-request: a single request still sees one consistent
 * snapshot, and the invalidation hooks keep a mutation from being visibly ignored
 * by the request that follows it.
 */

import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { roles, rolePermissions, permissions, userRoles, users } from "../schema";
import { HttpError } from "./api";
import { requireUser, type SessionUser } from "./auth";
import { isDevMfaBypass } from "./config";
import { SYSTEM_ROLES } from "./enums";
import type { Ctx, Next } from "./http";

/** How long a resolved access set is reused before it is re-read. */
const CACHE_TTL_MS = 30_000;

export type Access = {
  /** System role names the user holds (may include `USER`/`SELLER`). */
  roles: Set<string>;
  /** Permission keys `resource.action`. */
  permissions: Set<string>;
};

type CacheEntry = Access & { expiresAt: number };

const cache = new Map<number, CacheEntry>();

/** Drop one user's cached access. Called by every role/permission mutation. */
export function invalidateAccess(userId: number): void {
  cache.delete(userId);
}

/** Drop the whole cache. Exposed for tests and for a process-wide role change. */
export function invalidateAllAccess(): void {
  cache.clear();
}

/**
 * Pre-seed the cache with a resolved access set, **for tests**.
 *
 * `resolveAccess` reads the database, which the router-level suites deliberately
 * do not have. A test that wants a *granted* staff request to reach its handler
 * (rather than be refused at the gate) still has to satisfy `requirePermission`,
 * so it primes the exact set the joins would have produced. Nothing in the
 * request path calls this; a forged client cannot reach it.
 */
export function primeAccessCache(userId: number, access: Access, now = Date.now()): void {
  cache.set(userId, {
    roles: new Set(access.roles),
    permissions: new Set(access.permissions),
    expiresAt: now + CACHE_TTL_MS,
  });
}

/**
 * Resolve a user's roles and permissions from the database.
 *
 * A user with no `user_roles` rows resolves to an empty set, not an error — most
 * accounts hold only the coarse `users.role` and that is a legitimate answer.
 */
export async function resolveAccess(userId: number, now = Date.now()): Promise<Access> {
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > now) {
    return { roles: cached.roles, permissions: cached.permissions };
  }

  const rows = await db
    .select({ role: roles.name, permission: permissions.key })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .leftJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(userRoles.userId, userId));

  const roleSet = new Set<string>();
  const permissionSet = new Set<string>();
  for (const row of rows) {
    roleSet.add(row.role);
    if (row.permission) permissionSet.add(row.permission);
  }

  const access: Access = { roles: roleSet, permissions: permissionSet };
  cache.set(userId, { ...access, expiresAt: now + CACHE_TTL_MS });
  return access;
}

/** Whether a resolved access set grants a permission. `SUPER_ADMIN` is unrestricted. */
export function accessGrants(access: Access, permission: string): boolean {
  return access.roles.has("SUPER_ADMIN") || access.permissions.has(permission);
}

export function accessHasRole(access: Access, role: string): boolean {
  return access.roles.has(role);
}

/* --------------------------------- guards ---------------------------------- */

/**
 * Require a specific permission key, e.g. `orders.refund`.
 *
 * Returned as `(c, next)` middleware so it can gate a group with
 * `router.use(path, requirePermission("orders.refund"))`. It resolves lazily: a
 * route group with several permission gates pays for one lookup per request that
 * reaches it, because `resolveAccess` caches.
 */
export function requirePermission(permission: string) {
  return async (c: Ctx, next: Next): Promise<void> => {
    const user = requireUser(c);
    const access = await resolveAccess(user.id);
    if (!accessGrants(access, permission)) {
      throw new HttpError(403, "FORBIDDEN", "You do not have permission to do that.");
    }
    await next();
  };
}

/** Require at least one of several permission keys. */
export function requireAnyPermission(...keys: string[]) {
  return async (c: Ctx, next: Next): Promise<void> => {
    const user = requireUser(c);
    const access = await resolveAccess(user.id);
    if (!keys.some((key) => accessGrants(access, key))) {
      throw new HttpError(403, "FORBIDDEN", "You do not have permission to do that.");
    }
    await next();
  };
}

/** Require a named system role (e.g. `SUPPORT`, `FINANCE`) from `user_roles`. */
export function requireSystemRole(...names: string[]) {
  return async (c: Ctx, next: Next): Promise<void> => {
    const user = requireUser(c);
    const access = await resolveAccess(user.id);
    if (!names.some((name) => access.roles.has(name))) {
      throw new HttpError(403, "FORBIDDEN", "You do not have access to this resource.");
    }
    await next();
  };
}

/**
 * Staff MFA enforcement: every staff account must have a second factor enabled
 * before it may use the protected area.
 *
 * This is a *gate*, not a policy engine: it answers one question — "does this staff
 * session have MFA on?" — for the areas the brief marks mandatory. A `ADMIN` coarse
 * role or any `SYSTEM_ROLES` grant counts as staff. The MFA enrolment endpoints
 * live on the auth router (outside the gate), so a blocked staff member can always
 * get back in by enrolling — the gate closes the door, never the recovery path.
 */
export function requireMfaEnrolment() {
  return async (c: Ctx, next: Next): Promise<void> => {
    const user = requireUser(c);
    // The local development admin is password-only (see `isDevMfaBypass`). In
    // production this is always `false`, so the gate below is unconditional there.
    if (isDevMfaBypass(user.email)) {
      await next();
      return;
    }
    if (user.role !== "ADMIN") {
      const access = await resolveAccess(user.id);
      const hasStaffRole = SYSTEM_ROLES.some((role) => access.roles.has(role));
      if (!hasStaffRole) {
        await next();
        return;
      }
    }
    if (user.mfaEnabled) {
      await next();
      return;
    }
    throw new HttpError(
      403,
      "MFA_ENROLMENT_REQUIRED",
      "Staff accounts must enable two-factor authentication before accessing this area.",
    );
  };
}

/* ------------------------------ ownership ---------------------------------- */

/**
 * Assert that the row a caller is acting on belongs to them (or that they are an
 * administrator). Used by the self-service endpoints; the id always originates
 * from the session, never from the body.
 */
export function assertOwnership(sessionUser: SessionUser, ownerId: number): void {
  if (sessionUser.role === "ADMIN") return;
  if (sessionUser.id !== ownerId) {
    // 404, not 403: confirming that someone else's session exists is itself a leak.
    throw new HttpError(404, "NOT_FOUND", "Not found.");
  }
}

/* ----------------------------- super admins -------------------------------- */

/**
 * The number of active (non-suspended) `SUPER_ADMIN` users.
 *
 * Used to refuse the two operations that could lock a deployment out of its own
 * administration: revoking the last super admin's role, and suspending them.
 */
export async function countActiveSuperAdmins(): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`COUNT(DISTINCT ${userRoles.userId})` })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .innerJoin(users, eq(userRoles.userId, users.id))
    .where(and(eq(roles.name, "SUPER_ADMIN"), ne(users.status, "SUSPENDED")));
  return Number(row.value);
}

/** True when `userId` is a super admin and the only one left. */
export async function isLastActiveSuperAdmin(userId: number): Promise<boolean> {
  const [row] = await db
    .select({ value: sql<number>`COUNT(DISTINCT ${userRoles.userId})` })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(eq(roles.name, "SUPER_ADMIN"), eq(userRoles.userId, userId)));
  if (Number(row.value) === 0) return false;
  return (await countActiveSuperAdmins()) <= 1;
}
