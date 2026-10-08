import "dotenv/config";
import { spawnSync } from "node:child_process";
import mysql from "mysql2/promise";
import { databaseCredentials, isLocalHost } from "./lib/db-credentials";

/**
 * `pnpm db:verify:migrate` — prove the migration history runs from scratch on
 * an **empty** database.
 *
 * The development database can only ever tell you that migrations apply on top
 * of whatever is already there; a fresh one is the only way to know the first
 * migration and the last still agree with `server/schema.ts`. This runs against
 * a throwaway database and drops it afterwards, so no real data is involved.
 *
 * ## The rest of the matrix
 *
 *   empty DB          → `pnpm db:verify:migrate`   (this script)
 *   populated DB      → `pnpm db:migrate`          (what dev already does)
 *   destroy + rebuild → `pnpm db:reset --confirm <name>`
 */

const TEST_DATABASE = "reloop_migrate_test";

/** Every table the schema must produce. The brief's `audit_logs` ships as `admin_audit_log`. */
const REQUIRED_TABLES = [
  "users",
  "sessions",
  "addresses",
  "categories",
  "products",
  "product_images",
  "product_tags",
  "favorites",
  "carts",
  "cart_items",
  "orders",
  "order_items",
  "rentals",
  "rental_events",
  "reviews",
  "review_helpful_votes",
  "seller_profiles",
  "seller_payout_methods",
  "payouts",
  "wallet_transactions",
  "transactions",
  "conversations",
  "conversation_participants",
  "messages",
  "notifications",
  "notification_preferences",
  "reports",
  "admin_audit_log",
  // foundation tables from this feature
  "order_events",
  "stock_reservations",
  "idempotency_keys",
  "payment_webhook_events",
  "platform_settings",
  "search_history",
];

function fail(message: string): never {
  console.error(`\n  db:verify:migrate FAILED — ${message}\n`);
  process.exit(1);
}

async function dropTestDatabase(): Promise<void> {
  const connection = await mysql.createConnection({
    ...credentials,
    multipleStatements: true,
    timezone: "Z",
  });
  await connection.query(`DROP DATABASE IF EXISTS \`${TEST_DATABASE}\``);
  await connection.end();
}

const credentials = databaseCredentials();
if (!isLocalHost(credentials.host)) {
  fail(`DB host "${credentials.host}" is not local; refusing to create/drop a database there.`);
}

await dropTestDatabase();
await mysql.createConnection({ ...credentials, multipleStatements: true }).then(async (c) => {
  await c.query(
    `CREATE DATABASE \`${TEST_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await c.end();
});

console.log(`db:verify:migrate — created empty "${TEST_DATABASE}", running all migrations...`);

const testUrl = `mysql://${encodeURIComponent(credentials.user)}:${encodeURIComponent(
  credentials.password,
)}@${credentials.host}:${credentials.port}/${TEST_DATABASE}`;

const migrate = spawnSync("pnpm", ["exec", "drizzle-kit", "migrate"], {
  // Piped rather than inherited: the spinner writes control characters over the
  // top of any real error, and a migration failure with no message is worse than
  // no test at all.
  stdio: "pipe",
  shell: true,
  cwd: process.cwd(),
  encoding: "utf8",
  env: { ...process.env, DATABASE_URL: testUrl, DB_NAME: TEST_DATABASE },
});

if (migrate.status !== 0) {
  const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, "g");
  const clean = (text: string) => text.replace(ansiPattern, "").split("\r").join("\n");
  console.error(clean(migrate.stdout ?? ""));
  console.error(clean(migrate.stderr ?? ""));
  await dropTestDatabase();
  fail(`the migration run itself failed (exit ${migrate.status}).`);
}

const verifier = await mysql.createConnection({
  ...credentials,
  database: TEST_DATABASE,
  timezone: "Z",
});

const [tableRows] = await verifier.query(
  "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()",
);
const present = new Set((tableRows as { name: string }[]).map((row) => row.name));
const missing = REQUIRED_TABLES.filter((table) => !present.has(table));

const [migrationRows] = await verifier.query("SELECT COUNT(*) AS n FROM __drizzle_migrations");
const recordedMigrations = (migrationRows as { n: number }[])[0]?.n ?? 0;

await verifier.end();
await dropTestDatabase();

if (recordedMigrations < 1) {
  fail("__drizzle_migrations has no rows — no migration was recorded at all.");
}
if (missing.length > 0) {
  fail(`tables missing after migrating an empty database: ${missing.join(", ")}`);
}

console.log(
  `\n  db:verify:migrate OK — ${recordedMigrations} migration(s) replayed on an empty\n` +
    `  database, all ${REQUIRED_TABLES.length} required tables present.\n` +
    `  "${TEST_DATABASE}" dropped afterwards.\n`,
);
