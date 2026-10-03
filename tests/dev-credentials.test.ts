import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * How the development credentials are resolved.
 *
 * ## Why this needs a test at all
 *
 * The admin password used to be an inline literal in `server/seed.ts`, which made it
 * impossible to change without editing the file that TRUNCATEs every table. Moving it
 * to the environment fixed that, but a `process.env` read that is silently wrong is
 * worse than a hardcoded value, because the hardcoded value at least always worked.
 * Three specific ways this can go wrong, and what each test below pins down:
 *
 *  1. A `.env` value that is present but blank — e.g. `ADMIN_PASSWORD=` left in a
 *     committed `.env.example` someone copied. `??` would accept `""` as a *real*
 *     password, so nobody could ever log in.
 *  2. A value with incidental whitespace from a copy-paste — the account silently
 *     does not match what was pasted.
 *  3. A typo'd variable name quietly falling back to the repository default, so the
 *     deployment looks like it took configuration but never did.
 *
 * The seed TRUNCATEs every table, so it cannot be run to check any of this. The
 * resolution has to be verifiable on its own.
 */

const CONFIG = "../server/lib/config";

/** Environment keys `config.ts` reads, so each test starts from a clean slate. */
const MANAGED = ["ADMIN_EMAIL", "ADMIN_PASSWORD", "DEMO_PASSWORD"] as const;

function clearManagedEnv() {
  for (const key of MANAGED) delete process.env[key];
}

/**
 * Imports `config.ts` fresh so its module-level `process.env` reads run again.
 *
 * Without `resetModules` the first import is cached and every later test would see
 * the first test's environment — the exact false pass this file is meant to avoid.
 */
async function loadConfig() {
  vi.resetModules();
  return (await import(CONFIG)) as typeof import("../server/lib/config");
}

afterEach(() => {
  clearManagedEnv();
  vi.resetModules();
});

describe("the development admin credentials", () => {
  it("falls back to the documented local defaults", async () => {
    clearManagedEnv();
    const { DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD } = await loadConfig();

    expect(DEV_ADMIN_EMAIL).toBe("admin@revaro.local");
    expect(DEV_ADMIN_PASSWORD).toBe("revaro-dev-2026");
  });

  it("takes the admin password from the environment", async () => {
    // The point of the change: rotating the admin password must not require editing
    // the script that destroys the database.
    process.env.ADMIN_PASSWORD = "something-else-entirely";
    const { DEV_ADMIN_PASSWORD } = await loadConfig();

    expect(DEV_ADMIN_PASSWORD).toBe("something-else-entirely");
  });

  it("takes the admin email from the environment", async () => {
    process.env.ADMIN_EMAIL = "ops@example.com";
    const { DEV_ADMIN_EMAIL } = await loadConfig();

    expect(DEV_ADMIN_EMAIL).toBe("ops@example.com");
  });

  it("treats a blank value as unset instead of as an empty password", async () => {
    // `ADMIN_PASSWORD=` is what you get from copying `.env.example` and filling in
    // everything except the one value you meant to set. With `??` the empty string
    // is a valid, unguessable, un-typeable password — the account is simply
    // unreachable, with no error anywhere to say why.
    process.env.ADMIN_PASSWORD = "";
    const { DEV_ADMIN_PASSWORD } = await loadConfig();

    expect(DEV_ADMIN_PASSWORD).toBe("revaro-dev-2026");
    expect(DEV_ADMIN_PASSWORD.length).toBeGreaterThan(0);
  });

  it("trims incidental whitespace", async () => {
    // Copy-pasting a generated password rarely preserves the leading newline, and a
    // password that does not match what was pasted fails at login, not at seed time.
    process.env.ADMIN_PASSWORD = "  padded-secret  ";
    process.env.ADMIN_EMAIL = "  ops@example.com  ";
    const { DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD } = await loadConfig();

    expect(DEV_ADMIN_PASSWORD).toBe("padded-secret");
    expect(DEV_ADMIN_EMAIL).toBe("ops@example.com");
  });

  it("never returns a blank value, whatever the environment says", async () => {
    // Whitespace-only is blank by any reasonable reading, and `trim()` alone would
    // let it through.
    process.env.ADMIN_PASSWORD = "   ";
    process.env.ADMIN_EMAIL = "\t\n ";
    const { DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD } = await loadConfig();

    expect(DEV_ADMIN_EMAIL.trim()).not.toBe("");
    expect(DEV_ADMIN_PASSWORD.trim()).not.toBe("");
  });
});

describe("the shared demo password", () => {
  it("defaults to the admin password when unset", async () => {
    // Buyer and seller demo accounts should not need a second value configured.
    process.env.ADMIN_PASSWORD = "rotated-admin-only";
    const { DEV_PASSWORD, DEV_ADMIN_PASSWORD } = await loadConfig();

    expect(DEV_PASSWORD).toBe(DEV_ADMIN_PASSWORD);
  });

  it("can be set independently of the admin", async () => {
    // Rotating the admin should not force the demo sellers to change, and a shared
    // demo password is often what someone is demonstrating the app with.
    process.env.ADMIN_PASSWORD = "rotated-admin-only";
    process.env.DEMO_PASSWORD = "demo-only";
    const { DEV_PASSWORD, DEV_ADMIN_PASSWORD } = await loadConfig();

    expect(DEV_PASSWORD).toBe("demo-only");
    expect(DEV_ADMIN_PASSWORD).toBe("rotated-admin-only");
  });

  it("treats a blank DEMO_PASSWORD as unset and falls back", async () => {
    process.env.ADMIN_PASSWORD = "rotated-admin-only";
    process.env.DEMO_PASSWORD = "";
    const { DEV_PASSWORD } = await loadConfig();

    expect(DEV_PASSWORD).toBe("rotated-admin-only");
  });
});

describe("the rest of the server configuration", () => {
  it("keeps the fee percentages numeric", async () => {
    const { PLATFORM_SALE_FEE_PERCENT, PLATFORM_RENTAL_FEE_PERCENT } = await loadConfig();

    expect(Number.isFinite(PLATFORM_SALE_FEE_PERCENT)).toBe(true);
    expect(Number.isFinite(PLATFORM_RENTAL_FEE_PERCENT)).toBe(true);
  });

  it("takes the platform fees from the environment", async () => {
    process.env.PLATFORM_SALE_FEE_PERCENT = "7.5";
    vi.resetModules();
    const { PLATFORM_SALE_FEE_PERCENT } = await import(CONFIG);

    expect(PLATFORM_SALE_FEE_PERCENT).toBe(7.5);
    delete process.env.PLATFORM_SALE_FEE_PERCENT;
  });
});
