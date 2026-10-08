import "dotenv/config";
import { spawnSync } from "node:child_process";
import mysql from "mysql2/promise";
import { databaseCredentials, isLocalHost } from "./lib/db-credentials";

/**
 * `pnpm db:reset` — drop every table in the development database and rebuild it
 * from the migrations.
 *
 * ## Why the gates exist
 *
 * This is the only script in the repo that destroys data, so it has to be
 * impossible to run by accident and impossible to run against anything that
 * matters:
 *
 *  1. `NODE_ENV=production` refuses outright, with no override.
 *  2. The database must be on this machine (`localhost` / `127.0.0.1`), whether
 *     the host comes from `DB_HOST` or from `DATABASE_URL`.
 *  3. The database name must be on the dev allowlist.
 *  4. `--confirm <name>` has to spell out the exact database being dropped —
 *     a typo'd flag is a refusal, not a wildcard.
 *
 * Nothing runs automatically: it is a manual command, like `db:seed`.
 *
 * ## What it does not do
 *
 * It does not seed. After a reset the database is empty and migrated; run
 * `pnpm db:seed` when you actually want demo data back.
 */

/** Databases this script is willing to destroy. Deliberately not `*`. */
const ALLOWED_DATABASES = new Set(["reloop"]);

function refuse(reason: string): never {
  console.error(`\n  db:reset refused — ${reason}\n`);
  process.exit(1);
}

const credentials = databaseCredentials();
const databaseName = credentials.database ?? process.env.DB_NAME ?? "reloop";

if (process.env.NODE_ENV === "production") {
  refuse("NODE_ENV is 'production'. There is no override for this.");
}

const confirmAt = process.argv.indexOf("--confirm");
const confirmed = confirmAt === -1 ? undefined : process.argv[confirmAt + 1];
if (confirmed !== databaseName) {
  refuse(`expected --confirm ${databaseName}, got ${confirmed ?? "no --confirm flag"}.`);
}

if (!ALLOWED_DATABASES.has(databaseName)) {
  refuse(
    `"${databaseName}" is not in the dev allowlist (allowed: ${[...ALLOWED_DATABASES].join(", ")}).`,
  );
}

if (!isLocalHost(credentials.host)) {
  refuse(`DB host "${credentials.host}" is not local. Only localhost databases may be reset.`);
}

const connection = await mysql.createConnection({
  ...credentials,
  database: databaseName,
  multipleStatements: true,
  timezone: "Z",
});

const [tables] = await connection.query(
  "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()",
);
const names = (tables as { name: string }[]).map((row) => row.name);

if (names.length === 0) {
  console.log(`db:reset — "${databaseName}" is already empty.`);
} else {
  console.log(`db:reset — dropping ${names.length} table(s) from "${databaseName}"...`);
  await connection.query("SET FOREIGN_KEY_CHECKS = 0");
  const drops = names.map((name) => `\`${name}\``).join(", ");
  await connection.query(`DROP TABLE IF EXISTS ${drops}`);
  await connection.query("SET FOREIGN_KEY_CHECKS = 1");
  console.log("db:reset — dropped.");
}

await connection.end();

console.log("db:reset — rebuilding schema from migrations...");
const migrate = spawnSync("pnpm", ["exec", "drizzle-kit", "migrate"], {
  stdio: "inherit",
  shell: true,
  cwd: process.cwd(),
});

if (migrate.status !== 0) {
  console.error(
    "\n  db:reset — migrations FAILED. The database is now empty; fix the migration\n" +
      "  and run `pnpm db:migrate` before doing anything else.\n",
  );
  process.exit(migrate.status ?? 1);
}

const finalConnection = await mysql.createConnection({
  ...credentials,
  database: databaseName,
  timezone: "Z",
});
const [after] = await finalConnection.query(
  "SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()",
);
const tableCount = (after as { n: number }[])[0]?.n ?? 0;
await finalConnection.end();

console.log(
  `db:reset — done. ${tableCount} table(s), no rows.\n` +
    `  Next: pnpm db:seed   (demo data, optional)\n`,
);
