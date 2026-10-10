/**
 * MFA enrolment, verification and recovery, backed by `user_mfa`.
 *
 * ## The enrolment is two steps on purpose
 *
 * `beginEnrolment` stores a new secret with `enabled_at = NULL`; only
 * `confirmEnrolment`, after the user proves they can generate a valid code, sets
 * `enabled_at` and issues recovery codes. If a single step both stored and enabled,
 * a user who scanned nothing — or scanned into the wrong account's entry — would be
 * locked out of an account whose second factor they never actually hold.
 *
 * ## Replay
 *
 * A TOTP is valid for a whole 30-second step, so the same six digits can be sent
 * twice inside that step. `last_used_at` records the step the last accepted code
 * belonged to, and a code for a step at or before it is refused. Recovery codes are
 * single-use by marking `used_at` inside the same transaction that accepts one.
 */

import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { mfaRecoveryCodes, userMfa, users } from "../schema";
import { decryptSecret, encryptSecret, generateRecoveryCodes, hashRecoveryCode } from "./mfa";
import { buildOtpauthUrl, generateTotpSecret, verifyTotp } from "./totp";

export const MFA_ISSUER = "Revaro";
const RECOVERY_CODE_COUNT = 10;

export type MfaRow = {
  secretEncrypted: string;
  enabledAt: Date | null;
  lastUsedAt: Date | null;
};

export async function getMfaRow(userId: number): Promise<MfaRow | null> {
  const [row] = await db
    .select({
      secretEncrypted: userMfa.secretEncrypted,
      enabledAt: userMfa.enabledAt,
      lastUsedAt: userMfa.lastUsedAt,
    })
    .from(userMfa)
    .where(eq(userMfa.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function isMfaEnabled(userId: number): Promise<boolean> {
  const row = await getMfaRow(userId);
  return row?.enabledAt !== null && row?.enabledAt !== undefined;
}

export type EnrolmentStart = {
  secret: string;
  otpauthUrl: string;
};

/**
 * Start (or restart) an enrolment: a fresh secret, stored encrypted, not yet
 * enabled. Returning the `otpauth://` URI rather than a QR image keeps the server
 * free of an image dependency — the client renders the URI as a QR code.
 */
export async function beginEnrolment(
  userId: number,
  account: string,
): Promise<EnrolmentStart> {
  const secret = generateTotpSecret();
  const secretEncrypted = encryptSecret(secret);

  // One row per user (the PK). A restart overwrites the pending secret and clears
  // any recovery codes from a previous enrolment, so an abandoned setup cannot
  // leave usable bypass codes behind.
  await db
    .insert(userMfa)
    .values({ userId, secretEncrypted, enabledAt: null, lastUsedAt: null })
    .onDuplicateKeyUpdate({ set: { secretEncrypted, enabledAt: null, lastUsedAt: null } });
  await db.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));

  return {
    secret,
    otpauthUrl: buildOtpauthUrl({ secret, account, issuer: MFA_ISSUER }),
  };
}

export type EnrolmentConfirm = {
  recoveryCodes: string[];
};

/**
 * Confirm an enrolment with a code from the authenticator, enable it, and issue
 * recovery codes. Throws a plain `Error` on a bad code; the route maps it to a
 * 400.
 */
export async function confirmEnrolment(userId: number, code: string, now = Date.now()): Promise<EnrolmentConfirm> {
  const row = await getMfaRow(userId);
  if (!row) throw new Error("No enrolment in progress");

  let secret: string;
  try {
    secret = decryptSecret(row.secretEncrypted);
  } catch {
    throw new Error("Stored MFA secret could not be read");
  }

  const result = verifyTotp(secret, code, { now });
  if (!result.valid) throw new Error("That code is not valid");

  await db
    .update(userMfa)
    .set({ enabledAt: new Date(now), lastUsedAt: new Date(now) })
    .where(eq(userMfa.userId, userId));
  // The flag is what the UI reads; clearing it here keeps the account and its
  // profile prompt in agreement.
  await db.update(users).set({ mustEnrollMfa: false }).where(eq(users.id, userId));

  const recoveryCodes = generateRecoveryCodes(RECOVERY_CODE_COUNT);
  await db.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
  await db.insert(mfaRecoveryCodes).values(
    recoveryCodes.map((plain) => ({ userId, codeHash: hashRecoveryCode(plain) })),
  );

  return { recoveryCodes };
}

/** Remove MFA entirely: the secret and every recovery code. */
export async function disableMfa(userId: number): Promise<void> {
  await db.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
  await db.delete(userMfa).where(eq(userMfa.userId, userId));
}

/** How many unused recovery codes the user still has. */
export async function unusedRecoveryCodeCount(userId: number): Promise<number> {
  const rows = await db
    .select({ id: mfaRecoveryCodes.id })
    .from(mfaRecoveryCodes)
    .where(and(eq(mfaRecoveryCodes.userId, userId), isNull(mfaRecoveryCodes.usedAt)));
  return rows.length;
}

/**
 * Replace every recovery code with a fresh batch. Requires the account to already
 * have MFA enabled — regenerating for an account with no second factor would create
 * a bypass for nothing.
 */
export async function regenerateRecoveryCodes(userId: number): Promise<string[]> {
  const row = await getMfaRow(userId);
  if (!row || !row.enabledAt) throw new Error("MFA is not enabled");
  const recoveryCodes = generateRecoveryCodes(RECOVERY_CODE_COUNT);
  await db.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
  await db.insert(mfaRecoveryCodes).values(
    recoveryCodes.map((plain) => ({ userId, codeHash: hashRecoveryCode(plain) })),
  );
  return recoveryCodes;
}

export type MfaVerifyResult =
  | { ok: true; method: "totp" | "recovery" }
  | { ok: false; reason: "not_enabled" | "invalid" };

/**
 * Verify a code against the user's TOTP secret, then their unused recovery codes.
 *
 * Recovery codes are checked only after TOTP, so the common path stays one HMAC and
 * one stored-code compare; the scan is bounded by `RECOVERY_CODE_COUNT`.
 */
export async function verifyUserCode(
  userId: number,
  code: string,
  now = Date.now(),
): Promise<MfaVerifyResult> {
  const row = await getMfaRow(userId);
  if (!row || !row.enabledAt) return { ok: false, reason: "not_enabled" };

  let secret: string | null;
  try {
    secret = decryptSecret(row.secretEncrypted);
  } catch {
    secret = null;
  }

  if (secret) {
    const result = verifyTotp(secret, code, { now });
    const isReplay =
      result.valid &&
      result.stepStartedAt !== null &&
      row.lastUsedAt !== null &&
      result.stepStartedAt <= row.lastUsedAt.getTime();
    if (result.valid && !isReplay) {
      await db
        .update(userMfa)
        .set({ lastUsedAt: new Date(result.stepStartedAt ?? now) })
        .where(eq(userMfa.userId, userId));
      return { ok: true, method: "totp" };
    }
  }

  // Recovery-code path. Normalise once, then compare hashes.
  const candidateHash = hashRecoveryCode(code);
  const [match] = await db
    .select({ id: mfaRecoveryCodes.id })
    .from(mfaRecoveryCodes)
    .where(
      and(
        eq(mfaRecoveryCodes.userId, userId),
        eq(mfaRecoveryCodes.codeHash, candidateHash),
        isNull(mfaRecoveryCodes.usedAt),
      ),
    )
    .limit(1);
  if (match) {
    await db
      .update(mfaRecoveryCodes)
      .set({ usedAt: new Date(now) })
      .where(eq(mfaRecoveryCodes.id, match.id));
    return { ok: true, method: "recovery" };
  }

  return { ok: false, reason: "invalid" };
}
