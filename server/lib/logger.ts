/**
 * The server logger, and the redaction that makes it safe to use.
 *
 * ## Why redaction lives in the logger and not at each call site
 *
 * "Never log a password" is a rule every developer agrees with and a rule that
 * gets broken the first time someone debugs a failing sign-in and reaches for the
 * request body. Putting the redaction *inside* the logger means the unsafe thing
 * (passing a whole object) is also the safe thing, and the reviewer's attention
 * goes to whether an argument should be logged at all rather than to whether its
 * every field has been scrubbed.
 *
 * Two layers, because either alone leaks:
 *
 *  - **Key-based** — a value under `password`, `authorization`, `cookie`, `token`,
 *    `cvv`, `otp`, … is replaced wholesale, whatever its shape. This catches the
 *    structured cases (`{ password: "hunter2" }`).
 *  - **Shape-based** — a *string* anywhere that looks like a bearer token, a JWT
 *    or a long hex secret is replaced, whatever its key. This catches the
 *    unstructured cases (a token inside a message, a signed URL in a query).
 *
 * The functions are pure and exported so the redaction can be unit-tested without
 * capturing `console` output.
 */

import { inspect } from "node:util";

/** A field whose value is always secret, compared case- and separator-insensitively. */
const SENSITIVE_KEYS = new Set([
  "password",
  "currentpassword",
  "newpassword",
  "confirmpassword",
  "passwordhash",
  "token",
  "accesstoken",
  "refreshtoken",
  "tokens",
  "tokenhash",
  "idtoken",
  "authorization",
  "cookie",
  "cookies",
  "setcookie",
  "secret",
  "clientsecret",
  "apikey",
  "privatekey",
  "sessionsecret",
  "card",
  "cardnumber",
  "cardnumberlast4",
  "cvv",
  "cvc",
  "pan",
  "upi",
  "vpa",
  "otp",
  "mfa",
  "totp",
  "recoverycode",
  "recoverycodes",
  "ticket",
  "csrf",
  "csrftoken",
  // The double-submit *header* carries the `X-` prefix, so `X-CSRF-Token`
  // normalises to `xcsrftoken` rather than `csrftoken`.
  "xcsrftoken",
]);

/** Normalises `Content-Type`, `content_type` and `contenttype` to one key. */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(normalizeKey(key));
}

const REDACTED = "[redacted]";

/** A JWT is three base64url segments; `eyJ` is the base64 of a JSON header. */
const JWT_SHAPE = /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g;
const BEARER_SHAPE = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
/** 32+ hex characters: an HMAC, a session id, a 256-bit key — never prose. */
const LONG_HEX_SHAPE = /\b[a-f0-9]{32,}\b/gi;
/**
 * `scheme://user:password@host` — the userinfo half of a connection string or a
 * signed URL. This is the shape `DATABASE_URL`, `MIGRATE_DB_*` and a signed image
 * link all take, and the one a driver error most often quotes back verbatim
 * (`ER_ACCESS_DENIED_ERROR` names the account it tried). The password is replaced
 * and the account is kept, so the log still says *who* failed without saying how
 * to become them.
 */
const URL_USERINFO_SHAPE = /([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+):([^/\s@]+)@/gi;
/** A 6–10 digit code in a `code` field: an OTP or a TOTP, not an enum. */
const OTP_SHAPE = /^\d{5,10}$/;

/** Redact token-shaped substrings inside a free string. */
export function redactString(value: string): string {
  return value
    .replace(JWT_SHAPE, "[redacted-jwt]")
    .replace(BEARER_SHAPE, "Bearer [redacted]")
    .replace(URL_USERINFO_SHAPE, "$1$2:[redacted]@")
    .replace(LONG_HEX_SHAPE, "[redacted-secret]");
}

/**
 * Deep-clone `value` with every secret replaced by a marker.
 *
 * Cycles are handled with a `WeakSet` so a log call over a self-referential object
 * returns rather than blowing the stack. `Date`, `Buffer` and `Error` are passed
 * through (an `Error` keeps only its `message`, via the caller extracting it), and
 * anything else non-plain is stringified defensively.
 */
export function redact(
  value: unknown,
  key?: string,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (key !== undefined && isSensitiveKey(key)) return REDACTED;
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (key !== undefined && normalizeKey(key) === "code" && OTP_SHAPE.test(value)) return REDACTED;
    return redactString(value);
  }
  if (typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return { name: value.name, message: redactString(value.message) };
  if (Buffer.isBuffer(value)) return `[buffer ${value.byteLength} bytes]`;
  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => redact(item, undefined, seen));

  const out: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
    out[entryKey] = redact(entryValue, entryKey, seen);
  }
  return out;
}

/** Headers are redacted more aggressively: `authorization`, `cookie`, `set-cookie`, CSRF. */
export function redactHeaders(
  headers: Record<string, unknown> | undefined,
): Record<string, string> {
  if (!headers) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = isSensitiveKey(key) ? REDACTED : redactString(String(value));
  }
  return out;
}

/**
 * Redact query parameters whose key is secret, keeping the path readable.
 *
 * A URL is the one place a credential shows up *outside* a body — a reset link, a
 * signed image — and it reaches the request log verbatim. `/api/reset?token=abc`
 * should log as `/api/reset?token=[redacted]`.
 */
export function redactUrl(url: string): string {
  const split = url.indexOf("?");
  if (split < 0) return redactString(url);
  const path = url.slice(0, split);
  const query = new URLSearchParams(url.slice(split + 1));
  for (const key of [...query.keys()]) {
    if (isSensitiveKey(key)) query.set(key, REDACTED);
  }
  const rendered = query.toString();
  return rendered ? `${path}?${rendered}` : path;
}

export type LogContext = Record<string, unknown>;

function write(level: "info" | "warn" | "error", message: string, context?: LogContext): void {
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    msg: redactString(message),
    ...(context ? { ctx: redact(context) } : {}),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/**
 * The one logger. Always structured, always redacted.
 *
 * `debug` output is gated on `NODE_ENV !== "production"` so a forgotten debug call
 * cannot become a production log stream.
 */
export const logger = {
  info: (message: string, context?: LogContext) => write("info", message, context),
  warn: (message: string, context?: LogContext) => write("warn", message, context),
  error: (message: string, context?: LogContext) => write("error", message, context),
  debug: (message: string, context?: LogContext) => {
    if (process.env.NODE_ENV !== "production") write("info", message, context);
  },
};

/**
 * Routes whose *bodies* must never be logged, even at debug level.
 *
 * The logger never receives a body today — the request log records method, path
 * and status only — but naming the rule here keeps it from being lost if a body
 * logger is ever added: passwords, reset tokens, MFA codes, card/UPI data and
 * payment intents all travel through these prefixes.
 */
const BODY_SECRET_PREFIXES = ["/api/auth", "/api/payments", "/api/seller/wallet", "/api/storage"];

export function mayLogBody(pathname: string): boolean {
  return !BODY_SECRET_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** Defensive stringification for a value that is not already a plain object. */
export function describeForLog(value: unknown): string {
  if (typeof value === "string") return redactString(value);
  return inspect(redact(value), { depth: 3, breakLength: 120 });
}

/**
 * The only fields of an error that may reach a log line.
 *
 * A thrown error is the most tempting thing to log whole and the most dangerous: a
 * driver error can carry the failing statement and its bound values, and a message
 * can quote a token or a connection string. This reduces any error to its `name`,
 * its `message` (passed through `redactString`, so a secret embedded in the text is
 * still scrubbed) and the driver's `code` — an enum like `ER_DUP_ENTRY`, never a
 * value. Anything without a `name` is stringified and redacted.
 */
export function redactError(error: unknown): { name: string; message: string; code?: string } {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return {
      name: error.name,
      message: redactString(error.message),
      ...(typeof code === "string" || typeof code === "number" ? { code: String(code) } : {}),
    };
  }
  return { name: "Error", message: redactString(String(error)) };
}
