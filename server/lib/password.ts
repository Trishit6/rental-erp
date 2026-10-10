/**
 * Password hashing and policy, on Node's built-in `crypto` only.
 *
 * ## Why scrypt rather than bcrypt
 *
 * `bcryptjs` is a pure-JavaScript implementation: every comparison and every hash
 * spends CPU in the V8 heap, and its cost is tuned by one small integer. scrypt is
 * a memory-hard KDF built into Node, so the same wall-clock cost also demands tens
 * of megabytes of RAM per attempt — which is exactly what makes a GPU (or a
 * botnet of GPUs) a poor attacker for a leaked hash dump. It needs no native build
 * step and no dependency.
 *
 * ## Why the stored string is versioned
 *
 * The parameters (`N`, `r`, `p`, key length) are written *into* the hash, so the
 * verifier reads them back rather than assuming today's constants. That is what
 * makes raising the cost a deploy rather than a migration: existing hashes keep
 * verifying with the parameters they were made with, and `needsRehash` tells the
 * login path to transparently upgrade the row the next time the user signs in.
 *
 * ## Why legacy bcrypt hashes still verify
 *
 * The screenshots, the demo seed and every account created before this change are
 * bcrypt. Refusing them would lock out every existing user. Instead a bcrypt hash
 * verifies once, and `verifyPassword` reports that it should be rehashed; the next
 * successful login rewrites the row in the scrypt format. Old hashes therefore
 * drain away with use, and no password is ever asked for twice.
 */

import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "crypto";
import bcrypt from "bcryptjs";

/** scrypt parameters, pinned by the security brief. */
export const SCRYPT_N = 1 << 15; // 2^15
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
export const SCRYPT_SALT_BYTES = 16;
export const SCRYPT_KEY_BYTES = 64;

/**
 * scrypt needs `128 * N * r` bytes of memory plus room for `p` lanes. Node's
 * default `maxmem` is 32 MiB, and `128 * 32768 * 8` is exactly 32 MiB, so the
 * default sits on the boundary and can reject the pinned parameters. Doubling the
 * budget makes the constant a function of the parameters rather than of Node's
 * default.
 */
const SCRYPT_MAXMEM = 128 * SCRYPT_N * SCRYPT_R * 2;

/** The scheme tag written into every hash this module produces. */
const SCRYPT_SCHEME = "scrypt";

/* --------------------------------- policy ---------------------------------- */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 100;

/**
 * A deliberately small built-in list of the passwords that top every breach
 * corpus. This is not a substitute for a full list (or a breached-password API) —
 * it is the floor that stops `password1` and `welcome123` being the cheapest
 * possible accounts, without shipping a multi-megabyte wordlist or a network call
 * in the sign-up path.
 */
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "passw0rd",
  "12345678",
  "123456789",
  "1234567890",
  "qwertyui",
  "qwerty123",
  "iloveyou",
  "letmein",
  "welcome",
  "welcome1",
  "welcome123",
  "admin123",
  "administrator",
  "monkey123",
  "dragon123",
  "football",
  "baseball",
  "sunshine",
  "princess",
  "abc12345",
  "revaro",
  "revaro123",
  "rentbuyse",
  "changeme",
  "changeme1",
]);

function normalise(password: string): string {
  // Case-insensitive so `Password1` is caught by `password1`; the list is about
  // guessability, not about exact bytes.
  return password.trim().toLowerCase();
}

/**
 * Every reason a password is unacceptable, empty when it is fine.
 *
 * Returns a list rather than throwing so the caller decides the status code and
 * the response shape, and so a UI can show all the problems at once instead of one
 * per submission.
 */
export function passwordIssues(password: string, context?: { email?: string; name?: string }): string[] {
  const issues: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    issues.push(`Use at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    issues.push("Password is too long");
  }
  const normalised = normalise(password);
  if (COMMON_PASSWORDS.has(normalised)) {
    issues.push("That password is too common. Choose something less guessable.");
  }
  // The local part of the user's own email is a password people reach for; the
  // check is only made when the address is known (register/reset, not login).
  const emailLocal = context?.email?.split("@")[0]?.trim().toLowerCase();
  if (emailLocal && emailLocal.length >= 4 && normalised === emailLocal) {
    issues.push("Your password must not be your email address.");
  }
  return issues;
}

/** True when the password satisfies the full policy. */
export function isPasswordAcceptable(
  password: string,
  context?: { email?: string; name?: string },
): boolean {
  return passwordIssues(password, context).length === 0;
}

/* --------------------------------- hashing --------------------------------- */

function derive(
  password: string,
  salt: Buffer,
  params: { N: number; r: number; p: number; keylen: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      params.keylen,
      { N: params.N, r: params.r, p: params.p, maxmem: SCRYPT_MAXMEM },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey as Buffer);
      },
    );
  });
}

export type ScryptHash = {
  N: number;
  r: number;
  p: number;
  keylen: number;
  salt: Buffer;
  digest: Buffer;
};

/**
 * Parse a stored scrypt hash.
 *
 * Format: `scrypt$N$r$p$keylen$<salt base64url>$<digest base64url>`. Base64url has
 * no `$`, so splitting on `$` is unambiguous. Returns `null` for anything that does
 * not parse — the caller then falls back to bcrypt, and a completely unknown
 * format simply fails to verify.
 */
export function parseScryptHash(stored: string): ScryptHash | null {
  const parts = stored.split("$");
  if (parts.length !== 7 || parts[0] !== SCRYPT_SCHEME) return null;
  const [, rawN, rawR, rawP, rawKeylen, rawSalt, rawDigest] = parts;
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  const keylen = Number(rawKeylen);
  if (![N, r, p, keylen].every((value) => Number.isInteger(value) && value > 0)) return null;
  let salt: Buffer;
  let digest: Buffer;
  try {
    salt = Buffer.from(rawSalt!, "base64url");
    digest = Buffer.from(rawDigest!, "base64url");
  } catch {
    return null;
  }
  if (salt.length === 0 || digest.length === 0) return null;
  return { N, r, p, keylen, salt, digest };
}

/** Hash a password with the pinned parameters, returning the versioned string. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const digest = await derive(password, salt, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    keylen: SCRYPT_KEY_BYTES,
  });
  return [
    SCRYPT_SCHEME,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    SCRYPT_KEY_BYTES,
    salt.toString("base64url"),
    digest.toString("base64url"),
  ].join("$");
}

/** A scrypt hash that is not the pinned current parameters and should be upgraded. */
export function needsRehash(stored: string): boolean {
  const parsed = parseScryptHash(stored);
  if (!parsed) return true; // legacy bcrypt, or something unrecognised
  return (
    parsed.N !== SCRYPT_N ||
    parsed.r !== SCRYPT_R ||
    parsed.p !== SCRYPT_P ||
    parsed.keylen !== SCRYPT_KEY_BYTES
  );
}

/** True when the stored value is a bcrypt hash (all common `$2*$` prefixes). */
export function isLegacyHash(stored: string): boolean {
  return /^\$2[aby]?\$/.test(stored);
}

/**
 * Verify a password against a stored hash, in constant time for the scrypt half.
 *
 * A malformed or unknown hash returns `false` rather than throwing: the caller is
 * the login path, and "we could not parse your credential" must be indistinguishable
 * from "wrong password" or the response becomes an oracle.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored) return false;

  const parsed = parseScryptHash(stored);
  if (parsed) {
    const candidate = await derive(password, parsed.salt, parsed);
    if (candidate.length !== parsed.digest.length) return false;
    return timingSafeEqual(candidate, parsed.digest);
  }

  if (isLegacyHash(stored)) {
    try {
      return await bcrypt.compare(password, stored);
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Verify a password and, when it verified against a legacy or outdated hash,
 * return its replacement so the caller can upgrade the row in the same request.
 *
 * This is the upgrade-on-login primitive: the password is in hand only for the
 * moment of a successful sign-in, which is the only time a transparent rehash can
 * happen without asking the user for anything.
 */
export async function verifyAndRehash(
  password: string,
  stored: string,
): Promise<{ ok: boolean; upgradedHash: string | null }> {
  const ok = await verifyPassword(password, stored);
  if (!ok) return { ok: false, upgradedHash: null };
  if (!needsRehash(stored)) return { ok: true, upgradedHash: null };
  return { ok: true, upgradedHash: await hashPassword(password) };
}
