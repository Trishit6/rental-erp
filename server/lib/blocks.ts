import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "../db";
import { userBlocks, users } from "../schema";
import { HttpError } from "./api";

/**
 * Account blocking.
 *
 * ## What a block is here
 *
 * One account refusing another's messages. It is stored as a single directed row
 * (`user_blocks`), but every *read* treats the pair as mutual: if either account
 * has blocked the other, the two cannot exchange messages through any path. That
 * asymmetry — directed storage, mutual enforcement — is deliberate. It keeps the
 * blocker's note private to them and lets an unblock be one person's decision,
 * while making "can these two talk?" impossible to get wrong by checking one row
 * instead of two.
 *
 * ## What it is not
 *
 * It is not a ban, not a report and not a visibility rule. A blocked seller's
 * listing stays public and their orders still run; only new messages are refused.
 * Escalation is `reports` (moderation) and that is a separate table on purpose.
 *
 * ## Why this module owns the check
 *
 * `assertNotBlocked` is called from the messaging data layer, not from a route, so
 * a future send path cannot forget it. A check that lives only at the HTTP edge is
 * a check that the next endpoint re-implements — or omits.
 */

export type BlockedUser = {
  id: number;
  name: string;
  avatarUrl: string | null;
  /** The blocker's private note. Never returned to the blocked account. */
  reason: string | null;
  blockedAt: string;
};

/**
 * Whether either account has blocked the other.
 *
 * One indexed lookup over both directions rather than two queries, so callers pay
 * the same whether the block was placed by them or against them.
 */
export async function isBlockedEitherWay(a: number, b: number): Promise<boolean> {
  if (a === b) return false;
  const [row] = await db
    .select({ id: userBlocks.id })
    .from(userBlocks)
    .where(
      or(
        and(eq(userBlocks.blockerId, a), eq(userBlocks.blockedId, b)),
        and(eq(userBlocks.blockerId, b), eq(userBlocks.blockedId, a)),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * Refuse when a block stands between two accounts.
 *
 * Throws the same 403 for "you blocked them" and "they blocked you": the second
 * phrasing would tell the caller they have been blocked, which is exactly the fact
 * a block is meant to withhold, and would turn the endpoint into a probe for
 * someone else's decisions.
 */
export async function assertNotBlocked(a: number, b: number): Promise<void> {
  if (await isBlockedEitherWay(a, b)) {
    throw new HttpError(403, "BLOCKED", "You can't message this account.");
  }
}

/** Create the block, if it does not already exist. Idempotent by design. */
export async function blockUser(
  blockerId: number,
  blockedId: number,
  reason?: string | null,
): Promise<void> {
  if (blockerId === blockedId) {
    throw new HttpError(400, "BAD_REQUEST", "You can't block yourself.");
  }
  // `onDuplicateKeyUpdate` with a no-op set rather than `INSERT IGNORE`: the
  // latter would also swallow a foreign-key failure and report a success for a
  // block that was never written, while this can only ever absorb the duplicate.
  await db
    .insert(userBlocks)
    .values({ blockerId, blockedId, reason: reason ?? null })
    .onDuplicateKeyUpdate({ set: { id: sql`${userBlocks.id}` } });
}

/** Remove a block. Removing one that is not there is a success, not a 404. */
export async function unblockUser(blockerId: number, blockedId: number): Promise<void> {
  await db
    .delete(userBlocks)
    .where(and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, blockedId)));
}

/** The accounts this user has blocked, newest first. */
export async function listBlockedUsers(blockerId: number): Promise<BlockedUser[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      reason: userBlocks.reason,
      blockedAt: userBlocks.createdAt,
    })
    .from(userBlocks)
    .innerJoin(users, eq(userBlocks.blockedId, users.id))
    .where(eq(userBlocks.blockerId, blockerId))
    .orderBy(desc(userBlocks.createdAt));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    avatarUrl: row.avatarUrl,
    reason: row.reason,
    blockedAt: row.blockedAt.toISOString(),
  }));
}
