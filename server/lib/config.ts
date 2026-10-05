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
