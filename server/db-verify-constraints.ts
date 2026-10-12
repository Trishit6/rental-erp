import { databaseCredentials, isLocalHost } from "./lib/db-credentials";
import mysql from "mysql2/promise";

/**
 * `pnpm db:verify:constraints` — prove the schema actually enforces what the
 * spec says it enforces, against a real MariaDB.
 *
 * Unit tests can assert that a `check()` or `uniqueIndex()` exists *in the
 * Drizzle definition*; only this proves MariaDB accepted it and rejects the bad
 * row. Each case inserts something that must not be insertable and reports
 * whether the database refused.
 *
 * ## This writes to the database
 *
 * Every case is designed to fail, so nothing should land. Cleanup runs at the
 * end regardless and removes anything a *missing* constraint would have let
 * through, so a passing run leaves the data exactly as it found it and a
 * failing run does too. Local dev only, same rule as `db:reset`.
 *
 * Sibling: `pnpm db:verify:migrate` proves the migrations replay on an empty
 * database; this proves the schema they build is real.
 */

const results: { label: string; outcome: "PASS" | "FAIL" | "SKIPPED" }[] = [];

function record(label: string, outcome: "PASS" | "FAIL" | "SKIPPED"): void {
  results.push({ label, outcome });
  console.log(`${outcome.padEnd(9)} ${label}`);
}

const credentials = databaseCredentials();
if (!isLocalHost(credentials.host)) {
  console.error(`\n  db:verify:constraints refused — host "${credentials.host}" is not local.\n`);
  process.exit(1);
}
if (!credentials.database) {
  console.error("\n  db:verify:constraints refused — no database name resolved.\n");
  process.exit(1);
}

const db = await mysql.createConnection({ ...credentials, timezone: "Z" });

async function returnsRows(statement: string): Promise<unknown[]> {
  const [rows] = await db.query(statement);
  return rows as unknown[];
}

async function mustBeAccepted(label: string, statement: string): Promise<void> {
  try {
    await db.query(statement);
    record(label, "PASS");
  } catch (error) {
    record(label, "FAIL");
    console.log(`         valid write was rejected: ${(error as Error).message.slice(0, 120)}`);
  }
}

async function mustBeRejected(label: string, statement: string): Promise<void> {
  try {
    await db.query(statement);
    record(label, "FAIL");
    console.log(`         constraint did NOT fire — insert succeeded`);
  } catch (error) {
    const message = (error as Error).message;
    const enforced = /check constraint|unique|duplicate|foreign key|cannot be null|CONSTRAINT/i.test(
      message,
    );
    record(label, enforced ? "PASS" : "SKIPPED");
    if (!enforced) console.log(`         rejected for an unrelated reason: ${message.slice(0, 120)}`);
  }
}

/**
 * Removes anything this script — or a previous run that died part-way — may
 * have written. Called **before** the cases as well as after: a verifier that
 * only cleans up at the end is one crash away from failing its own next run
 * with "duplicate entry", which is exactly what happened while writing it.
 *
 * Dependent rows go first: `orders.user_id` and `order_items.product_id` are
 * RESTRICT, so deleting a parent before its child leaves both behind.
 */
const cleanupStatements = [
  `DELETE FROM orders WHERE subtotal = 100 AND total = -1`,
  `DELETE FROM reviews WHERE rating NOT BETWEEN 1 AND 5 AND comment = 'bad'`,
  `DELETE FROM cart_items WHERE quantity <= 0`,
  `DELETE FROM stock_reservations WHERE quantity <= 0 OR rental_end <= rental_start`,
  `DELETE FROM user_blocks WHERE reason IN ('verify-probe', 'verify-probe-2')`,
  `DELETE FROM search_history WHERE TRIM(term) = ''`,
  `DELETE FROM idempotency_keys WHERE \`key\` = 'shared-key'`,
  `DELETE FROM payment_webhook_events WHERE event_id = 'evt_duplicate'`,
  `DELETE FROM products WHERE slug IN ('neg-price-slug', 'neg-rent-slug') OR title = 'dupe'`,
  `DELETE FROM users WHERE password_hash = 'x'`,
  // PROMPT 1 sentinels. A *missing* constraint would have let these land, so the
  // cleanup has to catch what a passing run would never leave behind.
  `DELETE FROM coupons WHERE code IN ('SAVEVERIFY', 'saveverify', 'SAVEVERIFY-BAD')`,
  `DELETE FROM disputes WHERE dispute_number LIKE 'DSP-VERIFY-%'`,
  `DELETE FROM commission_rules WHERE percent_bp = 9505`,
  `DELETE FROM roles WHERE name IN ('VERIFY_ROLE', 'verify_role')`,
  "DELETE FROM permissions WHERE `key` IN ('verify.probe', 'noprefix')",
];

async function cleanup(): Promise<void> {
  for (const statement of cleanupStatements) {
    try {
      const [result] = await db.query(statement);
      const affected = (result as { affectedRows?: number }).affectedRows ?? 0;
      if (affected > 0) console.log(`         cleanup removed ${affected} stray row(s)`);
    } catch {
      /* nothing to remove */
    }
  }
}

await cleanup();

/* ------------------------------ structural ------------------------------ */

const REQUIRED_TABLES = [
  "order_events",
  "stock_reservations",
  "idempotency_keys",
  "payment_webhook_events",
  "platform_settings",
  "search_history",
  // PROMPT 1 — admin, security, support, money and growth.
  "roles",
  "permissions",
  "role_permissions",
  "user_roles",
  "user_mfa",
  "mfa_recovery_codes",
  "login_attempts",
  "security_events",
  "cms_banners",
  "cms_blocks",
  "support_tickets",
  "ticket_messages",
  "ticket_attachments",
  "refunds",
  "disputes",
  "commission_rules",
  "seller_verifications",
  "coupons",
  "coupon_redemptions",
  "feature_flags",
  "app_config",
  "export_jobs",
  "user_blocks",
];

for (const table of REQUIRED_TABLES) {
  const rows = await returnsRows(
    `SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}'`,
  );
  record(
    `table "${table}" exists`,
    (rows as { n: number }[])[0].n === 1 ? "PASS" : "FAIL",
  );
}

const [checkCount] = await db.query(
  "SELECT COUNT(*) AS n FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()",
);
const checks = (checkCount as { n: number }[])[0].n;
record(`CHECK constraints present (${checks})`, checks >= 40 ? "PASS" : "FAIL");

const [providerUnique] = await db.query(
  `SELECT COUNT(*) AS n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transactions' AND NON_UNIQUE = 0 AND COLUMN_NAME = 'provider_transaction_id'`,
);
record(
  "transactions.provider_transaction_id is UNIQUE",
  (providerUnique as { n: number }[])[0].n === 1 ? "PASS" : "FAIL",
);

const [autoUpdate] = await db.query(
  `SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'updated_at' AND EXTRA LIKE '%on update current_timestamp%'`,
);
const autoUpdating = (autoUpdate as { n: number }[])[0].n;
record(`updated_at auto-updates on ${autoUpdating} table(s)`, autoUpdating >= 15 ? "PASS" : "FAIL");

/* ------------------------------ constraints ----------------------------- */

const fixtures = await returnsRows(
  `SELECT (SELECT id FROM users LIMIT 1) AS userId,
          (SELECT id FROM products LIMIT 1) AS productId,
          (SELECT seller_id FROM products WHERE seller_id IS NOT NULL LIMIT 1) AS sellerId,
          (SELECT id FROM carts LIMIT 1) AS cartId,
          (SELECT id FROM orders LIMIT 1) AS orderId,
          (SELECT id FROM categories LIMIT 1) AS categoryId,
          (SELECT user_id FROM favorites LIMIT 1) AS favoriteUserId,
          (SELECT product_id FROM favorites LIMIT 1) AS favoriteProductId,
          (SELECT id FROM users ORDER BY id LIMIT 1 OFFSET 1) AS otherUserId`,
);
const fixture = (fixtures as Record<string, number | null>[])[0] ?? {};

const userId = fixture.userId;
const productId = fixture.productId;
const sellerId = fixture.sellerId;
const cartId = fixture.cartId;
const orderId = fixture.orderId;
const categoryId = fixture.categoryId;
const favoriteUserId = fixture.favoriteUserId;
const favoriteProductId = fixture.favoriteProductId;
const otherUserId = fixture.otherUserId;

if (!userId || !productId || !sellerId) {
  console.log("\nSKIPPED   constraint cases — database has no seed rows to build them on.");
  console.log("          Run `pnpm db:seed` first.\n");
} else {
  await mustBeRejected(
    "duplicate users.email",
    `INSERT INTO users (name, email, password_hash) SELECT 'Dupe', email, 'x' FROM users WHERE id = ${userId}`,
  );
  await mustBeRejected(
    "duplicate products.slug",
    `INSERT INTO products (seller_id, title, slug, description, category_id, location) SELECT seller_id, 'dupe', slug, 'd', category_id, location FROM products WHERE id = ${productId}`,
  );
  if (favoriteUserId && favoriteProductId) {
    await mustBeRejected(
      "duplicate favorite (user_id, product_id)",
      `INSERT INTO favorites (user_id, product_id) SELECT user_id, product_id FROM favorites WHERE user_id = ${favoriteUserId} AND product_id = ${favoriteProductId}`,
    );
  }
  if (otherUserId && otherUserId !== userId) {
    await mustBeRejected(
      "self-block (blocker equals blocked)",
      `INSERT INTO user_blocks (blocker_id, blocked_id, reason) VALUES (${userId}, ${userId}, 'verify-probe')`,
    );
    await mustBeAccepted(
      "first block accepted",
      `INSERT INTO user_blocks (blocker_id, blocked_id, reason) VALUES (${userId}, ${otherUserId}, 'verify-probe')`,
    );
    await mustBeRejected(
      "duplicate block (blocker, blocked)",
      `INSERT INTO user_blocks (blocker_id, blocked_id, reason) VALUES (${userId}, ${otherUserId}, 'verify-probe-2')`,
    );
  }
  await mustBeRejected(
    "negative purchase price",
    `INSERT INTO products (seller_id, title, slug, description, category_id, location, purchase_price) SELECT seller_id, 'neg-price', 'neg-price-slug', 'd', category_id, location, -1 FROM products WHERE id = ${productId}`,
  );
  await mustBeRejected(
    "rental price below zero",
    `INSERT INTO products (seller_id, title, slug, description, category_id, location, rental_price_per_day) SELECT seller_id, 'neg-rent', 'neg-rent-slug', 'd', category_id, location, -50 FROM products WHERE id = ${productId}`,
  );
  if (cartId) {
    await mustBeRejected(
      "cart quantity <= 0",
      `INSERT INTO cart_items (cart_id, product_id, mode, quantity) VALUES (${cartId}, ${productId}, 'BUY', 0)`,
    );
  }
  await mustBeRejected(
    "review rating outside 1..5",
    `INSERT INTO reviews (product_id, seller_id, user_id, rating, comment, status) VALUES (${productId}, ${sellerId}, ${userId}, 9, 'bad', 'PUBLISHED')`,
  );
  await mustBeRejected(
    "negative order total",
    `INSERT INTO orders (user_id, order_number, status, subtotal, total) VALUES (${userId}, 'RV-1999-CHK0001', 'PENDING_PAYMENT', 100, -1)`,
  );
  await mustBeRejected(
    "stock reservation with inverted rental window",
    `INSERT INTO stock_reservations (product_id, user_id, quantity, rental_start, rental_end, expires_at)
     VALUES (${productId}, ${userId}, 1, NOW(), NOW() - INTERVAL 1 DAY, NOW())`,
  );
  await mustBeRejected(
    "stock reservation with zero quantity",
    `INSERT INTO stock_reservations (product_id, user_id, quantity, expires_at) VALUES (${productId}, ${userId}, 0, NOW())`,
  );
  // First write is legitimate and must succeed; the *replay* is what the unique
  // pair `(scope, key)` / `(provider, event_id)` exists to stop.
  // `key` and `event_id` are reserved/awkward words — always backtick them.
  try {
    await db.query(
      `INSERT INTO idempotency_keys (scope, \`key\`, request_hash, expires_at) VALUES ('order.create', 'shared-key', '${"a".repeat(64)}', NOW() + INTERVAL 1 DAY)`,
    );
    record("first idempotency key accepted", "PASS");
  } catch (error) {
    record(`first idempotency key accepted — ${(error as Error).message.slice(0, 80)}`, "FAIL");
  }
  await mustBeRejected(
    "idempotency key replayed under the same scope",
    `INSERT INTO idempotency_keys (scope, \`key\`, request_hash, expires_at) VALUES ('order.create', 'shared-key', '${"b".repeat(64)}', NOW() + INTERVAL 1 DAY)`,
  );
  await mustBeAccepted(
    "same idempotency key under a different scope is allowed",
    `INSERT INTO idempotency_keys (scope, \`key\`, request_hash, expires_at) SELECT 'refund.create', \`key\`, request_hash, expires_at FROM idempotency_keys WHERE scope = 'order.create' AND \`key\` = 'shared-key'`,
  );

  try {
    await db.query(
      `INSERT INTO payment_webhook_events (provider, event_id, event_type, payload) VALUES ('mock', 'evt_duplicate', 'payment.succeeded', '{}')`,
    );
    record("first webhook event accepted", "PASS");
  } catch (error) {
    record(`first webhook event accepted — ${(error as Error).message.slice(0, 80)}`, "FAIL");
  }
  await mustBeRejected(
    "payment webhook event replayed (same provider + event id)",
    `INSERT INTO payment_webhook_events (provider, event_id, event_type, payload) VALUES ('mock', 'evt_duplicate', 'payment.succeeded', '{}')`,
  );
  await mustBeRejected(
    "search history term that is only whitespace",
    `INSERT INTO search_history (user_id, term) VALUES (${userId}, '   ')`,
  );

  /* History must survive the entity it describes. */
  try {
    await db.query(
      `DELETE FROM products WHERE id = (SELECT product_id FROM order_items ORDER BY product_id LIMIT 1)`,
    );
    record("deleting a product with order history is rejected", "FAIL");
  } catch {
    record("deleting a product with order history is rejected", "PASS");
  }

  /* ------------------ PROMPT 1 — coupons, disputes, commission ---------------- */
  /* ---------------------------------------------------------------------------- */

  // A coupon code is UNIQUE under `utf8mb4_unicode_ci`, so the same code in a
  // different case must collide. First write is legitimate and must succeed.
  await mustBeAccepted(
    "first coupon code accepted",
    `INSERT INTO coupons (code, discount_type, discount_value) VALUES ('SAVEVERIFY', 'PERCENT', 1500)`,
  );
  await mustBeRejected(
    "duplicate coupon code (case-insensitive)",
    `INSERT INTO coupons (code, discount_type, discount_value) VALUES ('saveverify', 'PERCENT', 1000)`,
  );
  await mustBeRejected(
    "percent coupon above 10000 basis points",
    `INSERT INTO coupons (code, discount_type, discount_value) VALUES ('SAVEVERIFY-BAD', 'PERCENT', 200000)`,
  );
  await mustBeRejected(
    "coupon with a nil discount value",
    `INSERT INTO coupons (code, discount_type, discount_value) VALUES ('SAVEVERIFY-BAD', 'FLAT', 0)`,
  );
  await mustBeRejected(
    "coupon already spent past its usage limit",
    `INSERT INTO coupons (code, discount_type, discount_value, usage_limit, used_count) VALUES ('SAVEVERIFY-BAD', 'FLAT', 100, 5, 6)`,
  );
  // These two now guard what MariaDB CHECKs cannot: live orders use `status`
  // values the DB cannot enumerate (the enum lives in the API layer), so only
  // the outer shape is pinned down here.
  if (orderId && userId) {
    await mustBeRejected(
      "dispute resolved before it was opened",
      `INSERT INTO disputes (dispute_number, order_id, opened_by, reason, status, resolved_at)
       VALUES ('DSP-VERIFY-1', ${orderId}, ${userId}, 'probe window', 'RESOLVED', NOW() - INTERVAL 1 DAY)`,
    );
    await mustBeRejected(
      "dispute with a blank reason",
      `INSERT INTO disputes (dispute_number, order_id, opened_by, reason) VALUES ('DSP-VERIFY-2', ${orderId}, ${userId}, '   ')`,
    );
    await mustBeAccepted(
      "first dispute number accepted",
      `INSERT INTO disputes (dispute_number, order_id, opened_by, reason) VALUES ('DSP-VERIFY-3', ${orderId}, ${userId}, 'probe unique')`,
    );
    await mustBeRejected(
      "duplicate dispute number",
      `INSERT INTO disputes (dispute_number, order_id, opened_by, reason) VALUES ('DSP-VERIFY-3', ${orderId}, ${userId}, 'again')`,
    );
  }

  // Commission rules are UNIQUE on (scope, category_id, seller_id,
  // effective_from). MySQL treats NULL as distinct in a unique index, so the
  // constraint only bites when every subject column is named — the shape proven
  // here is a seller's category override. GLOBAL/CATEGORY singletons (rows with
  // NULL subjects) are defended by the API layer; see `server/schema.ts` and
  // Follow-up F6 in docs/database.md. A fixed timestamp makes the second insert
  // collide instead of silently getting a different now().
  await mustBeRejected(
    "commission percent beyond 10000 bp",
    `INSERT INTO commission_rules (scope, percent_bp) VALUES ('GLOBAL', 20000)`,
  );
  await mustBeRejected(
    "commission with a negative fixed fee",
    `INSERT INTO commission_rules (scope, percent_bp, fixed_fee_paise) VALUES ('GLOBAL', 500, -1)`,
  );
  await mustBeRejected(
    "commission with an inverted window",
    `INSERT INTO commission_rules (scope, percent_bp, effective_from, effective_to)
     VALUES ('GLOBAL', 500, NOW(), NOW() - INTERVAL 1 DAY)`,
  );
  if (sellerId) {
    await mustBeAccepted(
      "first seller commission rule accepted",
      `INSERT INTO commission_rules (scope, seller_id, percent_bp, effective_from)
       VALUES ('SELLER', ${sellerId}, 9505, '2026-01-15 00:00:00')`,
    );
    await mustBeAccepted(
      "same seller, later effective_from, is a new rule",
      `INSERT INTO commission_rules (scope, seller_id, percent_bp, effective_from)
       VALUES ('SELLER', ${sellerId}, 9505, '2026-05-01 00:00:00')`,
    );
  }
  if (categoryId && sellerId) {
    // Every subject column named → every column non-NULL → the unique fires.
    await mustBeAccepted(
      "first category-override for a seller accepted",
      `INSERT INTO commission_rules (scope, category_id, seller_id, percent_bp, effective_from)
       VALUES ('SELLER', ${categoryId}, ${sellerId}, 9505, '2026-02-01 00:00:00')`,
    );
    await mustBeRejected(
      "duplicate (scope, category, seller, effective_from) commission rule",
      `INSERT INTO commission_rules (scope, category_id, seller_id, percent_bp, effective_from)
       VALUES ('SELLER', ${categoryId}, ${sellerId}, 500, '2026-02-01 00:00:00')`,
    );
  }

  /* ---------------------- PROMPT 1 — RBAC and verifications ------------------ */
  /* ---------------------------------------------------------------------------- */

  // Role names are UNIQUE and case-insensitive too — a grant holder must not be
  // able to create a near-twin role.
  await mustBeAccepted(
    "first role name accepted",
    `INSERT INTO roles (name, description, is_system) VALUES ('VERIFY_ROLE', 'probe', false)`,
  );
  await mustBeRejected(
    "duplicate role name (case-insensitive)",
    `INSERT INTO roles (name) VALUES ('verify_role')`,
  );
  await mustBeRejected(
    "permission key without a resource.action separator",
    "INSERT INTO permissions (`key`, group_key) VALUES ('noprefix', 'verify')",
  );
  await mustBeAccepted(
    "permission key that does have the separator",
    "INSERT INTO permissions (`key`, group_key) VALUES ('verify.probe', 'verify')",
  );
  await mustBeRejected(
    "empty login identifier",
    `INSERT INTO login_attempts (identifier, success) VALUES ('   ', false)`,
  );
  if (userId) {
    await mustBeRejected(
      "assigning a role that does not exist",
      `INSERT INTO user_roles (user_id, role_id) VALUES (${userId}, 2147483647)`,
    );
  }
  if (sellerId) {
    await mustBeRejected(
      "seller verification rejected without a reason",
      `INSERT INTO seller_verifications (seller_id, status) VALUES (${sellerId}, 'REJECTED')`,
    );
  }
  if (sellerId && orderId) {
    await mustBeRejected(
      "refund with a non-positive amount",
      `INSERT INTO refunds (refund_number, order_id, user_id, amount) VALUES ('RF-VERIFY-1', ${orderId}, ${sellerId}, 0)`,
    );
  }
}

/* -------------------------------- cleanup ------------------------------- */

await cleanup();

// The claim this script makes — "a run leaves the data exactly as it found it"
// — has to be checked, not asserted. Any marker this run created must be gone.
const [residueRows] = await db.query(
  `SELECT
     (SELECT COUNT(*) FROM idempotency_keys WHERE \`key\` = 'shared-key') AS a,
     (SELECT COUNT(*) FROM payment_webhook_events WHERE event_id = 'evt_duplicate') AS b,
     (SELECT COUNT(*) FROM users WHERE password_hash = 'x') AS c,
     (SELECT COUNT(*) FROM products WHERE slug IN ('neg-price-slug', 'neg-rent-slug') OR title = 'dupe') AS d,
     (SELECT COUNT(*) FROM orders WHERE order_number = 'RV-1999-CHK0001') AS e,
     (SELECT COUNT(*) FROM search_history WHERE TRIM(term) = '') AS f,
     (SELECT COUNT(*) FROM stock_reservations WHERE quantity <= 0 OR rental_end <= rental_start) AS g,
     (SELECT COUNT(*) FROM cart_items WHERE quantity <= 0) AS h,
     (SELECT COUNT(*) FROM reviews WHERE comment = 'bad' AND rating NOT BETWEEN 1 AND 5) AS i,
     (SELECT COUNT(*) FROM coupons WHERE code IN ('SAVEVERIFY', 'saveverify', 'SAVEVERIFY-BAD')) AS j,
     (SELECT COUNT(*) FROM disputes WHERE dispute_number LIKE 'DSP-VERIFY-%') AS k,
     (SELECT COUNT(*) FROM commission_rules WHERE percent_bp = 9505) AS l,
     (SELECT COUNT(*) FROM roles WHERE name IN ('VERIFY_ROLE', 'verify_role')) AS m,
     (SELECT COUNT(*) FROM user_roles WHERE role_id = 2147483647) AS n,
     (SELECT COUNT(*) FROM login_attempts WHERE TRIM(identifier) = '') AS o,
     (SELECT COUNT(*) FROM seller_verifications WHERE status = 'REJECTED' AND COALESCE(rejection_reason, '') = '') AS p,
     (SELECT COUNT(*) FROM refunds WHERE refund_number = 'RF-VERIFY-1') AS q,
     (SELECT COUNT(*) FROM permissions WHERE \`key\` IN ('verify.probe', 'noprefix')) AS r,
     (SELECT COUNT(*) FROM user_blocks WHERE reason IN ('verify-probe', 'verify-probe-2')) AS s`,
);
const residue = (residueRows as Record<string, number>[])[0];
const residueCount = Object.values(residue ?? {}).reduce((sum, n) => sum + n, 0);
record(`no residue left behind (${residueCount} stray row(s))`, residueCount === 0 ? "PASS" : "FAIL");

await db.end();

const failures = results.filter((r) => r.outcome === "FAIL");
const skipped = results.filter((r) => r.outcome === "SKIPPED");
console.log(
  `\n  ${results.length} checks — ${results.length - failures.length - skipped.length} passed` +
    `, ${failures.length} failed, ${skipped.length} skipped.\n`,
);

if (failures.length > 0) {
  console.error(`  db:verify:constraints FAILED: ${failures.map((f) => f.label).join(", ")}\n`);
  process.exit(1);
}
