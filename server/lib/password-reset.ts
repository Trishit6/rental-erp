/**
 * Hashed, single-use, expiring password-reset tokens.
 *
 * ## The token discipline mirrors refresh tokens
 *
 * A reset token is a bearer credential that arrives by email, so the database
 * stores only its SHA-256. The plaintext exists in the link and nowhere else, which
 * means a dump of `password_reset_tokens` cannot be turned into a reset. It is
 * single-use (a second presentation finds the row already stamped) and short-lived
 * (the expiry is part of the lookup).
 *
 * ## Why issuing a new token invalidates the old one
 *
 * If a user clicks "forgot password" twice, the second email should be the one that
 * works. Deleting the account's outstanding tokens before writing the new one makes
 * the newest link authoritative and stops a pile of valid links accumulating in an
 * inbox.
 */

import { and, eq, gt, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { db } from "../db";
import { passwordResetTokens, sessions, users } from "../schema";
import { PASSWORD_RESET_TTL_SECONDS } from "./env";

/** SHA-256 hex — the only form of the token the database ever sees. */
export function hashResetToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export type IssuedResetToken = {
  rawToken: string;
  expiresAt: Date;
};

/**
 * Issue a fresh reset token for a user, replacing any outstanding ones.
 *
 * Returns the raw token so the caller can put it in the email. Nothing else in the
 * system keeps it.
 */
export async function issueResetToken(
  userId: number,
  requestedIp: string | null,
  now = new Date(),
): Promise<IssuedResetToken> {
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));

  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_SECONDS * 1000);
  await db.insert(passwordResetTokens).values({
    userId,
    tokenHash: hashResetToken(rawToken),
    expiresAt,
    requestedIp: requestedIp?.slice(0, 45) ?? null,
  });
  return { rawToken, expiresAt };
}

export type ResetConsumption =
  | { ok: true; userId: number }
  | { ok: false; reason: "invalid" | "expired" | "used" };

/**
 * Validate and spend a reset token, writing the new password hash and ending every
 * session the account had.
 *
 * All of this happens in one place so "the token is spent" and "the password
 * changed" cannot come apart: a spent token with an unchanged password locks a user
 * out of the link that was meant to help them.
 */
export async function consumeResetToken(
  rawToken: string,
  newPasswordHash: string,
  now = new Date(),
): Promise<ResetConsumption> {
  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, hashResetToken(rawToken)))
    .limit(1);

  if (!row) return { ok: false, reason: "invalid" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (row.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };

  await db
    .update(passwordResetTokens)
    .set({ usedAt: now })
    .where(eq(passwordResetTokens.id, row.id));
  await db
    .update(users)
    .set({ passwordHash: newPasswordHash, mustChangePassword: false, updatedAt: now })
    .where(eq(users.id, row.userId));
  // A password reset is a recovery from a possible compromise: every session minted
  // under the old password goes, including one an attacker holds.
  await db.delete(sessions).where(eq(sessions.userId, row.userId));

  return { ok: true, userId: row.userId };
}

/** Whether a raw token is currently usable. Used to render the reset form. */
export async function isResetTokenUsable(rawToken: string, now = new Date()): Promise<boolean> {
  const [row] = await db
    .select({ id: passwordResetTokens.id })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, hashResetToken(rawToken)),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, now),
      ),
    )
    .limit(1);
  return Boolean(row);
}
