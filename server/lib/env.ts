/**
 * Server-side environment configuration.
 *
 * Everything authentication depends on is read from the environment, never from
 * source: the two JWT secrets sign and verify the cookies that stand in for a
 * password, so a value living in the repository is a value anyone with read
 * access can use to mint a session for any account — including one that does not
 * exist yet.
 *
 * ## Why validation lives here rather than at each read site
 *
 * A missing secret is a deployment problem, and a deployment problem should fail
 * once, loudly, at startup — not the first time somebody tries to sign in, and
 * not as a `JWT_SECRET undefined` string inside a500 body that reaches a user.
 * `assertServerEnv()` is called by `server/index.ts` before the listener opens,
 * and reports *every* missing variable at once rather than one per restart.
 *
 * ## What never happens here
 *
 * No value is exported into `src/`. There is no `VITE_` alias, no fallback
 * literal and no "dev default": a development secret that also exists in source
 * is a production secret that someone forgot to change.
 */

import "dotenv/config";

import { databaseCredentials } from "./db-credentials";

/** Minimum length accepted for a JWT secret, in characters. */
const MIN_SECRET_LENGTH = 32;

/**
 * Access-token lifetime: 15 minutes.
 *
 * Short, because this is the token whose theft does the most damage — it is
 * accepted by every endpoint without further checks. The refresh flow exists so
 * that a short life costs the user nothing: they never see the renewal.
 */
export const ACCESS_TOKEN_TTL_SECONDS = readSeconds("AUTH_ACCESS_TTL_SECONDS", 15 * 60, 60);

/**
 * Refresh-token lifetime: 7 days.
 *
 * This is the "stay signed in on this device" window, and it is deliberately the
 * long one — the credential it guards is a rotated, server-recorded secret in an
 * HttpOnly cookie rather than the widely-accepted bearer token. Configurable
 * because a deployment's answer to "how long is a device trusted" is a product
 * decision, not a code constant.
 */
export const REFRESH_TOKEN_TTL_SECONDS = readSeconds(
  "AUTH_REFRESH_TTL_SECONDS",
  7 * 24 * 60 * 60,
  60,
);

/**
 * How long a refresh token stays usable *after* it has been rotated away.
 *
 * Two tabs of one browser share one cookie jar, so an expiring access token wakes
 * both of them at the same moment and both send the refresh request before
 * either response lands. Without a grace window the second request reads as
 * replay of an already-used token and revokes the session — the user is signed
 * out of every device for the crime of having two tabs open. Within this window
 * the previous token rotates again instead; outside it, presentation of a
 * rotated-away token is treated as reuse and the session dies.
 *
 * Sixty seconds is longer than any realistic pair of in-flight refreshes and
 * shorter than the time an attacker needs to do anything useful with a stolen
 * cookie.
 */
export const REFRESH_REUSE_GRACE_SECONDS = readSeconds("AUTH_REFRESH_REUSE_GRACE_SECONDS", 60, 0);

/**
 * Is this a production process?
 *
 * A function rather than a module constant so tests (and any future hot reload)
 * see the value the process actually has *now* — cookie `Secure` is decided from
 * it, and baking it in at import time would make the assertion that production
 * cookies are `Secure` untestable in a development process.
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Signing secret for access tokens.
 *
 * Read per call rather than cached, so an operator adding the variable to a
 * running dev process and a test that sets it in `setup.ts` both take effect
 * without a module-ordering puzzle.
 */
export function accessTokenSecret(): string {
  return requireSecret("JWT_ACCESS_SECRET");
}

/**
 * Signing secret for refresh tokens.
 *
 * Separate from the access secret on purpose: the two sign different things with
 * different lifetimes, and a rotation of one (a leak of the short-lived token's
 * key) must not require rotating — or invalidate — the other.
 */
export function refreshTokenSecret(): string {
  return requireSecret("JWT_REFRESH_SECRET");
}

/**
 * The AES-256-GCM key that protects TOTP secrets at rest.
 *
 * Not a "signing" secret, so it does not go through `requireSecret`, but held to the
 * same standard: exactly 32 bytes, read from the environment, never defaulted. A
 * short or predictable key makes the encryption on `user_mfa.secret_encrypted`
 * decorative. Accepted as base64 (the `openssl rand -base64 32` shape) or as 64 hex
 * characters, because both are what an operator reaches for.
 */
export function mfaEncryptionKey(): Buffer {
  const value = process.env.MFA_ENCRYPTION_KEY?.trim();
  if (!value) {
    throw new Error(
      "Missing required environment variable MFA_ENCRYPTION_KEY. Generate 32 random bytes, " +
        "e.g. `node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"`.",
    );
  }
  const key = /^[0-9a-f]{64}$/i.test(value)
    ? Buffer.from(value, "hex")
    : Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new Error(
      "MFA_ENCRYPTION_KEY must be exactly 32 bytes: either base64 or 64 hex characters. " +
        "The TOTP secrets are encrypted with it, so a short key is not a lesser setting.",
    );
  }
  return key;
}

/**
 * How long an MFA challenge ticket stays valid.
 *
 * The ticket is minted after a correct password and spent by a correct TOTP code —
 * a few seconds on a normal sign-in. Five minutes is generous for a slow
 * authenticator while keeping a captured ticket from being a durable credential.
 */
export const MFA_TICKET_TTL_SECONDS = readSeconds("AUTH_MFA_TICKET_TTL_SECONDS", 5 * 60, 60);

/**
 * How long a password-reset link is valid. One hour: long enough to reach an inbox
 * and use it, short enough that a stale mail in a shared mailbox is not a standing
 * reset credential.
 */
export const PASSWORD_RESET_TTL_SECONDS = readSeconds(
  "AUTH_PASSWORD_RESET_TTL_SECONDS",
  60 * 60,
  300,
);

/**
 * Login throttling, backed by `login_attempts`.
 *
 * `LOGIN_WINDOW_SECONDS` is the look-back window; `LOGIN_MAX_FAILURES` is how many
 * failures inside it move an identifier (or an IP) into lockout, and
 * `LOGIN_LOCKOUT_SECONDS` is how long that lasts. The named `auth.login` budget in
 * `lib/rate-limit.ts` is the coarse, per-IP-and-per-account brake in front of this;
 * this is the durable one that survives a restart and follows the *account*, not the
 * socket. (There is no longer a global in-memory limiter on every route — limits are
 * opt-in per route via the `RATE_LIMITS` registry.)
 */
export const LOGIN_WINDOW_SECONDS = readSeconds("AUTH_LOGIN_WINDOW_SECONDS", 15 * 60, 60);
export const LOGIN_LOCKOUT_SECONDS = readSeconds("AUTH_LOGIN_LOCKOUT_SECONDS", 15 * 60, 0);
export const LOGIN_MAX_FAILURES = readInt("AUTH_LOGIN_MAX_FAILURES", 5, 1);

function requireSecret(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(
      `Missing required environment variable ${name}. Set it to a long random string ` +
        `(at least ${MIN_SECRET_LENGTH} characters) before starting the API — ` +
        `see .env.example.`,
    );
  }
  if (value.trim().length < MIN_SECRET_LENGTH) {
    throw new Error(
      `${name} is too short: use at least ${MIN_SECRET_LENGTH} characters. ` +
        `A short signing secret is guessable, which makes every session mintable by anyone.`,
    );
  }
  return value.trim();
}

function readSeconds(name: string, fallback: number, min: number, max?: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined || raw.trim() === "" ? fallback : Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max ?? Number.MAX_SAFE_INTEGER, Math.max(min, Math.floor(parsed)));
}

function readInt(name: string, fallback: number, min: number, max?: number): number {
  return readSeconds(name, fallback, min, max);
}

/**
 * Whether a database connection has been *configured*, as opposed to running on
 * the built-in development defaults in `server/db.ts`.
 *
 * `DATABASE_URL` alone is enough; the `DB_*` variables count because the pool
 * accepts either.
 */
export function hasDatabaseConfig(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.DB_HOST || process.env.DB_NAME);
}

/**
 * The application's own base URL.
 *
 * `APP_URL` is the canonical name. `APP_BASE_URL` is the older spelling still read
 * by a handful of files; it is honoured as a fallback but warns once per process, so
 * a leftover legacy value shows up in the logs instead of silently doing nothing.
 */
let warnedLegacyAppBaseUrl = false;
export function appBaseUrl(): string {
  const primary = process.env.APP_URL?.trim();
  if (primary) return primary;
  const legacy = process.env.APP_BASE_URL?.trim();
  if (legacy) {
    if (!warnedLegacyAppBaseUrl) {
      warnedLegacyAppBaseUrl = true;
      console.warn("[config] APP_BASE_URL is deprecated — use APP_URL instead.");
    }
    return legacy;
  }
  return "";
}

/**
 * Validate everything the API cannot start without. Throws a single error naming
 * every problem, so one restart fixes one deployment instead of five.
 *
 * Called once from `server/index.ts` before the port opens. Never called from a
 * request path: an operator mistake should surface in the terminal that started
 * the process, not in a user's browser.
 */
export function assertServerEnv(): void {
  const problems: string[] = [];

  try {
    accessTokenSecret();
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
  try {
    refreshTokenSecret();
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
  try {
    mfaEncryptionKey();
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }

  // In development the pool falls back to localhost/reloop, which is exactly what
  // a fresh checkout wants and what `db:studio`/`db:migrate` already assume, so an
  // unconfigured database is not an error there. In production those same defaults
  // would mean quietly connecting to whatever happens to be listening on 3306, so
  // an unconfigured database is a startup failure rather than a surprise later.
  if (isProduction() && !hasDatabaseConfig()) {
    problems.push(
      "No database configured: set DATABASE_URL (or DB_HOST / DB_NAME). " +
        "The built-in development defaults are not a deployment configuration.",
    );
  }

  // Least privilege. In production, connecting as `root` — or with no password at
  // all — is not a configuration, it is the absence of one: any credential that
  // reaches this process then also has the run of the database. Fail at startup so
  // the operator fixes the *deployment* rather than discovering the exposure later.
  // No credential value is ever placed in the message; only the variable name.
  if (isProduction()) {
    const credentials = databaseCredentials();
    if (credentials.user.trim().toLowerCase() === "root") {
      problems.push(
        'The database user resolves to "root". In production the API must connect as a ' +
          "least-privilege account: set DB_USER (or the user in DATABASE_URL) to the runtime " +
          "account created by docs/deploy/db-least-privilege.sql.",
      );
    }
    if (credentials.password.length === 0) {
      problems.push(
        "The database password is empty. Set DB_PASSWORD (or a password in DATABASE_URL) so " +
          "the API is not connecting unauthenticated.",
      );
    }
  }

  if (problems.length > 0) {
    throw new Error(`Refusing to start the API:\n- ${problems.join("\n- ")}`);
  }
}
