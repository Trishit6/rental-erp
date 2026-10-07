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

  if (problems.length > 0) {
    throw new Error(`Refusing to start the API:\n- ${problems.join("\n- ")}`);
  }
}
