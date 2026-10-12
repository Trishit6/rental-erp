/**
 * The staff permission vocabulary and the role → permission grants.
 *
 * ## Why this is not inside `seed.ts`
 *
 * The same keys are read by three places that must agree: the seed that writes
 * `permissions` / `role_permissions`, the per-route gates in `routes/admin.ts`
 * (PROMPT 22 — "`requirePermission` on EVERY `/api/admin` route"), and the tests
 * that assert no admin route is left ungated. Keeping the list in a database
 * script would make it importable only by running the script, and a route gate
 * naming a key the seed never wrote would silently deny everyone — the failure
 * would look like an authentication bug rather than missing data. So the
 * vocabulary lives here, is imported by the seed and the routes, and is asserted
 * against both.
 *
 * ## Keys are `resource.action`
 *
 * The shape `permissions.key` CHECKs for at the database as well. A typo here
 * fails the seed rather than becoming a permission that can never be granted.
 *
 * ## `USER` and `SELLER` hold nothing on purpose
 *
 * Their access comes from `users.role` and the ownership checks that already
 * exist; granting them a staff key would be two systems claiming authority over
 * the same endpoint, which is how a customer ends up with a permission nobody
 * granted them. `SUPER_ADMIN` is the only role with `rbac.manage`, and nothing is
 * seeded into it — unrestricted access should be handed out deliberately, not
 * arrive with the demo data.
 */

import { ALL_ROLE_NAMES } from "./enums";

export type PermissionEntry = { key: string; description: string };

/** Every staff permission the platform knows about. */
export const PERMISSION_CATALOGUE: readonly PermissionEntry[] = [
  { key: "dashboard.view", description: "Read the admin dashboard overview" },
  { key: "orders.view", description: "Read orders across sellers" },
  { key: "orders.manage", description: "Change order status and fulfillment" },
  { key: "orders.refund", description: "Issue a refund against an order" },
  { key: "products.view", description: "Read listings, including unpublished ones" },
  { key: "products.moderate", description: "Publish, pause or remove a listing" },
  { key: "categories.view", description: "Read the category taxonomy" },
  { key: "categories.manage", description: "Activate or retire a category" },
  { key: "rentals.view", description: "Read rental bookings" },
  { key: "rentals.manage", description: "Force rental status, returns, deposits and extensions" },
  { key: "disputes.view", description: "Read the dispute queue" },
  { key: "disputes.manage", description: "Decide a dispute and notify both parties" },
  { key: "users.view", description: "Read customer and seller accounts" },
  { key: "users.manage", description: "Suspend, restore and edit accounts" },
  { key: "vendors.view", description: "Read seller accounts and verification state" },
  { key: "vendors.manage", description: "Approve, restrict or suspend a seller" },
  { key: "payouts.view", description: "Read the payout ledger" },
  { key: "payouts.approve", description: "Approve or reject a payout" },
  { key: "support.view", description: "Read support tickets" },
  { key: "support.reply", description: "Reply to a support ticket" },
  { key: "reports.view", description: "Read the moderation reports queue" },
  { key: "reports.resolve", description: "Resolve or dismiss a report" },
  { key: "reviews.view", description: "Read product and seller reviews" },
  { key: "reviews.moderate", description: "Publish or hide a review" },
  { key: "content.manage", description: "Edit banners and CMS blocks" },
  { key: "audit.view", description: "Read the audit log" },
  { key: "settings.manage", description: "Change platform settings and feature flags" },
  { key: "rbac.manage", description: "Grant and revoke roles and permissions" },
  { key: "exports.run", description: "Start a data export" },
];

/** Every catalogue key, in declaration order. */
export const PERMISSION_KEYS: readonly string[] = PERMISSION_CATALOGUE.map(
  (permission) => permission.key,
);

export type CatalogueRoleName = (typeof ALL_ROLE_NAMES)[number];

/**
 * Which system role holds which key.
 *
 * `ADMIN` is expressed as "everything except `rbac.manage`" so a new operational
 * permission is granted to administrators by construction rather than being
 * forgotten in a hand-maintained list — the same reason `SUPER_ADMIN` is derived
 * from the catalogue instead of enumerated.
 */
export const ROLE_PERMISSION_GRANTS: Record<CatalogueRoleName, readonly string[]> = {
  SUPER_ADMIN: PERMISSION_KEYS,
  ADMIN: PERMISSION_CATALOGUE.filter((permission) => permission.key !== "rbac.manage").map(
    (permission) => permission.key,
  ),
  SUPPORT: [
    "dashboard.view",
    "orders.view",
    "rentals.view",
    "disputes.view",
    "users.view",
    "support.view",
    "support.reply",
    "reports.view",
    "reports.resolve",
    "exports.run",
  ],
  FINANCE: [
    "dashboard.view",
    "orders.view",
    "rentals.view",
    "disputes.view",
    "payouts.view",
    "payouts.approve",
    "audit.view",
    "exports.run",
  ],
  MODERATOR: [
    "dashboard.view",
    "products.view",
    "products.moderate",
    "categories.view",
    "reviews.view",
    "reviews.moderate",
    "reports.view",
    "reports.resolve",
    "disputes.view",
    "disputes.manage",
    "users.view",
    "support.view",
  ],
  CONTENT_MANAGER: [
    "dashboard.view",
    "products.view",
    "categories.view",
    "categories.manage",
    "content.manage",
  ],
  USER: [],
  SELLER: [],
};
