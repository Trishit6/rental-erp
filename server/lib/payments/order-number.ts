import { randomBytes } from "node:crypto";

/**
 * Customer-facing order numbers.
 *
 * The database `id` is an auto-increment, so it leaks volume and ordering to
 * everyone who can see an order. The order number is what the customer is
 * shown, quoted in support, and typed into a search box — so it must be
 * non-sequential and must not encode how many orders came before it.
 *
 * Format: `RV-<year>-<6 chars>` from a 32-symbol alphabet, e.g. `RV-2026-8F3K2A`.
 *
 * 32 symbols (no 0/O/1/I/L) keeps it unambiguous when read aloud or copied off
 * a screen. 6 characters is 30 bits, so collisions are rare but not impossible
 * — the column carries a unique index and `createOrderNumber` retries on
 * conflict rather than assuming it cannot happen.
 */

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const ALPHABET_LENGTH = ALPHABET.length;
const SUFFIX_LENGTH = 6;

export const ORDER_NUMBER_PREFIX = "RV";

export function orderNumberSuffix(length = SUFFIX_LENGTH): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    // `%` over a 32-symbol alphabet is unbiased here because 256 % 32 === 0.
    out += ALPHABET[bytes[i] % ALPHABET_LENGTH];
  }
  return out;
}

export function formatOrderNumber(suffix: string, year = new Date().getFullYear()): string {
  return `${ORDER_NUMBER_PREFIX}-${year}-${suffix}`;
}

export function createOrderNumber(year = new Date().getFullYear()): string {
  return formatOrderNumber(orderNumberSuffix(), year);
}

const ORDER_NUMBER_PATTERN = new RegExp(`^${ORDER_NUMBER_PREFIX}-\\d{4}-[${ALPHABET}]{6}$`);

export function isOrderNumber(value: unknown): value is string {
  return typeof value === "string" && ORDER_NUMBER_PATTERN.test(value);
}
