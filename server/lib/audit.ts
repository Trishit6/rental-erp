import { db } from "../db";
import { adminAuditLog } from "../schema";
import type { Ctx } from "./http";

/**
 * One place to append to the admin audit log.
 *
 * ## Why a helper, and why it never throws into the request
 *
 * Every call site is an admin mutation that has *already succeeded* by the time it
 * logs. If the audit insert then failed (a dropped connection, a lock timeout) the
 * correct outcome is "the action stands, the log entry is lost" — not "the admin
 * sees a 500 for a change that actually happened", which would invite a retry that
 * double-applies the change. So failures are logged server-side and swallowed.
 *
 * ## Why it is awaited anyway
 *
 * Awaited, not fire-and-forget: the route handlers that call it are already async,
 * and awaiting keeps the write inside the request's error boundary rather than in
 * an unhandled rejection that would crash the process on an unlucky failure.
 *
 * ## Why there is no `adminId` parameter
 *
 * The actor is always the session administrator — read from the context, exactly as
 * the route's `requireAdmin` did. A parameter would let a caller (today, or in five
 * years) attribute an action to someone else, which defeats the point of the log.
 */
export async function recordAudit(
  c: Ctx,
  action: string,
  entityType: string,
  entityId: number | null,
  details: string,
): Promise<void> {
  const admin = c.get("user");
  if (!admin) return; // Unreachable behind requireAdmin; defensive, not load-bearing.

  try {
    await db.insert(adminAuditLog).values({
      adminId: admin.id,
      action: action.slice(0, 40),
      entityType: entityType.slice(0, 20),
      entityId: entityId === null || !Number.isFinite(entityId) ? null : Math.trunc(entityId),
      details: details.slice(0, 300),
    });
  } catch (error) {
    // The action already happened. Losing its log line is bad; failing the admin's
    // request for a change that *did* apply is worse.
    console.error("[audit] failed to record", action, entityType, entityId, error);
  }
}
