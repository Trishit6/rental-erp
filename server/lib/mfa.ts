/**
 * MFA secret storage and recovery codes, on Node's `crypto` only.
 *
 * ## Why the TOTP secret is encrypted at rest
 *
 * A TOTP secret is a bearer credential: anyone who reads it can generate valid
 * codes forever. The database is backed up, replicated and read by support tooling,
 * so the bar is not "is the DB private" but "what does a leaked dump buy". With the
 * secret encrypted under a key that lives only in the process environment, a dump
 * of `user_mfa` is a column of ciphertext. AES-256-GCM rather than CBC because GCM
 * authenticates: a tampered secret fails to decrypt instead of quietly becoming a
 * different valid secret.
 *
 * ## Why recovery codes are hashed
 *
 * Recovery codes are the deliberate bypass of the second factor, so they must not
 * be recoverable from the database. They are high-entropy random strings rather
 * than user-chosen, so a plain SHA-256 is sufficient (there is nothing to brute
 * force) and keeps verification to one hash per candidate. They are compared in
 * constant time and consumed on use.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { mfaEncryptionKey } from "./env";

const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
/** Marks the ciphertext format so a future key rotation can tell versions apart. */
const ENCRYPTION_VERSION = "v1";

function keyBytes(): Buffer {
  return mfaEncryptionKey();
}

/** Encrypt a TOTP secret. Format: `v1:<iv b64url>:<tag b64url>:<ciphertext b64url>`. */
export function encryptSecret(plaintext: string): string {
  return encryptSecretWith(plaintext, randomBytes(GCM_IV_BYTES));
}

/**
 * Encrypt with an explicit IV — used by the deterministic seeders, which derive a
 * stable IV from the user id so two `pnpm db:seed` runs write byte-identical
 * rows. AES-GCM IVs must never repeat for the same key and plaintext; a per-user
 * derivation is safe whereas a fixed constant would not be.
 */
export function encryptSecretWith(plaintext: string, iv: Buffer): string {
  if (iv.length !== GCM_IV_BYTES) {
    throw new Error("AES-GCM IV must be exactly 12 bytes");
  }
  const cipher = createCipheriv("aes-256-gcm", keyBytes(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ENCRYPTION_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

/**
 * Decrypt a stored secret. Throws on a malformed value, a wrong key or tampered
 * ciphertext — the callers treat every one of those the same way: MFA cannot be
 * completed, so the challenge fails closed rather than in the attacker's favour.
 */
export function decryptSecret(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== ENCRYPTION_VERSION) {
    throw new Error("Unrecognised MFA secret format");
  }
  const [, rawIv, rawTag, rawCiphertext] = parts;
  const iv = Buffer.from(rawIv!, "base64url");
  const tag = Buffer.from(rawTag!, "base64url");
  const ciphertext = Buffer.from(rawCiphertext!, "base64url");
  if (iv.length !== GCM_IV_BYTES || tag.length !== GCM_TAG_BYTES) {
    throw new Error("Malformed MFA secret envelope");
  }
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/* ------------------------------ recovery codes ----------------------------- */

/** No `I`, `O`, `0` or `1` — the characters users misread when copying by hand. */
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RECOVERY_LENGTH = 8;

/** One code, `XXXX-XXXX`, from a CSPRNG. */
export function generateRecoveryCode(): string {
  const chars: string[] = [];
  for (let index = 0; index < RECOVERY_LENGTH; index += 1) {
    chars.push(RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]);
  }
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

/** A fresh batch of single-use recovery codes. Only the caller sees the plaintext. */
export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => generateRecoveryCode());
}

/**
 * Canonicalise a code before hashing: strip the dash and anything else the user
 * may have copied, and uppercase. Hashing the presentation form would make
 * `abcd-efgh` and `ABCD-EFGH` two different codes.
 */
function normaliseCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normaliseCode(code)).digest("hex");
}

/** Constant-time compare against a stored hash. */
export function verifyRecoveryCode(code: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashRecoveryCode(code));
  const stored = Buffer.from(storedHash);
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}
