import { randomBytes } from "node:crypto";

/**
 * Customer-facing reference numbers for money and disputes.
 *
 * Same reasoning as `payments/order-number.ts`: the database `id` is a
 * sequential auto-increment, so publishing it leaks volume and ordering. These
 * are the values quoted in support and typed into a search box, so they must be
 * non-sequential. The 32-symbol alphabet omits `0/O/1/I/L` so a number read aloud
 * or copied off a screen is unambiguous.
 */

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const ALPHABET_LENGTH = ALPHABET.length;

function suffix(length = 6): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    // Unbiased because 256 % 32 === 0.
    out += ALPHABET[bytes[i] % ALPHABET_LENGTH];
  }
  return out;
}

/** `RV-RF-8F3K2A`. */
export function createRefundNumber(): string {
  return `RV-RF-${suffix()}`;
}

/** `RV-DSP-8F3K2A`. */
export function createDisputeNumber(): string {
  return `RV-DSP-${suffix()}`;
}
