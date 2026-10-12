import { db } from "../db";
import { adminAuditLog } from "../schema";
import { HttpError } from "./api";
import { requireUser } from "./auth";
import type { Ctx, Handler } from "./http";
import { resolveAccess, type Access } from "./permissions";
import { requestIdOf } from "./request-id";
import { requestIp, requestUserAgent } from "./security-log";

/**
 * The admin audit trail (PROMPT 22).
 *
 * ## Why a helper, and why it never throws into the request
 *
 * Every call site is an admin mutation that has *already succeeded* by the time it
 * logs. If the audit insert then failed (a dropped connection, a lock timeout) the
 * correct outcome is "the action stands, the log entry is lost" — not "the admin
 * sees a 500 for a change that actually happened", which would invite a retry that
 * double-applies the change. So failures are logged server-side and swallowed.
 *
 * ## Why `withAudit` exists as well as `recordAudit`
 *
 * The brief asks for far more than "something happened": who (id *and* role), what
 * (action, entity, before/after), where (IP, user agent, request id) and why (a
 * reason the operator must type). A handler that remembers all of that by hand,
 * every time, eventually forgets one — usually the reason, which is the field a
 * regulator asks for first. `withAudit` makes the enriched record the *default*:
 * the mutation returns a small `AuditHandlerResult` and the wrapper stamps the
 * actor, the network provenance, the request id and the validated reason around it.
 *
 * ## Why there is no `adminId` parameter
 *
 * The actor is always the session administrator — read from the context, exactly as
 * `requireAdmin` did. A parameter would let a caller attribute an action to someone
 * else, which defeats the point of the log.
 */

/** A curated, non-secret set of fields. Never a whole row. */
export type AuditSnapshot = Record<string, unknown>;

export type AuditRecord = {
  /** A stable action name, e.g. `PRODUCT_STATUS_SET`. Truncated to the column width. */
  action: string;
  /** Coarse entity kind: `product | user | role | payout | …`. */
  entityType: string;
  entityId?: number | null;
  /** One short, safe sentence. Never request bodies, credentials or stack traces. */
  details?: string | null;
  /** The operator's reason. Mandatory for sensitive actions (see `withAudit`). */
  reason?: string | null;
  /** The few fields that moved, and the values on either side. */
  before?: AuditSnapshot | null;
  after?: AuditSnapshot | null;
};

/** `SUPER_ADMIN` first, then the other staff roles, then the coarse role. */
function primaryRole(access: Access, fallback: string): string {
  const order = [
    "SUPER_ADMIN",
    "ADMIN",
    "SUPPORT",
    "FINANCE",
    "MODERATOR",
    "CONTENT_MANAGER",
  ] as const;
  for (const name of order) {
    if (access.roles.has(name)) return name;
  }
  return fallback;
}

/** Serialise a curated snapshot, bounded so a stray large value cannot bloat a row. */
function serialise(snapshot: AuditSnapshot | null | undefined): string | null {
  if (!snapshot) return null;
  try {
    return JSON.stringify(snapshot).slice(0, 4000);
  } catch {
    // A circular or otherwise unserialisable snapshot is dropped rather than
    // failing the mutation it documents.
    return null;
  }
}

/**
 * Append one enriched entry to the admin audit log.
 *
 * Prefer `withAudit` for new mutations: it fills the actor role, IP, user agent,
 * request id and reason automatically. `recordAudit` remains for the handful of
 * places where the response has already been written by the time the record is
 * assembled.
 */
export async function recordAudit(c: Ctx, record: AuditRecord): Promise<void> {
  const admin = c.get("user");
  if (!admin) return; // Unreachable behind requireAdmin; defensive, not load-bearing.

  const role: string | null = await resolveAccess(admin.id)
    .then((access) => primaryRole(access, admin.role))
    // A role lookup must never fail the audit write; the id is the load-bearing field.
    .catch(() => admin.role);

  try {
    await db.insert(adminAuditLog).values({
      adminId: admin.id,
      actorRole: role?.slice(0, 32) ?? null,
      action: record.action.slice(0, 40),
      entityType: record.entityType.slice(0, 20),
      entityId:
        record.entityId === null || record.entityId === undefined || !Number.isFinite(record.entityId)
          ? null
          : Math.trunc(record.entityId),
      details: record.details?.slice(0, 300) ?? null,
      reason: record.reason?.slice(0, 300) ?? null,
      ip: requestIp(c)?.slice(0, 45) ?? null,
      userAgent: requestUserAgent(c)?.slice(0, 400) ?? null,
      requestId: requestIdOf(c.raw)?.slice(0, 64) ?? null,
      beforeState: serialise(record.before),
      afterState: serialise(record.after),
    });
  } catch (error) {
    // The action already happened. Losing its log line is bad; failing the admin's
    // request for a change that *did* apply is worse.
    console.error("[audit] failed to record", record.action, record.entityType, error);
  }
}

/** What a `withAudit` handler returns so the wrapper can write the log line. */
export type AuditHandlerResult = {
  entityId?: number | null;
  details?: string;
  /** Overrides the wrapper's reason when the action's reason is conditional. */
  reason?: string | null;
  before?: AuditSnapshot | null;
  after?: AuditSnapshot | null;
};

export type AuditContext = {
  /** The validated, trimmed reason — `null` when the action does not require one. */
  reason: string | null;
  /** The staff role recorded as `actor_role`. */
  role: string;
};

export type WithAuditOptions = {
  action: string;
  entityType: string;
  /**
   * When `true` the request body must carry a non-empty `reason` string, and the
   * request is refused *before* the handler runs. Used for the actions the brief
   * marks sensitive (role grants, suspensions, destructive deletes).
   */
  requireReason?: boolean;
};

/**
 * Wrap a mutation handler so its audit entry is complete by construction.
 *
 * The wrapped handler writes its own response (as every handler in this file does)
 * and returns the small result the wrapper needs to finish the log line. The
 * wrapper handles the actor identity, network provenance, request id, the reason
 * contract and the "audit must not fail the request" rule in one place.
 */
export function withAudit(
  options: WithAuditOptions,
  handler: (c: Ctx, audit: AuditContext) => Promise<AuditHandlerResult | void>,
): Handler {
  return async (c) => {
    const user = requireUser(c);
    const access = await resolveAccess(user.id);
    const role = primaryRole(access, user.role);

    let reason: string | null = null;
    if (options.requireReason) {
      const body = (await c.req.json().catch(() => ({}))) as { reason?: unknown };
      const raw = typeof body.reason === "string" ? body.reason.trim() : "";
      if (!raw) {
        throw new HttpError(
          400,
          "REASON_REQUIRED",
          "This action needs a short reason, recorded in the audit log.",
        );
      }
      reason = raw.slice(0, 300);
    }

    const result = (await handler(c, { reason, role })) ?? {};

    await recordAudit(c, {
      action: options.action,
      entityType: options.entityType,
      entityId: result.entityId ?? null,
      details: result.details ?? null,
      reason: result.reason ?? reason,
      before: result.before ?? null,
      after: result.after ?? null,
    });

    return result;
  };
}
