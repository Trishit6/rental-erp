/**
 * Shared validation primitives.
 *
 * The route files already parse with Zod per request — `schema-zod.ts` holds the
 * entity schemas and feature files hold their own. This module exists for the
 * rules that would otherwise be re-written per route and slowly disagree:
 *
 *  - **Typed field validators** — ids, enums, plain strings, http(s)-only URLs.
 *  - **`strictBody`** — the "reject unknown fields on sensitive endpoints" rule,
 *    applied to the auth and payment schemas so a renamed or forged field is a
 *    400 rather than a silently-ignored extra.
 *  - **`limitBody`** — a per-route body-size ceiling in front of the global
 *    parser limit, for the endpoints whose inputs are tiny by design (a login,
 *    a reset) and where an oversized body is itself suspicious.
 */

import { z } from "zod";
import { fail } from "./api";
import type { Middleware } from "./http";

/** A positive integer identifier: `:id` params and numeric ids in bodies. */
export const idSchema = z.coerce.number().int().positive();

/** Any positive integer amount (paise, counts). */
export const positiveInt = z.coerce.number().int().positive();

/** A non-negative integer. */
export const nonNegativeInt = z.coerce.number().int().min(0);

/** A trimmed string with a closed length range. */
export function trimmed(min: number, max: number): z.ZodString {
  return z.string().trim().min(min).max(max);
}

/** An email, lower-cased and trimmed. */
export const emailAddress = z.string().trim().toLowerCase().email();

/**
 * A URL that points at an http(s) resource only.
 *
 * Anything else — `javascript:`, `data:`, a file path, a protocol-relative
 * string — is refused. Used for avatar/image URLs, callback URLs and anywhere a
 * client-supplied location is stored or followed.
 */
export const httpUrl = z
  .string()
  .trim()
  .url()
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }, "Use an http(s) URL");

/** An enum restricted to the passed literal values. */
export function enumOf<T extends readonly [string, ...string[]]>(values: T) {
  // `z.enum`'s parameter is a mutable tuple; a `readonly` const tuple is exactly
  // what callers already have, so the widening happens here and nowhere else.
  return z.enum(values as unknown as [string, ...string[]]);
}

/** The whitelist form: an object schema that rejects unknown keys. */
export const strictBody = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();

/**
 * Refuse requests whose body exceeds `maxBytes`.
 *
 * Answers 413 with the API's own envelope (not the body-parser's HTML error),
 * and runs *inside* a router so the check belongs to the route's security
 * posture rather than to the global parser. `Content-Length` is checked first —
 * the cheap, obvious signal — and the already-parsed body is checked as well for
 * callers that do not send the header.
 */
export function limitBody(maxBytes: number): Middleware {
  return async (c, next) => {
    const declared = Number(c.req.header("content-length") ?? "0");
    if (Number.isInteger(declared) && declared > maxBytes) {
      return c.json(fail("PAYLOAD_TOO_LARGE", "Request body is too large."), 413);
    }
    const parsed = c.req.raw.body;
    if (Buffer.isBuffer(parsed) && parsed.length > maxBytes) {
      return c.json(fail("PAYLOAD_TOO_LARGE", "Request body is too large."), 413);
    }
    await next();
  };
}