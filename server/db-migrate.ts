import "dotenv/config";
import { spawnSync } from "node:child_process";
import { databaseUrl, migrateDatabaseCredentials } from "./lib/db-credentials";

/**
 * `pnpm db:migrate` — apply the Drizzle migration history as the **migrate** user.
 *
 * ## Why this is a script rather than a bare `drizzle-kit migrate`
 *
 * A migration runs DDL — `CREATE`, `ALTER`, `DROP`, `CREATE INDEX` — and the
 * running API never should. The least-privilege split (see
 * `docs/deploy/db-least-privilege.sql`) gives the API only `SELECT/INSERT/UPDATE/
 * DELETE`, and a separate account the DDL. `drizzle.config.ts` resolves its URL
 * from `DATABASE_URL` first, so this script resolves `MIGRATE_DB_USER` /
 * `MIGRATE_DB_PASSWORD`, composes the URL and passes it through — the migrations
 * then run as the privileged account while `DB_USER` stays unprivileged.
 *
 * Both `MIGRATE_*` variables are optional and fall back to the runtime credentials,
 * so a development setup that runs as one user behaves exactly as before.
 *
 * ## Wiring
 *
 * Point the `db:migrate` script at this file (`tsx server/db-migrate.ts`) in a
 * deployment that separates the two accounts. Until then, `drizzle-kit migrate`
 * still works, but it will use `DB_USER` and needs DDL rights on that account.
 * `server/db-verify-migrate.ts` and `server/db-reset.ts` keep shelling out to
 * `drizzle-kit` directly; they pass their own `DATABASE_URL` and are unaffected.
 */

const credentials = migrateDatabaseCredentials();
const url = databaseUrl({
  ...credentials,
  database: credentials.database ?? process.env.DB_NAME ?? "reloop",
});

console.log("db:migrate — applying migrations with the migrate credentials...");

const migrate = spawnSync("pnpm", ["exec", "drizzle-kit", "migrate"], {
  stdio: "inherit",
  shell: true,
  cwd: process.cwd(),
  // `DATABASE_URL` wins in `drizzle.config.ts`; carrying the standard `DB_*`
  // variables through keeps the two resolutions in agreement.
  env: { ...process.env, DATABASE_URL: url },
});

if (migrate.status !== 0) {
  console.error(
    "\n  db:migrate FAILED — no migration was left half-applied by this script; " +
      "fix the migration and run it again.\n",
  );
  process.exit(migrate.status ?? 1);
}

console.log("db:migrate — done.");
