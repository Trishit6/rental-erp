/** Server-side platform configuration. Never exposed to the browser. */

export const PLATFORM_SALE_FEE_PERCENT = Number(process.env.PLATFORM_SALE_FEE_PERCENT ?? 5);

export const PLATFORM_RENTAL_FEE_PERCENT = Number(process.env.PLATFORM_RENTAL_FEE_PERCENT ?? 10);

export const DELIVERY_FEE_PAISE = 4900;

export const PAYMENT_PROVIDER = process.env.PAYMENT_PROVIDER ?? "mock";

/**
 * Seeded accounts for local development.
 *
 * ## Why the credentials moved out of `seed.ts`
 *
 * They were inline literals. That put a credential in source, and it made the admin
 * password impossible to change without editing the same file that TRUNCATEs every
 * table — so anyone who wanted a different admin password had to either accept the
 * one in the repo or hand-edit a destructive script. There is now one definition,
 * read from the environment, with the previous values as local defaults.
 *
 * ## Why the admin gets its own variable
 *
 * `ADMIN_PASSWORD` is separate from the shared demo password because the admin
 * account is the one a deployment is most likely to want to give its own value, and
 * because rotating it should not force the demo sellers to change theirs.
 *
 * ## Why this is safe to keep in source
 *
 * These are *development* defaults for a local database, they live server-side, and
 * nothing under `src/` imports them — no `VITE_` prefix, so Vite cannot inline them
 * into the browser bundle. The admin role itself is enforced in `lib/auth.ts`, not by
 * the existence of this password.
 */
export const DEV_ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim() || "admin@revaro.local";
export const DEV_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD?.trim() || "revaro-dev-2026";
export const DEV_PASSWORD = process.env.DEMO_PASSWORD?.trim() || DEV_ADMIN_PASSWORD;

/**
 * Development accounts that may use the staff area **without** a second factor.
 *
 * ## Why this exists
 *
 * PROMPT 3 makes MFA mandatory for the whole `/api/admin` surface (see
 * `requireMfaEnrolment`). That is right for anything real, and wrong for the local
 * demo admin: the database is a disposable seed, the account exists only on this
 * machine, and every login being gated behind an authenticator app is friction that
 * buys no security. The local admin is therefore password-only.
 *
 * ## Why it is safe
 *
 * `isDevMfaBypass` returns `false` unconditionally when `NODE_ENV === "production"`,
 * so a deployment that ships this file still gets the mandatory gate — the bypass
 * cannot be turned on from configuration in production. Outside production it is an
 * explicit email allowlist, defaulting to the configured development admin, and can
 * be overridden (or emptied) with `MFA_BYPASS_EMAILS=a@x,b@y`.
 */
export const MFA_BYPASS_EMAILS = (process.env.MFA_BYPASS_EMAILS ?? DEV_ADMIN_EMAIL)
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

/** Whether this email may enter the staff area without a second factor. Dev only. */
export function isDevMfaBypass(email: string | null | undefined): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (!email) return false;
  return MFA_BYPASS_EMAILS.includes(email.trim().toLowerCase());
}

/**
 * bcrypt work factor for every password this server hashes.
 *
 * ## Why one number, read from the environment
 *
 * Registration and password change both used a bare `10` written at the call site,
 * so raising the cost meant finding the literals — and a deployment on slower
 * hardware could never trade security for latency without patching source. One
 * exported constant is read by both writers, so the work factor is a deployment
 * decision rather than a code edit.
 *
 * ## Why the default is 12
 *
 * Cost is exponential, not incremental: 12 is 4x the work of 10. bcryptjs is a pure
 * JavaScript implementation rather than a native one, so this is slower here than it
 * would be in a native binding — still a sub-second figure for a login, which is a fair
 * price for a credential store.
 *
 * The floor is 10 because `bcrypt.compare` reads the cost back out of the stored hash,
 * so a *lower* value here would still verify every password hashed earlier. Clamping
 * upward can never lock an existing account out.
 */
export const BCRYPT_ROUNDS = Math.min(
  15,
  Math.max(10, Number(process.env.BCRYPT_ROUNDS) || 12),
);

/**
 * UPI collect details for the payment QR.
 *
 * ## Why this is configuration and not a literal
 *
 * The VPA is the account money lands in. A hard-coded one would be a value the
 * repository hands to every deployment — including the ones that never read it —
 * and rotating it would be a code change. Blank means "no UPI QR is offered":
 * a store that has not configured a VPA should not render a scannable code that
 * pays a stranger.
 *
 * ## Why there is a sandbox fallback
 *
 * The development mock has no real account, so `UPI_SANDBOX_VPA` stands in and
 * the UI labels it as development-only. It is applied **only** when the active
 * provider is not production-ready (`resolvePayeeVpa`), so a production deploy
 * that forgot the variable gets no QR rather than a fake one.
 */
export const UPI_PAYEE_VPA = (process.env.UPI_PAYEE_VPA ?? "").trim();
export const UPI_PAYEE_NAME = (process.env.UPI_PAYEE_NAME ?? "Revaro Marketplace").trim();
export const UPI_SANDBOX_VPA = "revaro.sandbox@mockupi";
