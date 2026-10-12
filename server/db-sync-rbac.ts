import "dotenv/config";
import { db, pool } from "./db";
import { permissions, rolePermissions, roles } from "./schema";
import { ALL_ROLE_NAMES } from "./lib/enums";
import { PERMISSION_CATALOGUE, ROLE_PERMISSION_GRANTS } from "./lib/permission-catalogue";

/**
 * `pnpm db:sync:rbac` — bring an existing database up to the current permission
 * catalogue without touching anything else.
 *
 * ## Why this exists next to `db:seed`
 *
 * `db:seed` rebuilds the demo world and refuses to run against production; it is
 * the wrong tool for "the catalogue gained six keys and the running database
 * should learn them". `db:migrate` moves schema, not rows, so a permission added
 * to `PERMISSION_CATALOGUE` would otherwise be granted to nobody until the next
 * full re-seed — and every route gated on it would deny everyone, which reads like
 * an authentication bug rather than missing rows.
 *
 * ## Why it is safe to run at any time
 *
 * It only ever inserts or updates `permissions`, `roles` and `role_permissions`:
 *
 *  - permissions are upserted by `key`, so an existing description is refreshed
 *    and nothing is deleted;
 *  - roles are upserted by `name` and marked `isSystem`, so a custom role is left
 *    alone;
 *  - grants are `INSERT IGNORE`d, so re-running is a no-op and a grant an
 *    administrator revoked by hand is not silently restored unless the role's
 *    seed definition still lists it — which is the catalogue's job to say.
 *
 * It does not truncate, drop, or touch `user_roles`.
 */

console.log("Syncing the RBAC catalogue...");

const permissionIds = new Map<string, number>();
for (const permission of PERMISSION_CATALOGUE) {
  // `group_key` is derived from the key exactly as the seed derives it, so a row
  // this script writes and a row the seed writes are the same row.
  const groupKey = permission.key.slice(0, permission.key.indexOf("."));
  await db
    .insert(permissions)
    .values({ key: permission.key, description: permission.description, groupKey })
    .onDuplicateKeyUpdate({
      set: { description: permission.description, groupKey },
    });
  permissionIds.set(permission.key, 0);
}

const roleIds = new Map<string, number>();
for (const name of ALL_ROLE_NAMES) {
  await db
    .insert(roles)
    .values({ name, isSystem: true })
    .onDuplicateKeyUpdate({ set: { isSystem: true } });
  roleIds.set(name, 0);
}

// Re-read ids rather than trusting `$returningId`, which an upsert does not
// provide for rows that already existed.
for (const row of await db
  .select({ id: permissions.id, key: permissions.key })
  .from(permissions)) {
  permissionIds.set(row.key, row.id);
}
for (const row of await db.select({ id: roles.id, name: roles.name }).from(roles)) {
  roleIds.set(row.name, row.id);
}

const grantRows: { roleId: number; permissionId: number }[] = [];
for (const [roleName, keys] of Object.entries(ROLE_PERMISSION_GRANTS)) {
  const roleId = roleIds.get(roleName);
  if (roleId === undefined) throw new Error(`RBAC sync: role "${roleName}" is missing`);
  for (const key of keys) {
    const permissionId = permissionIds.get(key);
    if (permissionId === undefined) {
      throw new Error(`RBAC sync: role "${roleName}" grants unknown permission "${key}"`);
    }
    grantRows.push({ roleId, permissionId });
  }
}

if (grantRows.length > 0) {
  await db.insert(rolePermissions).ignore().values(grantRows);
}

console.log(
  `  permissions: ${PERMISSION_CATALOGUE.length}, roles: ${ALL_ROLE_NAMES.length}, ` +
    `grants considered: ${grantRows.length}`,
);
console.log("  done — no rows were deleted.\n");

await pool.end();
