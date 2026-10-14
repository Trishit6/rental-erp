import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  databaseCredentials,
  databaseUrl,
  migrateDatabaseCredentials,
} from "../server/lib/db-credentials";
import { assertServerEnv, isProduction } from "../server/lib/env";
import { stripComments } from "./support/source-scanning";

/**
 * PROMPT R4 — the database is not reached as `root` in production.
 *
 * ## The claim, and why it is asserted here rather than in an integration test
 *
 * A deployment that connects the API as `root` has no least privilege at all: a
 * single query-injection bug, or a leaked `.env`, is then every schema the server
 * can see. The fix has two halves and this file checks both:
 *
 *  1. **The process refuses the bad configuration.** `assertServerEnv()` throws in
 *     production when the resolved user is `root` or the password is empty. That is
 *     a startup assertion, so it is unit-testable with no server and no database.
 *  2. **The two-account split is real.** `MIGRATE_DB_*` must be what a migration
 *     uses while `DB_USER` stays the runtime account, and `docs/deploy/
 *     db-least-privilege.sql` must grant exactly what the running code needs — in
 *     particular an *append-only* `admin_audit_log` for the runtime user.
 *
 * Every environment variable this file touches is snapshotted and restored, so a
 * failing assertion cannot leak `NODE_ENV=production` into another suite.
 */

const MANAGED = [
  "NODE_ENV",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "MFA_ENCRYPTION_KEY",
  "DB_HOST",
  "DB_PORT",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
  "DATABASE_URL",
  "MIGRATE_DB_USER",
  "MIGRATE_DB_PASSWORD",
] as const;

const DB_VARS = [
  "DB_HOST",
  "DB_PORT",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
  "DATABASE_URL",
  "MIGRATE_DB_USER",
  "MIGRATE_DB_PASSWORD",
] as const;

const ROOT = join(__dirname, "..");
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of MANAGED) saved.set(key, process.env[key]);
  // `assertServerEnv` reports *every* missing secret at once, so a valid baseline
  // keeps each assertion about the database from also failing on JWT secrets when a
  // parallel file has not loaded `tests/setup.ts` yet.
  process.env.JWT_ACCESS_SECRET = "test-access-secret-0000000000000000000000000000000000";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret-000000000000000000000000000000000";
  process.env.MFA_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
});

afterEach(() => {
  for (const key of MANAGED) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  saved.clear();
});

/** Clear every database variable so each case states its whole configuration. */
function clearDatabaseEnv(): void {
  for (const key of DB_VARS) delete process.env[key];
}

/** A valid production-shaped database configuration, as a base to vary. */
function productionDatabase(): void {
  process.env.NODE_ENV = "production";
  clearDatabaseEnv();
  process.env.DB_HOST = "db.internal";
  process.env.DB_NAME = "reloop";
  process.env.DB_USER = "revaro_app";
  process.env.DB_PASSWORD = "runtime-password";
}

/* ------------------------- the production startup gate ---------------------- */

describe("production refuses a root or passwordless database account", () => {
  it("is a production-only rule", () => {
    // Development runs as whatever the developer's local MariaDB accepts (`root`
    // with a blank password is the common local shape), so the gate must not fire.
    clearDatabaseEnv();
    process.env.NODE_ENV = "development";
    process.env.DB_USER = "root";
    process.env.DB_PASSWORD = "";
    expect(() => assertServerEnv()).not.toThrow();

    process.env.NODE_ENV = "production";
    expect(isProduction()).toBe(true);
    expect(() => assertServerEnv()).toThrow(/root/i);
  });

  it("refuses `root` and names the account to use instead", () => {
    productionDatabase();
    process.env.DB_USER = "root";
    process.env.DB_PASSWORD = "still-a-password";

    let thrown: Error | undefined;
    try {
      assertServerEnv();
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown).toBeDefined();
    expect(thrown!.message).toMatch(/root/i);
    // The message names the variable and the file, neither of which is a secret.
    expect(thrown!.message).toContain("DB_USER");
    expect(thrown!.message).toContain("db-least-privilege.sql");
  });

  it("refuses an empty password", () => {
    productionDatabase();
    process.env.DB_PASSWORD = "";
    expect(() => assertServerEnv()).toThrow(/password is empty/i);
  });

  it("refuses `root` reached through DATABASE_URL", () => {
    process.env.NODE_ENV = "production";
    clearDatabaseEnv();
    process.env.DATABASE_URL = "mysql://root:letmein@db.internal:3306/reloop";

    let thrown: Error | undefined;
    try {
      assertServerEnv();
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown?.message).toMatch(/root/i);
    // The refusal must not echo the credential it is refusing.
    expect(thrown?.message).not.toContain("letmein");
  });

  it("accepts a least-privilege runtime account", () => {
    productionDatabase();
    expect(() => assertServerEnv()).not.toThrow();
  });

  it("still requires *some* database to be configured in production", () => {
    process.env.NODE_ENV = "production";
    clearDatabaseEnv();
    expect(() => assertServerEnv()).toThrow(/No database configured/i);
  });
});

/* --------------------------- the migrate credentials ------------------------ */

describe("migrations run as the migrate account, the API as the runtime one", () => {
  it("prefers MIGRATE_DB_USER / MIGRATE_DB_PASSWORD when set", () => {
    clearDatabaseEnv();
    process.env.DB_HOST = "db.internal";
    process.env.DB_USER = "revaro_app";
    process.env.DB_PASSWORD = "runtime-password";
    process.env.MIGRATE_DB_USER = "revaro_migrate";
    process.env.MIGRATE_DB_PASSWORD = "ddl-password";

    const credentials = migrateDatabaseCredentials();

    expect(credentials.user).toBe("revaro_migrate");
    expect(credentials.password).toBe("ddl-password");
    // Everything the migrate pair does not override is inherited unchanged.
    expect(credentials.host).toBe("db.internal");
    expect(databaseCredentials().user).toBe("revaro_app");
  });

  it("falls back to the runtime credentials, so one-account dev is unchanged", () => {
    clearDatabaseEnv();
    process.env.DB_HOST = "localhost";
    process.env.DB_USER = "revaro_app";
    process.env.DB_PASSWORD = "runtime-password";

    expect(migrateDatabaseCredentials()).toMatchObject({
      user: "revaro_app",
      password: "runtime-password",
    });
  });

  it("overrides only the user, keeping the runtime password when it is enough", () => {
    clearDatabaseEnv();
    process.env.DB_USER = "revaro_app";
    process.env.DB_PASSWORD = "shared-password";
    process.env.MIGRATE_DB_USER = "revaro_migrate";
    delete process.env.MIGRATE_DB_PASSWORD;

    expect(migrateDatabaseCredentials()).toMatchObject({
      user: "revaro_migrate",
      password: "shared-password",
    });
  });
});

/* ------------------------------- URL composition ---------------------------- */

describe("databaseUrl percent-encodes the credential it carries", () => {
  it("escapes a password with `@` and `/` so the URL cannot be truncated", () => {
    // An unescaped `@` moves the host boundary and an unescaped `/` moves the path
    // boundary; the connection silently targets the wrong server or database.
    expect(
      databaseUrl({
        host: "db.internal",
        port: 3306,
        user: "app@corp",
        password: "p@ss/word",
        database: "reloop",
      }),
    ).toBe("mysql://app%40corp:p%40ss%2Fword@db.internal:3306/reloop");
  });

  it("omits the database segment when there is none", () => {
    expect(databaseUrl({ host: "localhost", port: 3307, user: "app", password: "pw" })).toBe(
      "mysql://app:pw@localhost:3307",
    );
  });

  it("round-trips a composed URL back through the parser", () => {
    const composed = databaseUrl({
      host: "db.internal",
      port: 3306,
      user: "revaro_app",
      password: "p@ss/word",
      database: "reloop",
    });
    process.env.DATABASE_URL = composed;
    const parsed = databaseCredentials();
    expect(parsed).toMatchObject({
      host: "db.internal",
      user: "revaro_app",
      password: "p@ss/word",
      database: "reloop",
    });
    delete process.env.DATABASE_URL;
  });
});

/* ------------------------------ the SQL contract ---------------------------- */

describe("the least-privilege SQL grants exactly what the runtime uses", () => {
  const sql = readFileSync(join(ROOT, "docs/deploy/db-least-privilege.sql"), "utf8");

  it("creates the two accounts the code resolves", () => {
    expect(sql).toContain("'revaro_app'@");
    expect(sql).toContain("'revaro_migrate'@");
    expect(sql).toContain("MIGRATE_DB_USER");
  });

  it("gives the runtime user row verbs and the migrate user the DDL", () => {
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON `reloop`\.\* TO 'revaro_app'/);
    expect(sql).toContain("CREATE, ALTER, DROP");
  });

  it("revokes UPDATE and DELETE on the audit log from the runtime user", () => {
    expect(sql).toMatch(/REVOKE UPDATE, DELETE ON `reloop`\.`admin_audit_log` FROM 'revaro_app'/);
  });

  it("matches the append-only audit log the runtime code actually keeps", () => {
    // The REVOKE is only safe if nothing under `server/lib` or `server/routes`
    // updates or deletes an audit row. (The seed scripts TRUNCATE it, but they run
    // as the migrate account, and a raw TRUNCATE is not a drizzle `.delete`.)
    const files = ["server/lib", "server/routes"].flatMap((dir) =>
      readdirSync(join(ROOT, dir))
        .filter((name) => name.endsWith(".ts"))
        .map((name) => join(dir, name)),
    );

    const offenders = files.filter((file) => {
      const code = stripComments(readFileSync(join(ROOT, file), "utf8"));
      return /\.(update|delete)\(\s*adminAuditLog\b/.test(code);
    });

    expect(offenders).toEqual([]);
  });
});
