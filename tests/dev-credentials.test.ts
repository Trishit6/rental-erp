import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * How the development seed credentials are resolved.
 *
 * ## Why this needs a test at all
 *
 * The seed TRUNCATEs every table, so it cannot be run to check how it resolves its
 * passwords. The resolution has to be verifiable on its own. Three specific ways it
 * can go wrong, and what each test below pins down:
 *
 *  1. A blank `.env` value — `ADMIN_PASSWORD=` — being accepted as a real password,
 *     leaving an account nobody can sign into.
 *  2. Incidental whitespace from a copy-paste, so the pasted password does not match
 *     the hashed one.
 *  3. A generated password being regenerated on every run, so the account seeded by
 *     one stage no longer matches the login another stage tells you about.
 */

const MANAGED = ["ADMIN_EMAIL", "ADMIN_PASSWORD", "DEMO_PASSWORD", "SEED_CREDENTIALS_FILE"] as const;

function clearManagedEnv() {
  for (const key of MANAGED) delete process.env[key];
}

afterEach(() => {
  clearManagedEnv();
  vi.resetModules();
});

async function withTempDir<T>(run: (file: string) => T): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "revaro-creds-"));
  try {
    return run(join(dir, ".seed-credentials.local"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("seed credential resolution", () => {
  it("takes the admin and demo passwords from the environment", async () => {
    const { resolveSeedCredentials } = await import("../server/lib/seed-credentials");
    process.env.ADMIN_EMAIL = "ops@example.com";
    process.env.ADMIN_PASSWORD = "rotated-admin-only";
    process.env.DEMO_PASSWORD = "demo-only";

    const credentials = resolveSeedCredentials();

    expect(credentials.adminEmail).toBe("ops@example.com");
    expect(credentials.adminPassword).toBe("rotated-admin-only");
    expect(credentials.demoPassword).toBe("demo-only");
    expect(credentials.generated).toBe(false);
  });

  it("defaults the demo password to the admin password when unset", async () => {
    const { resolveSeedCredentials } = await import("../server/lib/seed-credentials");
    process.env.ADMIN_PASSWORD = "rotated-admin-only";

    const credentials = resolveSeedCredentials();

    expect(credentials.demoPassword).toBe("rotated-admin-only");
    expect(credentials.generated).toBe(false);
  });

  it("trims incidental whitespace", async () => {
    const { resolveSeedCredentials } = await import("../server/lib/seed-credentials");
    process.env.ADMIN_EMAIL = "  ops@example.com  ";
    process.env.ADMIN_PASSWORD = "  padded-secret  ";

    const credentials = resolveSeedCredentials();

    expect(credentials.adminEmail).toBe("ops@example.com");
    expect(credentials.adminPassword).toBe("padded-secret");
  });

  it("treats a blank value as unset and generates a password", async () => {
    const { resolveSeedCredentials } = await import("../server/lib/seed-credentials");
    process.env.ADMIN_PASSWORD = "   ";
    process.env.DEMO_PASSWORD = "";

    await withTempDir((file) => {
      const credentials = resolveSeedCredentials({ file });
      expect(credentials.generated).toBe(true);
      expect(credentials.adminPassword.trim()).not.toBe("");
      expect(credentials.adminPassword.length).toBeGreaterThanOrEqual(32);
      expect(credentials.demoPassword).toBe(credentials.adminPassword);
    });
  });

  it("writes the generated password once and reuses it on the next run", async () => {
    const { resolveSeedCredentials } = await import("../server/lib/seed-credentials");

    await withTempDir((file) => {
      const first = resolveSeedCredentials({ file });
      expect(first.generated).toBe(true);
      expect(readFileSync(file, "utf8")).toContain(`ADMIN_PASSWORD=${first.adminPassword}`);

      const second = resolveSeedCredentials({ file });
      expect(second.generated).toBe(false);
      expect(second.adminPassword).toBe(first.adminPassword);
      expect(second.demoPassword).toBe(first.demoPassword);
    });
  });

  it("defaults the admin email to the documented local address", async () => {
    const { resolveSeedCredentials } = await import("../server/lib/seed-credentials");

    await withTempDir((file) => {
      expect(resolveSeedCredentials({ file }).adminEmail).toBe("admin@revaro.local");
    });
  });

  it("never returns a blank password, whatever the environment says", async () => {
    const { resolveSeedCredentials } = await import("../server/lib/seed-credentials");
    process.env.ADMIN_EMAIL = "\t\n ";

    await withTempDir((file) => {
      const credentials = resolveSeedCredentials({ file });
      expect(credentials.adminEmail.trim()).not.toBe("");
      expect(credentials.adminPassword.trim()).not.toBe("");
    });
  });
});

const CONFIG = "../server/lib/config";

describe("the rest of the server configuration", () => {
  it("keeps the fee percentages numeric", async () => {
    const { PLATFORM_SALE_FEE_PERCENT, PLATFORM_RENTAL_FEE_PERCENT } = await import(CONFIG);

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
