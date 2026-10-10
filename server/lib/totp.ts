/**
 * TOTP — RFC 6238 — on Node's `crypto` only.
 *
 * ## Why hand-written base32
 *
 * Authenticator apps exchange secrets as RFC 4648 base32 (`GEZDGNBV…`), and
 * Node has no base32 codec. The four extra dependencies that wrap TOTP each bring
 * their own base32 and their own opinions about digit count, hashing algorithm and
 * drift, none of which are configurable in one place. The function is 40 lines and
 * has RFC vectors to prove it, so it lives here next to the algorithm that uses it.
 *
 * ## Why SHA-1
 *
 * HMAC-SHA1 is what RFC 6238 specifies and what every authenticator app
 * implements. It is not a collision-resistance claim — the HMAC construction is
 * unaffected by SHA-1's collision weaknesses, and the output is truncated to six
 * digits — so "upgrading" to SHA-256 would break every enrolled app for no
 * security gain.
 *
 * ## Why one step of drift
 *
 * A phone clock a few seconds off, plus network latency, is enough for a code that
 * was valid when the user read it to be one step stale on arrival. Accepting the
 * previous and next step (a `window` of 1) is the standard tolerance. It is not
 * free — the valid window triples to 90 s — which is why the verification result
 * also returns the *matched counter*, and the caller records it so the same code
 * cannot be replayed inside its own window.
 */

import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32, no padding — the form authenticator apps accept. */
export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

/**
 * Decode RFC 4648 base32. Tolerant of lower case, spaces and `=` padding (users
 * retype secrets), strict about anything outside the alphabet — a stray character
 * is refused rather than silently dropped, because dropping one would derive a
 * different secret and quietly lock the account out of its own second factor.
 */
export function base32Decode(input: string): Buffer {
  const cleaned = input
    .toUpperCase()
    .replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error("Invalid base32 character");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** 20 random bytes (160 bits), the size RFC 4226 recommends for HMAC-SHA1. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export type TotpOptions = {
  /** Seconds per code. 30 is the universal authenticator default. */
  step?: number;
  /** Digits in the code. Six for apps; eight only for the RFC test vectors. */
  digits?: number;
  /** Unix milliseconds. Injectable so the drift test is deterministic. */
  now?: number;
  /** Unix seconds override, for the RFC vectors. Takes precedence over `now`. */
  unixSeconds?: number;
};

/**
 * The HOTP value (RFC 4226) at a counter, as a zero-padded string.
 *
 * Dynamic truncation: the low nibble of the last byte selects a 4-byte window, and
 * the top bit of that window is masked off so the result is positive in every
 * language's integer model.
 */
export function hotp(secretBase32: string, counter: number, digits = 6): string {
  const key = base32Decode(secretBase32);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const truncated =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(truncated % 10 ** digits).padStart(digits, "0");
}

/** The TOTP value at a moment, per RFC 6238. */
export function generateTotp(secretBase32: string, options: TotpOptions = {}): string {
  const step = options.step ?? 30;
  const digits = options.digits ?? 6;
  const unixSeconds = options.unixSeconds ?? Math.floor((options.now ?? Date.now()) / 1000);
  const counter = Math.floor(unixSeconds / step);
  return hotp(secretBase32, counter, digits);
}

export type TotpVerification = {
  valid: boolean;
  /** The step the code matched, or `null`. Used to reject in-window replay. */
  counter: number | null;
  /** Start of the matched step, in milliseconds — what `user_mfa.last_used_at` stores. */
  stepStartedAt: number | null;
};

/**
 * Verify a user-supplied code, allowing `window` steps either side.
 *
 * Comparison is constant-time over equal-length strings. A token of the wrong
 * length or with non-digits is rejected before any HMAC is computed, which also
 * avoids feeding arbitrary input to `base32Decode`.
 */
export function verifyTotp(
  secretBase32: string,
  token: string,
  options: TotpOptions & { window?: number } = {},
): TotpVerification {
  const step = options.step ?? 30;
  const digits = options.digits ?? 6;
  const window = options.window ?? 1;
  const unixSeconds = options.unixSeconds ?? Math.floor((options.now ?? Date.now()) / 1000);
  const counter = Math.floor(unixSeconds / step);

  if (!new RegExp(`^\\d{${digits}}$`).test(token)) {
    return { valid: false, counter: null, stepStartedAt: null };
  }

  for (let offset = -window; offset <= window; offset += 1) {
    const candidateCounter = counter + offset;
    if (candidateCounter < 0) continue;
    const expected = hotp(secretBase32, candidateCounter, digits);
    const a = Buffer.from(expected);
    const b = Buffer.from(token);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      return { valid: true, counter: candidateCounter, stepStartedAt: candidateCounter * step * 1000 };
    }
  }
  return { valid: false, counter: null, stepStartedAt: null };
}

/** The `otpauth://totp/...` URI an authenticator app scans. Never logged. */
export function buildOtpauthUrl(input: {
  secret: string;
  account: string;
  issuer: string;
  digits?: number;
  step?: number;
}): string {
  const label = encodeURIComponent(`${input.issuer}:${input.account}`);
  const params = new URLSearchParams({
    secret: input.secret,
    issuer: input.issuer,
    algorithm: "SHA1",
    digits: String(input.digits ?? 6),
    period: String(input.step ?? 30),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
