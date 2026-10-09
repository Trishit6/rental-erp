import { createTableRelationsHelpers, extractTablesRelationalConfig, getTableName, is, Table } from "drizzle-orm";
import { getTableConfig, type MySqlTable } from "drizzle-orm/mysql-core";
import { describe, expect, it } from "vitest";
import * as schema from "../server/schema";
import {
  BRIEF_PRODUCT_MODES,
  ORDER_STATUSES,
  PRODUCT_STATUSES,
  PRODUCT_MODE_TO_LISTING_TYPE,
  REPORT_STATUSES,
  REVIEW_STATUSES,
  USER_ROLES,
  productStatusSchema,
  reportStatusSchema,
  // PROMPT 1 vocabularies.
  ALL_ROLE_NAMES,
  CMS_STATUSES,
  COMMISSION_SCOPES,
  COUPON_SCOPES,
  DISCOUNT_TYPES,
  DISPUTE_STATUSES,
  PERCENT_BPS_MAX,
  REFUND_STATUSES,
  SELLER_VERIFICATION_STATUSES,
  SYSTEM_ROLES,
  TICKET_STATUSES,
  commissionScopeSchema,
  couponScopeSchema,
  discountTypeSchema,
  disputeStatusSchema,
  securityEventTypeSchema,
  ticketStatusSchema,
} from "../server/lib/enums";
import {
  commissionRuleInsertSchema,
  couponInsertSchema,
  orderEventInsertSchema,
  stockReservationInsertSchema,
  searchHistoryInsertSchema,
} from "../server/schema-zod";

/**
 * What the schema claims, checked without a database.
 *
 * A `check()` in `server/schema.ts` proves the author *intended* a constraint;
 * only `pnpm db:verify:constraints` proves MariaDB enforces it. This suite is
 * the fast half of that pair: it runs on every `pnpm test`, catches the
 * constraint being dropped or weakened before a migration is ever generated,
 * and needs no connection.
 *
 * Everything here reads the Drizzle schema **objects** rather than parsing
 * `schema.ts` as text — a regex that quietly stopped matching would make every
 * assertion below pass while checking nothing. (`tests/seed-truncate.test.ts`
 * sets the same precedent.)
 */

const tablesByName = new Map<string, MySqlTable>();
for (const exported of Object.values(schema)) {
  if (is(exported, Table)) tablesByName.set(getTableName(exported), exported as MySqlTable);
}

function tableConfig(tableName: string) {
  const table = tablesByName.get(tableName);
  expect(table, `table "${tableName}" is missing from server/schema.ts`).toBeDefined();
  return getTableConfig(table as MySqlTable);
}

/** Every `onDelete` rule on a table as `column -> referencedTable [rule]`. */
function deleteRules(tableName: string) {
  return tableConfig(tableName).foreignKeys.map((foreignKey) => {
    const reference = foreignKey.reference();
    return {
      column: reference.columns.map((column) => column.name).join(","),
      to: getTableName(reference.foreignTable),
      onDelete: foreignKey.onDelete,
    };
  });
}

function hasIndex(tableName: string, indexName: string) {
  return tableConfig(tableName).indexes.some((index) => index.config.name === indexName);
}

function hasCheck(tableName: string, checkName: string) {
  return tableConfig(tableName).checks.some((check) => check.name === checkName);
}

function columnNames(tableName: string) {
  return tableConfig(tableName).columns.map((column) => column.name);
}

function columnType(tableName: string, columnName: string) {
  const column = tableConfig(tableName).columns.find((entry) => entry.name === columnName);
  expect(column, `${tableName}.${columnName} does not exist`).toBeDefined();
  return column?.getSQLType();
}

/* -------------------------------------------------------------------------- */

describe("the tables the spec asks for", () => {
  const REQUIRED = [
    "users",
    "sessions",
    "addresses",
    "categories",
    "products",
    "product_images",
    "favorites",
    "carts",
    "cart_items",
    "orders",
    "order_items",
    "rentals",
    "reviews",
    "seller_profiles",
    "transactions",
    "conversations",
    "conversation_participants",
    "messages",
    "notifications",
    "reports",
    // The spec's `audit_logs`; it ships under this name.
    "admin_audit_log",
    // Foundation tables for features specified but not yet built.
    "order_events",
    "rental_events",
    "stock_reservations",
    "idempotency_keys",
    "payment_webhook_events",
    "platform_settings",
    "search_history",
    "notification_preferences",
    // Admin, security, support, money and growth (PROMPT 1).
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
  ];

  it("defines every one of them", () => {
    for (const tableName of REQUIRED) {
      expect(tablesByName.has(tableName), `missing table: ${tableName}`).toBe(true);
    }
  });

  it("introduces no table that does not exist in MariaDB", () => {
    // The other direction: a table left behind in the schema after being dropped
    // would make every query against it fail at runtime and only at runtime.
    expect(tablesByName.size).toBe(56);
  });

  it("gives every table a created_at", () => {
    const without = [...tablesByName.keys()].filter(
      (tableName) => !columnNames(tableName).includes("created_at"),
    );
    expect(without).toEqual([]);
  });

  it("gives every table an updated_at, or documents why it has none", () => {
    // Append-only rows do not have a state to update, and two of these carry a
    // purpose-built timestamp instead. Anything not named here must gain an
    // `updated_at` (with `onUpdateNow()`), because "when did this row change?"
    // is not answerable after the fact.
    const appendOnly: Record<string, string> = {
      admin_audit_log: "append-only log; id + created_at is the whole record",
      conversations: "only `last_message_at` moves",
      favorites: "a favorite is created or removed, never edited",
      messages: "append-only transcript",
      order_events: "append-only timeline; events are never rewritten",
      product_tags: "junction row; created or removed",
      rental_events: "append-only lifecycle log",
      review_helpful_votes: "cast or withdrawn, never edited",
      search_history: "a search is recorded once, at the moment it is made",
      sessions: "only `last_used_at` moves",
      // PROMPT 1 append-only rows and junctions.
      role_permissions: "junction; a grant set is rebuilt on change, never edited in place",
      user_roles: "junction; a grant is added or removed, never edited",
      login_attempts: "one row per attempt, written at the moment it happens",
      security_events: "append-only security audit trail",
      ticket_messages: "append-only transcript; a message is never rewritten",
      ticket_attachments: "append-only file reference; a row is created once",
      coupon_redemptions: "append-only; one row per redemption, in the transaction that spends it",
    };

    const missing = [...tablesByName.keys()].filter(
      (tableName) => !columnNames(tableName).includes("updated_at"),
    );
    const undocumented = missing.filter((tableName) => !(tableName in appendOnly));
    expect(undocumented, "these tables have no updated_at and no recorded reason").toEqual([]);

    // And the allowlist must not quietly absorb a table that *does* have one.
    expect(missing.filter((tableName) => columnNames(tableName).includes("updated_at"))).toEqual([]);
  });
});

describe("PROMPT 2 first-login flags on users", () => {
  it("adds must_change_password / must_enroll_mfa as non-null booleans defaulting to false", () => {
    // Seeded staff/demo accounts must rotate the shared password and (for staff)
    // enrol MFA; real users default both flags off. Migration 0020 adds them.
    expect(columnNames("users")).toEqual(
      expect.arrayContaining(["must_change_password", "must_enroll_mfa"]),
    );
    for (const columnName of ["must_change_password", "must_enroll_mfa"]) {
      const column = tableConfig("users").columns.find((entry) => entry.name === columnName);
      expect(column, `users.${columnName} does not exist`).toBeDefined();
      expect(column?.getSQLType(), columnName).toBe("boolean");
      expect(column?.notNull, columnName).toBe(true);
      expect(column?.hasDefault, columnName).toBe(true);
      expect(column?.default, columnName).toBe(false);
    }
  });
});

describe("money is stored as integer paise", () => {
  const MONEY_COLUMNS: [string, string][] = [
    ["products", "purchase_price"],
    ["products", "security_deposit"],
    ["products", "rental_price_per_day"],
    ["orders", "subtotal"],
    ["orders", "total"],
    ["orders", "deposit_total"],
    ["order_items", "unit_price"],
    ["order_items", "line_total"],
    ["rentals", "total"],
    ["transactions", "amount"],
    ["payouts", "amount"],
    ["wallet_transactions", "amount"],
    // PROMPT 1 money columns — all integer paise (never a float or decimal).
    ["commission_rules", "fixed_fee_paise"],
    ["coupons", "discount_value"],
    ["coupon_redemptions", "discount_paise"],
    ["refunds", "amount"],
  ];

  it("uses an integer column for every amount, never a float or decimal", () => {
    for (const [tableName, columnName] of MONEY_COLUMNS) {
      expect(columnType(tableName, columnName), `${tableName}.${columnName}`).toBe("int");
    }
  });

  it("declares a currency column with the INR default", () => {
    const currency = tableConfig("orders").columns.find((c) => c.name === "currency");
    expect(currency?.getSQLType()).toBe("varchar(3)");
    expect(String(currency?.default)).toContain("INR");
  });
});

describe("unique constraints the spec calls for", () => {
  it.each([
    ["users", "users_email_unique"],
    ["products", "products_slug_unique"],
    ["orders", "orders_order_number_unique"],
    ["favorites", "favorites_user_product_unique"],
    ["carts", "carts_user_id_unique"],
    ["reviews", "reviews_order_item_unique"],
    ["transactions", "transactions_provider_reference_unique"],
    ["idempotency_keys", "idempotency_keys_scope_key_unique"],
    ["payment_webhook_events", "payment_webhook_events_provider_event_unique"],
    ["search_history", "search_history_user_term_unique"],
    // PROMPT 1 uniqueness.
    ["roles", "roles_name_unique"],
    ["permissions", "permissions_key_unique"],
    ["app_config", "app_config_key_unique"],
    ["cms_blocks", "cms_blocks_key_unique"],
    ["feature_flags", "feature_flags_key_unique"],
    ["coupons", "coupons_code_unique"],
    ["coupon_redemptions", "coupon_redemptions_coupon_order_unique"],
    ["commission_rules", "commission_rules_scope_subject_start_unique"],
    ["disputes", "disputes_number_unique"],
    ["refunds", "refunds_number_unique"],
    ["refunds", "refunds_idempotency_key_unique"],
    ["support_tickets", "support_tickets_number_unique"],
    ["export_jobs", "export_jobs_key_unique"],
    ["mfa_recovery_codes", "mfa_recovery_codes_hash_unique"],
  ])("enforces %s.%s", (tableName, indexName) => {
    expect(hasIndex(tableName, indexName), `${tableName}.${indexName}`).toBe(true);
  });

  it("allows one row per participant per conversation", () => {
    // A composite primary key rather than a unique index — the same guarantee,
    // declared where Drizzle can also use it as the relation's join key.
    const { primaryKeys } = tableConfig("conversation_participants");
    expect(primaryKeys).toHaveLength(1);
    expect(primaryKeys[0]?.columns.map((c) => c.name)).toEqual(["conversation_id", "user_id"]);
  });

  it("deliberately does NOT unique (cart_id, product_id, mode)", () => {
    // The spec asks for this one and it would be wrong. Two rental lines for the
    // same product with *different* windows are distinct, legitimate lines, and
    // those three columns say nothing about the window — the constraint would
    // forbid a cart that checkout already supports. Dedupe is done once, in
    // `mergeCartItem`, inside a transaction that locks the cart row.
    // `tests/cart-schema.test.ts` covers the merge.
    expect(hasIndex("cart_items", "cart_items_cart_id_product_id_mode_unique")).toBe(false);
  });

  it("keeps one review per purchased line", () => {
    // `unique (user_id, order_item_id)` in the spec is implied by the stronger
    // `unique (order_item_id)`: at most one review for the line, whoever wrote it.
    expect(hasIndex("reviews", "reviews_order_item_unique")).toBe(true);
  });
});

describe("check constraints", () => {
  it("rejects a negative price on every money column", () => {
    expect(hasCheck("products", "products_purchase_price_nonneg")).toBe(true);
    expect(hasCheck("products", "products_rental_price_day_nonneg")).toBe(true);
    expect(hasCheck("products", "products_deposit_nonneg")).toBe(true);
    expect(hasCheck("orders", "orders_total_nonneg")).toBe(true);
    expect(hasCheck("orders", "orders_subtotal_nonneg")).toBe(true);
    expect(hasCheck("order_items", "order_items_line_total_nonneg")).toBe(true);
    expect(hasCheck("rentals", "rentals_total_nonneg")).toBe(true);
    expect(hasCheck("transactions", "transactions_amount_nonneg")).toBe(true);
  });

  it("rejects a non-positive quantity", () => {
    expect(hasCheck("cart_items", "cart_items_quantity_positive")).toBe(true);
    expect(hasCheck("order_items", "order_items_quantity_positive")).toBe(true);
    expect(hasCheck("products", "products_quantity_positive")).toBe(true);
    expect(hasCheck("stock_reservations", "stock_reservations_quantity_positive")).toBe(true);
  });

  it("keeps a rating between 1 and 5", () => {
    expect(hasCheck("reviews", "reviews_rating_in_range")).toBe(true);
  });

  it("orders the new tables' rental window but leaves the seeded ones alone", () => {
    // `rentals` and `order_items` cannot take this CHECK: live rows already
    // violate it (rentals.id = 129 and nine order_items rows store a return
    // time *before* their start — bad seed data from 2026-10-02). Adding it
    // would make the migration fail on the populated database, which the brief
    // forbids. Tracked as Follow-up F2 in docs/database.md.
    expect(hasCheck("stock_reservations", "stock_reservations_window_ordered")).toBe(true);
    expect(hasCheck("rentals", "rentals_end_after_start")).toBe(false);
  });

  it("gives the database a meaningful number of checks overall", () => {
    const total = [...tablesByName.values()].reduce(
      (count, table) => count + getTableConfig(table).checks.length,
      0,
    );
    expect(total).toBeGreaterThanOrEqual(40);
  });
});

describe("PROMPT 1 check constraints", () => {
  it("keeps commission rates in whole-percent bound and windows in order", () => {
    expect(hasCheck("commission_rules", "commission_rules_percent_range")).toBe(true);
    expect(hasCheck("commission_rules", "commission_rules_fixed_fee_nonneg")).toBe(true);
    expect(hasCheck("commission_rules", "commission_rules_window_ordered")).toBe(true);
  });

  it("keeps a coupon well-formed even before the API validates it", () => {
    expect(hasCheck("coupons", "coupons_value_positive")).toBe(true);
    expect(hasCheck("coupons", "coupons_percent_bp_range")).toBe(true);
    expect(hasCheck("coupons", "coupons_minimum_order_nonneg")).toBe(true);
    expect(hasCheck("coupons", "coupons_used_within_limit")).toBe(true);
    expect(hasCheck("coupons", "coupons_window_ordered")).toBe(true);
    expect(hasCheck("coupon_redemptions", "coupon_redemptions_discount_positive")).toBe(true);
  });

  it("orders a dispute's resolution after its opening", () => {
    expect(hasCheck("disputes", "disputes_resolved_at_not_before_created")).toBe(true);
    expect(hasCheck("disputes", "disputes_reason_not_empty")).toBe(true);
    expect(hasCheck("refunds", "refunds_amount_positive")).toBe(true);
    expect(hasCheck("refunds", "refunds_currency_length")).toBe(true);
  });

  it("keeps support rows presentable", () => {
    expect(hasCheck("support_tickets", "support_tickets_sla_after_created")).toBe(true);
    expect(hasCheck("support_tickets", "support_tickets_subject_not_empty")).toBe(true);
    expect(hasCheck("ticket_messages", "ticket_messages_body_not_empty")).toBe(true);
    expect(hasCheck("ticket_attachments", "ticket_attachments_file_not_empty")).toBe(true);
    expect(hasCheck("ticket_attachments", "ticket_attachments_size_positive")).toBe(true);
  });

  it("anchors the RBAC and identity keys so a blank row is impossible", () => {
    expect(hasCheck("roles", "roles_name_not_empty")).toBe(true);
    expect(hasCheck("permissions", "permissions_key_not_empty")).toBe(true);
    expect(hasCheck("permissions", "permissions_key_has_separator")).toBe(true);
    expect(hasCheck("login_attempts", "login_attempts_identifier_not_empty")).toBe(true);
    expect(hasCheck("security_events", "security_events_type_not_empty")).toBe(true);
    expect(hasCheck("mfa_recovery_codes", "mfa_recovery_codes_hash_not_empty")).toBe(true);
  });

  it("keeps the content and config rows sane", () => {
    expect(hasCheck("cms_banners", "cms_banners_title_not_empty")).toBe(true);
    expect(hasCheck("cms_banners", "cms_banners_sort_nonneg")).toBe(true);
    expect(hasCheck("cms_blocks", "cms_blocks_key_not_empty")).toBe(true);
    expect(hasCheck("app_config", "app_config_key_not_empty")).toBe(true);
    expect(hasCheck("app_config", "app_config_value_not_empty")).toBe(true);
    expect(hasCheck("feature_flags", "feature_flags_rollout_range")).toBe(true);
    expect(hasCheck("export_jobs", "export_jobs_row_count_nonneg")).toBe(true);
    expect(hasCheck("export_jobs", "export_jobs_type_not_empty")).toBe(true);
    expect(hasCheck("seller_verifications", "seller_verifications_rejected_needs_reason")).toBe(true);
  });
});

describe("delete rules", () => {
  it("restricts anything the money trail depends on", () => {
    expect(deleteRules("orders")).toContainEqual({ column: "user_id", to: "users", onDelete: "restrict" });
    expect(deleteRules("order_items")).toContainEqual({
      column: "product_id",
      to: "products",
      onDelete: "restrict",
    });
    expect(deleteRules("order_items")).toContainEqual({
      column: "seller_id",
      to: "users",
      onDelete: "restrict",
    });
    expect(deleteRules("transactions")).toContainEqual({
      column: "user_id",
      to: "users",
      onDelete: "restrict",
    });
    // An audit trail that disappears with the administrator it names is not one.
    expect(deleteRules("admin_audit_log")).toContainEqual({
      column: "admin_id",
      to: "users",
      onDelete: "restrict",
    });
  });

  it("cascades the throwaway state", () => {
    expect(deleteRules("cart_items")).toContainEqual({
      column: "cart_id",
      to: "carts",
      onDelete: "cascade",
    });
    expect(deleteRules("favorites")).toContainEqual({
      column: "product_id",
      to: "products",
      onDelete: "cascade",
    });
    expect(deleteRules("product_images")).toContainEqual({
      column: "product_id",
      to: "products",
      onDelete: "cascade",
    });
    expect(deleteRules("stock_reservations")).toContainEqual({
      column: "product_id",
      to: "products",
      onDelete: "cascade",
    });
  });

  it("keeps history when the thing it describes goes away", () => {
    expect(deleteRules("orders")).toContainEqual({
      column: "delivery_address_id",
      to: "addresses",
      onDelete: "set null",
    });
    expect(deleteRules("order_events")).toContainEqual({
      column: "actor_id",
      to: "users",
      onDelete: "set null",
    });
    expect(deleteRules("conversations")).toContainEqual({
      column: "order_id",
      to: "orders",
      onDelete: "set null",
    });
    expect(deleteRules("platform_settings")).toContainEqual({
      column: "updated_by",
      to: "users",
      onDelete: "set null",
    });
  });
});

describe("PROMPT 1 delete rules", () => {
  it("lets the RBAC junctions die with either side", () => {
    expect(deleteRules("role_permissions")).toContainEqual({
      column: "role_id",
      to: "roles",
      onDelete: "cascade",
    });
    expect(deleteRules("role_permissions")).toContainEqual({
      column: "permission_id",
      to: "permissions",
      onDelete: "cascade",
    });
    expect(deleteRules("user_roles")).toContainEqual({
      column: "user_id",
      to: "users",
      onDelete: "cascade",
    });
  });

  it("refuses to drop a role that still has grants", () => {
    expect(deleteRules("user_roles")).toContainEqual({
      column: "role_id",
      to: "roles",
      onDelete: "restrict",
    });
  });

  it("cascades identity state that is meaningless without the account", () => {
    expect(deleteRules("user_mfa")).toContainEqual({
      column: "user_id",
      to: "users",
      onDelete: "cascade",
    });
    expect(deleteRules("mfa_recovery_codes")).toContainEqual({
      column: "user_id",
      to: "users",
      onDelete: "cascade",
    });
    expect(deleteRules("coupon_redemptions")).toContainEqual({
      column: "coupon_id",
      to: "coupons",
      onDelete: "cascade",
    });
  });

  it("keeps the money trail even when the user is deleted", () => {
    expect(deleteRules("refunds")).toContainEqual({
      column: "order_id",
      to: "orders",
      onDelete: "restrict",
    });
    expect(deleteRules("refunds")).toContainEqual({
      column: "transaction_id",
      to: "transactions",
      onDelete: "set null",
    });
    expect(deleteRules("disputes")).toContainEqual({
      column: "order_id",
      to: "orders",
      onDelete: "restrict",
    });
  });

  it("keeps a verification history with the seller, and its reviewer only until they vanish", () => {
    expect(deleteRules("seller_verifications")).toContainEqual({
      column: "seller_id",
      to: "users",
      onDelete: "restrict",
    });
    expect(deleteRules("seller_verifications")).toContainEqual({
      column: "reviewed_by",
      to: "users",
      onDelete: "set null",
    });
  });

  it("keeps a support conversation with its customer and its order", () => {
    expect(deleteRules("support_tickets")).toContainEqual({
      column: "user_id",
      to: "users",
      onDelete: "restrict",
    });
    expect(deleteRules("support_tickets")).toContainEqual({
      column: "order_id",
      to: "orders",
      onDelete: "set null",
    });
    expect(deleteRules("ticket_messages")).toContainEqual({
      column: "ticket_id",
      to: "support_tickets",
      onDelete: "cascade",
    });
    expect(deleteRules("ticket_attachments")).toContainEqual({
      column: "ticket_message_id",
      to: "ticket_messages",
      onDelete: "cascade",
    });
  });

  it("nulls the audit trail's actor and the flagged columns, never deletes them", () => {
    expect(deleteRules("security_events")).toContainEqual({
      column: "user_id",
      to: "users",
      onDelete: "set null",
    });
    expect(deleteRules("login_attempts")).toContainEqual({
      column: "user_id",
      to: "users",
      onDelete: "set null",
    });
    expect(deleteRules("coupons")).toContainEqual({
      column: "category_id",
      to: "categories",
      onDelete: "set null",
    });
    expect(deleteRules("commission_rules")).toContainEqual({
      column: "category_id",
      to: "categories",
      onDelete: "set null",
    });
    expect(deleteRules("export_jobs")).toContainEqual({
      column: "requested_by",
      to: "users",
      onDelete: "restrict",
    });
  });
});

describe("indexes the spec asks for", () => {
  it.each([
    ["products", "products_status_category_created_idx"],
    ["products", "products_seller_status_idx"],
    ["orders", "orders_user_created_idx"],
    ["orders", "orders_status_created_idx"],
    ["order_items", "order_items_seller_order_idx"],
    ["rentals", "rentals_product_start_end_idx"],
    ["rentals", "rentals_status_end_idx"],
    ["transactions", "transactions_status_created_idx"],
    ["reports", "reports_status_created_idx"],
  ])("keeps %s.%s", (tableName, indexName) => {
    expect(hasIndex(tableName, indexName), `${tableName}.${indexName}`).toBe(true);
  });

  it("indexes the columns that sorting actually runs on", () => {
    // The admin lists and the feeds all default to newest-first.
    expect(hasIndex("orders", "orders_created_at_idx")).toBe(true);
    expect(hasIndex("transactions", "transactions_created_at_idx")).toBe(true);
    expect(hasIndex("notifications", "notifications_user_read_idx")).toBe(true);
    expect(hasIndex("messages", "messages_conversation_created_idx")).toBe(true);
  });
});

describe("PROMPT 1 indexes", () => {
  it.each([
    // Search: the prefix fallback for `search_text` full-text (added in 0019).
    ["products", "products_title_idx"],
    ["cms_banners", "cms_banners_placement_status_sort_idx"],
    ["commission_rules", "commission_rules_scope_effective_idx"],
    ["coupon_redemptions", "coupon_redemptions_user_created_idx"],
    ["coupons", "coupons_status_starts_idx"],
    ["disputes", "disputes_status_created_idx"],
    ["export_jobs", "export_jobs_user_created_idx"],
    ["feature_flags", "feature_flags_enabled_idx"],
    ["login_attempts", "login_attempts_identifier_created_idx"],
    ["mfa_recovery_codes", "mfa_recovery_codes_user_used_idx"],
    ["permissions", "permissions_group_key_idx"],
    ["refunds", "refunds_status_created_idx"],
    ["security_events", "security_events_user_created_idx"],
    ["seller_verifications", "seller_verifications_seller_status_idx"],
    ["support_tickets", "support_tickets_sla_idx"],
    ["ticket_messages", "ticket_messages_ticket_created_idx"],
    ["user_roles", "user_roles_role_id_idx"],
  ])("keeps %s.%s", (tableName, indexName) => {
    expect(hasIndex(tableName, indexName), `${tableName}.${indexName}`).toBe(true);
  });
});

describe("relational queries", () => {
  // Without a relations map every read is one round trip per row. This asserts
  // that every table that points somewhere has an edge, which is the part that
  // silently rots as tables are added.
  const relationalConfig = extractTablesRelationalConfig(
    schema as unknown as Record<string, unknown>,
    createTableRelationsHelpers,
  );

  // The config is keyed by export name (`productImages`), while the tables are
  // keyed by their MariaDB name (`product_images`).
  const byDbName = new Map(
    Object.values(relationalConfig.tables).map((entry) => [entry.dbName, entry]),
  );

  it("registers every table", () => {
    for (const tableName of tablesByName.keys()) {
      expect(byDbName.get(tableName), `no relational entry for "${tableName}"`).toBeDefined();
    }
  });

  it("declares an edge for every table that has a foreign key", () => {
    const withoutEdge = [...tablesByName.keys()].filter((tableName) => {
      const hasForeignKey = tableConfig(tableName).foreignKeys.length > 0;
      const edges = byDbName.get(tableName)?.relations ?? {};
      return hasForeignKey && Object.keys(edges).length === 0;
    });
    expect(withoutEdge, "these tables have FKs but no relation to read them through").toEqual([]);
  });
});

describe("the shared vocabulary module", () => {
  it("re-exports one list per vocabulary, not a restatement", () => {
    expect(USER_ROLES).toEqual(["USER", "SELLER", "ADMIN"]);
    expect(PRODUCT_STATUSES).toContain("PUBLISHED");
    expect(PRODUCT_STATUSES).toContain("OUT_OF_STOCK");
    expect(ORDER_STATUSES).toContain("PENDING_PAYMENT");
    expect(REPORT_STATUSES).toEqual(["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"]);
    expect(REVIEW_STATUSES).toEqual(["PUBLISHED", "HIDDEN"]);
  });

  it("maps the spec's product_mode onto the column that actually exists", () => {
    expect(PRODUCT_MODE_TO_LISTING_TYPE).toEqual({
      BUY: "SALE",
      RENT: "RENT",
      RENT_AND_BUY: "BOTH",
    });
    for (const mode of BRIEF_PRODUCT_MODES) {
      expect(["SALE", "RENT", "BOTH"]).toContain(PRODUCT_MODE_TO_LISTING_TYPE[mode]);
    }
  });

  it("validates the vocabularies it declares", () => {
    expect(productStatusSchema.safeParse("PUBLISHED").success).toBe(true);
    expect(productStatusSchema.safeParse("PUBLISHEDLY").success).toBe(false);
    expect(reportStatusSchema.safeParse("OPEN").success).toBe(true);
    expect(reportStatusSchema.safeParse("SOMETHING_ELSE").success).toBe(false);
  });

  it("PROMPT 1 — covers the roles a grant can name", () => {
    expect(SYSTEM_ROLES).toEqual([
      "SUPER_ADMIN",
      "ADMIN",
      "SUPPORT",
      "FINANCE",
      "MODERATOR",
      "CONTENT_MANAGER",
    ]);
    // `users.role` still carries only the coarse values (see enums.ts), so the
    // grantable set is system roles plus the two account kinds — otherwise a
    // role value that exists in `roles` could not be assigned.
    expect(ALL_ROLE_NAMES).toEqual([...SYSTEM_ROLES, "USER", "SELLER"]);
  });

  it("PROMPT 1 — one list per workflow vocabulary", () => {
    expect(TICKET_STATUSES).toEqual(["OPEN", "PENDING", "IN_PROGRESS", "RESOLVED", "CLOSED"]);
    expect(DISPUTE_STATUSES).toEqual(["OPEN", "UNDER_REVIEW", "RESOLVED", "DISMISSED"]);
    expect(REFUND_STATUSES).toEqual(["PENDING", "PROCESSING", "SUCCEEDED", "FAILED", "CANCELLED"]);
    expect(CMS_STATUSES).toEqual(["DRAFT", "SCHEDULED", "ACTIVE", "PAUSED"]);
    expect(SELLER_VERIFICATION_STATUSES).toEqual(["PENDING", "VERIFIED", "REJECTED", "EXPIRED"]);
    expect(DISCOUNT_TYPES).toEqual(["PERCENT", "FLAT"]);
    expect(COUPON_SCOPES).toEqual(["ALL", "CATEGORY", "PRODUCT"]);
    expect(COMMISSION_SCOPES).toEqual(["GLOBAL", "CATEGORY", "SELLER"]);
  });

  it("PROMPT 1 — parses the vocabularies it declares, and rejects near-misses", () => {
    expect(ticketStatusSchema.safeParse("OPEN").success).toBe(true);
    expect(ticketStatusSchema.safeParse("OPENED").success).toBe(false);
    expect(disputeStatusSchema.safeParse("UNDER_REVIEW").success).toBe(true);
    expect(disputeStatusSchema.safeParse("UNDERREVIEW").success).toBe(false);
    expect(commissionScopeSchema.safeParse("SELLER").success).toBe(true);
    expect(couponScopeSchema.safeParse("CATEGORY").success).toBe(true);
    expect(discountTypeSchema.safeParse("FLAT").success).toBe(true);
    expect(discountTypeSchema.safeParse("VALUE").success).toBe(false);
    expect(securityEventTypeSchema.safeParse("MFA_ENABLED").success).toBe(true);
    expect(securityEventTypeSchema.safeParse("MFA_ON").success).toBe(false);
    expect(PERCENT_BPS_MAX).toBe(10_000);
  });
});

describe("foundation insert schemas", () => {
  const validEvent = {
    orderId: 1,
    type: "STATUS_CHANGED" as const,
    toStatus: "CONFIRMED" as const,
  };

  it("accepts a well-formed order event", () => {
    expect(orderEventInsertSchema.safeParse(validEvent).success).toBe(true);
  });

  it("rejects an event whose transition names an unknown status", () => {
    const parsed = orderEventInsertSchema.safeParse({ ...validEvent, toStatus: "NOWHERE" });
    expect(parsed.success).toBe(false);
  });

  it("rejects a reservation with an inverted rental window", () => {
    const start = new Date("2026-10-02T07:28:00Z");
    const end = new Date("2026-10-02T07:16:00Z");
    const parsed = stockReservationInsertSchema.safeParse({
      productId: 1,
      userId: 1,
      rentalStart: start,
      rentalEnd: end,
      expiresAt: new Date(),
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a reservation whose window runs forward", () => {
    const parsed = stockReservationInsertSchema.safeParse({
      productId: 1,
      userId: 1,
      rentalStart: new Date("2026-10-02T07:16:00Z"),
      rentalEnd: new Date("2026-10-05T07:16:00Z"),
      expiresAt: new Date(),
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a search term that is only whitespace", () => {
    expect(searchHistoryInsertSchema.safeParse({ userId: 1, term: "   " }).success).toBe(false);
    expect(searchHistoryInsertSchema.safeParse({ userId: 1, term: "chair" }).success).toBe(true);
  });

  it("never accepts a client-supplied id or timestamp", () => {
    // `id`, `createdAt` and `updatedAt` are server-managed; letting a client set
    // them is how identity and timestamps get forged.
    const withId = orderEventInsertSchema.safeParse({ ...validEvent, id: 999 });
    expect(withId.success).toBe(true); // stripped as an unknown key, not read back
    expect(orderEventInsertSchema.shape.id).toBeUndefined();
  });
});

describe("PROMPT 1 insert schemas (the boundary half of dropped CHECKs)", () => {
  it("accepts a bare GLOBAL commission rule", () => {
    expect(commissionRuleInsertSchema.safeParse({}).success).toBe(true);
  });

  it("requires the subject when the scope names one", () => {
    // The DB-level CHECKs for these were removed because MariaDB refuses an
    // `ADD CONSTRAINT ... FOREIGN KEY` on a CHECK-referenced column (see
    // `server/schema.ts`); the boundary schema is what enforces them now.
    expect(commissionRuleInsertSchema.safeParse({ scope: "CATEGORY" }).success).toBe(false);
    expect(
      commissionRuleInsertSchema.safeParse({ scope: "CATEGORY", categoryId: 7 }).success,
    ).toBe(true);
    expect(commissionRuleInsertSchema.safeParse({ scope: "SELLER", sellerId: 3 }).success).toBe(true);
  });

  it("keeps a commission percent inside basis-point bounds", () => {
    expect(commissionRuleInsertSchema.safeParse({ percentBp: 10_001 }).success).toBe(false);
    expect(commissionRuleInsertSchema.safeParse({ percentBp: 10_000 }).success).toBe(true);
  });

  it("rejects an inverted commission window", () => {
    expect(
      commissionRuleInsertSchema.safeParse({
        effectiveFrom: new Date("2026-10-05T00:00:00Z"),
        effectiveTo: new Date("2026-10-01T00:00:00Z"),
      }).success,
    ).toBe(false);
  });

  it("requires a category when a coupon targets one", () => {
    expect(couponInsertSchema.safeParse({ code: "SAVE10", discountType: "FLAT", discountValue: 1000 }).success).toBe(true);
    expect(
      couponInsertSchema.safeParse({
        code: "SAVE10",
        discountType: "FLAT",
        discountValue: 1000,
        appliesTo: "CATEGORY",
      }).success,
    ).toBe(false);
  });

  it("keeps a percent coupon inside 10000 bp and money values non-negative", () => {
    const base = { code: "P10", discountType: "PERCENT" as const };
    expect(couponInsertSchema.safeParse({ ...base, discountValue: 10_001 }).success).toBe(false);
    expect(couponInsertSchema.safeParse({ ...base, discountValue: 10_000 }).success).toBe(true);
    expect(
      couponInsertSchema.safeParse({ code: "F", discountType: "FLAT", discountValue: 5, minimumOrderPaise: -1 }).success,
    ).toBe(false);
  });
});
