-- Revaro — least-privilege database accounts.
--
-- Run this ONCE per environment, as a database superuser (or any account holding
-- GRANT OPTION), after the `reloop` database has been created (`pnpm db:create`):
--
--   mysql -u root -p < docs/deploy/db-least-privilege.sql
--
-- Then point the API at the runtime account and migrations at the migrate account:
--
--   DB_USER=revaro_app        DB_PASSWORD=<runtime-password>     # the running API
--   MIGRATE_DB_USER=revaro_migrate MIGRATE_DB_PASSWORD=<ddl-password>  # db:migrate
--
-- `server/lib/env.ts` refuses to start in production with `DB_USER=root` or an
-- empty password, and `db:migrate` (`server/db-migrate.ts`) resolves the
-- `MIGRATE_*` pair. Replace every `CHANGE_ME` before use — a password in this file
-- is a password in source.
--
-- ## Why two accounts
--
-- The API reads and writes rows; it never changes the schema. Migrations do the
-- opposite. Collapsing both into `root` means a query-injection bug — or simply a
-- leaked `.env` — is a full compromise of the database and every other schema the
-- server can see. Two accounts bound the blast radius to one schema and, within
-- it, to the operations each role actually performs.

-- ---------------------------------------------------------------------------
-- Runtime API account: rows only, never DDL.
-- ---------------------------------------------------------------------------

CREATE USER IF NOT EXISTS 'revaro_app'@'%' IDENTIFIED BY 'CHANGE_ME_runtime_password';

-- The application's working set. `rate_limit_counters` needs UPDATE as well as
-- INSERT because its counter is an `INSERT … ON DUPLICATE KEY UPDATE`, and DELETE
-- because expired windows are swept opportunistically
-- (`server/lib/rate-limit.ts`). That is the whole "extra" it needs — there is no
-- other table with a privilege beyond the four row verbs.
GRANT SELECT, INSERT, UPDATE, DELETE ON `reloop`.* TO 'revaro_app'@'%';

-- `admin_audit_log` is append-only for the runtime user. The application only ever
-- INSERTs (`server/lib/audit.ts`) and SELECTs it (the admin audit-log view and the
-- per-entity history); nothing in `server/` UPDATEs or DELETEs a row. Removing the
-- two grants makes tampering impossible even if a future bug tries: an audit trail
-- the compromised account can edit is not an audit trail. (The seed scripts
-- TRUNCATE it, but they run as the migrate/admin account, not this one.)
REVOKE UPDATE, DELETE ON `reloop`.`admin_audit_log` FROM 'revaro_app'@'%';

FLUSH PRIVILEGES;

-- ---------------------------------------------------------------------------
-- Migration account: the runtime grants, plus exactly the DDL a migration needs.
-- ---------------------------------------------------------------------------

CREATE USER IF NOT EXISTS 'revaro_migrate'@'%' IDENTIFIED BY 'CHANGE_ME_migrate_password';

-- SELECT/INSERT/UPDATE/DELETE cover reading and updating `__drizzle_migrations`.
-- CREATE/ALTER/DROP cover the tables and indexes every migration writes. INDEX and
-- REFERENCES are listed explicitly so the intent is legible; on MariaDB they are
-- implied by ALTER, listing them is harmless and documents the requirement.
GRANT SELECT, INSERT, UPDATE, DELETE,
      CREATE, ALTER, DROP, INDEX, REFERENCES
  ON `reloop`.* TO 'revaro_migrate'@'%';

-- Migration tooling may lock tables while it diffs/applies; this is scoped to the
-- migrate account so the runtime API never holds it.
GRANT LOCK TABLES ON `reloop`.* TO 'revaro_migrate'@'%';

FLUSH PRIVILEGES;

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
--
-- * Host scope is `%` for brevity. In a deployment where the API and the database
--   are on known addresses, replace it with those (`'revaro_app'@'10.0.3.12'`) so a
--   leaked password is not also usable from anywhere on the network.
--
-- * `DROP DATABASE` is deliberately granted to *neither* account. `pnpm db:reset`
--   is a development-only, localhost-gated script and must run as a superuser.
--
-- * The API does not need `CREATE TEMPORARY TABLES`: it opens ordinary transactions
--   (`START TRANSACTION`), which require no extra privilege.
--
-- * If a future feature genuinely needs the API to mutate `admin_audit_log`, grant
--   only the specific verb it needs on this table and record the reason here rather
--   than widening the schema-wide grant.
