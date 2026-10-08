import {
  boolean,
  check,
  double,
  index,
  int,
  json,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";
import { relations, sql } from "drizzle-orm";

/* ---------------------------------- users --------------------------------- */

export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 80 }).notNull(),
    email: varchar("email", { length: 160 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 20 }),
    avatarUrl: varchar("avatar_url", { length: 500 }),
    role: varchar("role", { length: 10 }).notNull().default("USER"),
    verified: boolean("verified").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    // The admin users directory filters by role and sorts by sign-up time
    // (`listAdminUsers` in `server/lib/admin-queries.ts`), so both columns are
    // indexed for it.
    index("users_role_idx").on(table.role),
    index("users_created_at_idx").on(table.createdAt),
  ],
);

export const sessions = mysqlTable(
  "sessions",
  {
    /**
     * Server-generated session id, and what the access token's `sid` claim points
     * at.
     *
     * It used to *be* the hash of the opaque session cookie, which made rotation
     * impossible: replacing the credential would replace the primary key, and with
     * it every reference to the session. It is now an independent random id, and
     * the credential lives in `refreshTokenHash` where it can be rotated,
     * compared and revoked without moving the row's identity.
     */
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * SHA-256 of the *current* refresh token, as a hex string. The raw token
     * exists only in the browser's HttpOnly cookie; the row holds the hash, so a
     * database dump cannot be replayed against the API.
     *
     * Nullable only because the sessions written before this column existed have
     * no value to backfill — those rows are unreachable credentials (their
     * cookies are the retired `revaro_session` format) and expire on their own.
     * Every session this code creates sets it.
     */
    refreshTokenHash: varchar("refresh_token_hash", { length: 64 }),
    /** Hash of the token used before the most recent rotation — see `rotatedAt`. */
    previousRefreshTokenHash: varchar("previous_refresh_token_hash", { length: 64 }),
    /** When the current token was issued; starts the reuse-detection grace window. */
    rotatedAt: timestamp("rotated_at"),
    expiresAt: timestamp("expires_at").notNull(),
    /** Set when the session is revoked outright — a logout writes `sessions.id`, reuse detection writes this. */
    revokedAt: timestamp("revoked_at"),
    /** Which account revoked it — a support agent closing a session is not the same event as the user logging out. */
    revokedBy: int("revoked_by").references(() => users.id, { onDelete: "set null" }),
    /**
     * `last_used_at` records when the *credential* was last used (rotation, refresh).
     * This records when any authenticated request last touched the session, which
     * is what a "your devices" list shows. A session can be seen without being
     * rotated, so the two drift apart by design rather than by accident.
     */
    lastSeenAt: timestamp("last_seen_at"),
    /** Free-form label from the client ("Chrome on Windows"), shown in the device list. */
    deviceLabel: varchar("device_label", { length: 120 }),
    /**
     * IPv4 or IPv6 — 45 characters is the longest textual form either can take,
     * so an IPv6 address is never silently truncated.
     */
    ip: varchar("ip", { length: 45 }),
    userAgent: varchar("user_agent", { length: 400 }),
    /**
     * When this session's last successful MFA challenge happened. Set once, kept
     * forever: "this session was verified" is a property of the session, not of
     * the moment you ask. `user_mfa` holds whether MFA is *enrolled* — this holds
     * whether *this* login cleared it.
     */
    mfaVerifiedAt: timestamp("mfa_verified_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at").notNull().defaultNow(),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    // Both hashes are looked up by equality on every refresh. The current one is
    // unique: two rows claiming the same live credential would make the lookup
    // ambiguous exactly when it matters. MySQL unique indexes permit multiple
    // NULLs, which is what keeps this legal while legacy rows exist.
    uniqueIndex("sessions_refresh_token_hash_idx").on(table.refreshTokenHash),
    index("sessions_previous_refresh_token_hash_idx").on(table.previousRefreshTokenHash),
  ],
);

/* -------------------------------- addresses -------------------------------- */

export const addresses = mysqlTable(
  "addresses",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    addressLine1: varchar("address_line1", { length: 200 }).notNull(),
    addressLine2: varchar("address_line2", { length: 200 }),
    city: varchar("city", { length: 80 }).notNull(),
    state: varchar("state", { length: 80 }).notNull(),
    postalCode: varchar("postal_code", { length: 20 }).notNull(),
    country: varchar("country", { length: 80 }).notNull().default("India"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [index("addresses_user_id_idx").on(table.userId)],
);

/* -------------------------------- categories ------------------------------- */

/**
 * Categories form a two-level (parent → child) taxonomy: `parentId` is NULL for a
 * top-level category and points at another category for a subcategory. `icon` is a
 * stable identifier the client maps through a whitelist (never a component name from
 * the database), and `isActive` lets a category be retired without deleting the
 * products that reference it.
 */
export const categories = mysqlTable(
  "categories",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 60 }).notNull(),
    slug: varchar("slug", { length: 60 }).notNull(),
    description: varchar("description", { length: 200 }),
    imageUrl: varchar("image_url", { length: 500 }),
    icon: varchar("icon", { length: 40 }),
    parentId: int("parent_id").references((): AnyMySqlColumn => categories.id, {
      onDelete: "set null",
    }),
    sortOrder: int("sort_order").notNull().default(0),
    isFeatured: boolean("is_featured").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex("categories_slug_unique").on(table.slug),
    index("categories_parent_id_idx").on(table.parentId),
  ],
);

/* --------------------------------- products -------------------------------- */

export const products = mysqlTable(
  "products",
  {
    id: int("id").autoincrement().primaryKey(),
    sellerId: int("seller_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 140 }).notNull(),
    description: text().notNull(),
    categoryId: int("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    brand: varchar("brand", { length: 80 }),
    condition: varchar("condition", { length: 12 }).notNull().default("GOOD"),
    /**
     * Seller-entered specification rows, as a JSON array of `{ label, value }`.
     *
     * A `text` column of JSON rather than a child table: these are display-only
     * attributes that are always read as a set with the product and never
     * queried, filtered or joined on. A `product_specifications` table would add
     * a join to every product read to buy nothing.
     *
     * The shape is validated on write (`specificationSchema` in
     * `server/routes/seller-listings.ts`) and again on read, because a
     * malformed value must degrade to "no extra specifications" rather than
     * throw while rendering a product page.
     */
    specifications: text("specifications"),
    listingType: varchar("listing_type", { length: 8 }).notNull().default("SALE"),
    /**
     * DRAFT | PUBLISHED | OUT_OF_STOCK | PAUSED | ARCHIVED — see
     * `server/lib/product-status.ts` for the vocabulary and the visibility rules.
     *
     * Defaults to `DRAFT` on purpose: a row inserted without an explicit status
     * is invisible until someone publishes it, so no future code path can leak a
     * half-finished listing into Browse by forgetting a field.
     */
    status: varchar("status", { length: 16 }).notNull().default("DRAFT"),
    location: varchar("location", { length: 120 }).notNull(),
    latitude: double("latitude"),
    longitude: double("longitude"),
    purchasePrice: int("purchase_price"),
    rentalPricePerDay: int("rental_price_per_day"),
    rentalPricePerWeek: int("rental_price_per_week"),
    rentalPricePerMonth: int("rental_price_per_month"),
    securityDeposit: int("security_deposit"),
    minimumRentalDays: int("minimum_rental_days"),
    maximumRentalDays: int("maximum_rental_days"),
    rentToOwnEnabled: boolean("rent_to_own_enabled").notNull().default(false),
    rentToOwnPrice: int("rent_to_own_price"),
    rentCreditPercentage: int("rent_credit_percentage"),
    rentCreditCap: int("rent_credit_cap"),
    quantity: int("quantity").notNull().default(1),
    availableQuantity: int("available_quantity").notNull().default(1),
    viewCount: int("view_count").notNull().default(0),
    favoriteCount: int("favorite_count").notNull().default(0),
    ratingAverage: double("rating_average").notNull().default(0),
    ratingCount: int("rating_count").notNull().default(0),
    /**
     * Title plus description, lowercased, written by whichever path changes
     * either — in the same transaction as the change, never afterwards.
     *
     * `title` and `description` are read to build it so that search can be a
     * single indexed read instead of a join and a concat at query time. Empty on
     * rows written before this column existed until the migration backfills it,
     * and readers coalesce to `title` rather than trusting it to be filled.
     *
     * The FULLTEXT index that reads it lives in a custom migration — drizzle-kit
     * cannot express FULLTEXT, and one written into a generated file would be
     * dropped by the next `db:generate`.
     */
    searchText: text("search_text"),
    allowsDelivery: boolean("allows_delivery").notNull().default(true),
    allowsPickup: boolean("allows_pickup").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex("products_slug_unique").on(table.slug),
    index("products_seller_id_idx").on(table.sellerId),
    index("products_category_id_idx").on(table.categoryId),
    index("products_status_idx").on(table.status),
    index("products_listing_type_idx").on(table.listingType),
    index("products_created_at_idx").on(table.createdAt),
    // Browse: "published products in this category, newest first" is the query the
    // marketplace list runs on every page load. Leading with `status` keeps hidden
    // rows out of the index scan first, then narrows by category, then sorts by recency.
    index("products_status_category_created_idx").on(table.status, table.categoryId, table.createdAt),
    // The seller dashboard always reads one seller's listings and filters by state
    // ("my published listings"), so the pair is read together far more often than
    // either column alone.
    index("products_seller_status_idx").on(table.sellerId, table.status),
    // Prefix fallback for search: `WHERE title LIKE 'chair%'` cannot use a FULLTEXT
    // index, but it can use this. The exact-word path uses the FULLTEXT index from
    // the custom migration; a term typed so far that nothing matches in full goes
    // here instead, and a misspelling degrades to zero rows rather than a table scan.
    index("products_title_idx").on(table.title),
    // Money is integer paise: a negative price is a data bug, not a discount.
    check("products_purchase_price_nonneg", sql`${table.purchasePrice} >= 0`),
    check("products_rental_price_day_nonneg", sql`${table.rentalPricePerDay} >= 0`),
    check("products_rental_price_week_nonneg", sql`${table.rentalPricePerWeek} >= 0`),
    check("products_rental_price_month_nonneg", sql`${table.rentalPricePerMonth} >= 0`),
    check("products_deposit_nonneg", sql`${table.securityDeposit} >= 0`),
    check("products_rent_to_own_price_nonneg", sql`${table.rentToOwnPrice} >= 0`),
    check("products_rent_credit_pct_range", sql`${table.rentCreditPercentage} BETWEEN 0 AND 100`),
    check("products_quantity_positive", sql`${table.quantity} > 0`),
    check("products_available_quantity_nonneg", sql`${table.availableQuantity} >= 0`),
    check("products_aggregates_nonneg", sql`${table.ratingAverage} >= 0`),
    check("products_aggregate_counts_nonneg", sql`${table.ratingCount} >= 0`),
    check("products_favorite_count_nonneg", sql`${table.favoriteCount} >= 0`),
    check("products_view_count_nonneg", sql`${table.viewCount} >= 0`),
    check("products_min_rental_days_positive", sql`${table.minimumRentalDays} IS NULL OR ${table.minimumRentalDays} > 0`),
    check(
      "products_rental_window_ordered",
      sql`${table.maximumRentalDays} IS NULL OR ${table.minimumRentalDays} IS NULL OR ${table.maximumRentalDays} >= ${table.minimumRentalDays}`,
    ),
  ],
);

export const productImages = mysqlTable(
  "product_images",
  {
    id: int("id").autoincrement().primaryKey(),
    productId: int("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    url: varchar("url", { length: 500 }).notNull(),
    sortOrder: int("sort_order").notNull().default(0),
    altText: varchar("alt_text", { length: 200 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    // Reordering and alt-text edits are the only mutations this table has, and both
    // are real updates — without this column there is no way to tell them apart from
    // an image that was never touched.
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [index("product_images_product_id_idx").on(table.productId)],
);

export const productTags = mysqlTable(
  "product_tags",
  {
    productId: int("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    tag: varchar("tag", { length: 40 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.productId, table.tag] }),
    index("product_tags_tag_idx").on(table.tag),
  ],
);

/* -------------------------------- favorites -------------------------------- */

export const favorites = mysqlTable(
  "favorites",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: int("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("favorites_user_product_unique").on(table.userId, table.productId),
    index("favorites_product_id_idx").on(table.productId),
  ],
);

/* ----------------------------------- cart ---------------------------------- */

export const carts = mysqlTable(
  "carts",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [uniqueIndex("carts_user_id_unique").on(table.userId)],
);

export const cartItems = mysqlTable(
  "cart_items",
  {
    id: int("id").autoincrement().primaryKey(),
    cartId: int("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    productId: int("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    mode: varchar("mode", { length: 6 }).notNull().default("BUY"),
    quantity: int("quantity").notNull().default(1),
    startDate: timestamp("start_date", { mode: "date" }),
    endDate: timestamp("end_date", { mode: "date" }),
    savedForLater: boolean("saved_for_later").notNull().default(false),
    /**
     * The unit price when this line was added, in paise. Not a source of truth —
     * totals are always recomputed from `products` — but it is what lets the cart
     * tell the user "the price changed from X to Y" instead of silently charging
     * a different amount than the one they agreed to.
     */
    unitPriceSnapshot: int("unit_price_snapshot"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    index("cart_items_cart_id_idx").on(table.cartId),
    index("cart_items_product_id_idx").on(table.productId),
    // There is deliberately NO unique index over (cartId, productId, mode,
    // startDate, endDate): MySQL treats NULL as distinct from NULL, so the
    // BUY lines (which have no dates) would never be deduplicated by it and the
    // guarantee would silently hold for rentals only. Merging is done in one
    // place instead — `mergeCartItem` in `server/lib/cart.ts` — inside a
    // transaction that locks the cart row, which is the only approach that is
    // actually correct for both modes *and* under concurrent adds.
    // NOTE: the brief's `unique (cart_id, product_id, mode)` would be WRONG here —
    // two rental lines of the same product with *different* windows are distinct,
    // legitimate lines, and the third column says nothing about the window.
    check("cart_items_quantity_positive", sql`${table.quantity} > 0`),
    check("cart_items_unit_price_nonneg", sql`${table.unitPriceSnapshot} >= 0`),
  ],
);

/* ---------------------------------- orders --------------------------------- */

export const orders = mysqlTable(
  "orders",
  {
    id: int("id").autoincrement().primaryKey(),
    /**
     * The customer-facing identifier, e.g. `RV-2026-8F3K2A`.
     *
     * Separate from `id` on purpose: `id` is a sequential auto-increment, so
     * displaying it leaks order volume and ordering to every customer. This is
     * the value shown in the UI, quoted in support, and safe to publish.
     * Populated at creation, unique, and never rewritten.
     */
    orderNumber: varchar("order_number", { length: 20 }),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    orderType: varchar("order_type", { length: 8 }).notNull().default("PURCHASE"),
    /**
     * Fulfillment lifecycle. Distinct from `paymentStatus`: money can be
     * `PAID` while the order is still `PENDING_PAYMENT` or `PROCESSING`, and
     * conflating the two is how "paid but not confirmed" bugs get shipped.
     */
    status: varchar("status", { length: 20 }).notNull().default("PENDING_PAYMENT"),
    /**
     * Money lifecycle: PENDING | PROCESSING | PAID | FAILED | REFUNDED |
     * PARTIALLY_REFUNDED. An order only ever reaches a confirmed state once
     * this is `PAID`, which itself only happens after server-side
     * verification of a provider transaction.
     */
    paymentStatus: varchar("payment_status", { length: 20 }).notNull().default("PENDING"),
    subtotal: int("subtotal").notNull(),
    deliveryFee: int("delivery_fee").notNull().default(0),
    /**
     * Refundable security deposits, held in one column so it can never be
     * confused with money owed to a seller. It is part of `total` because the
     * customer does pay it today, but it is not revenue and is refunded on
     * return.
     */
    depositTotal: int("deposit_total").notNull().default(0),
    discount: int("discount").notNull().default(0),
    tax: int("tax").notNull().default(0),
    total: int("total").notNull(),
    /** ISO 4217. Numeric amounts are paise; never a formatted string. */
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),
    deliveryMethod: varchar("delivery_method", { length: 10 }).notNull().default("DELIVERY"),
    deliveryAddressId: int("delivery_address_id").references(() => addresses.id, {
      onDelete: "set null",
    }),
    /** Full address as it was at purchase time, so later edits cannot rewrite history. */
    deliveryAddressSnapshot: text("delivery_address_snapshot"),
    trackingNumber: varchar("tracking_number", { length: 60 }),
    paymentProvider: varchar("payment_provider", { length: 20 }).notNull().default("mock"),
    paymentReference: varchar("payment_reference", { length: 100 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    index("orders_user_id_idx").on(table.userId),
    index("orders_status_idx").on(table.status),
    // The admin orders list pages default to newest-first (`desc(orders.createdAt)`
    // in `buildOrderListSort`), so the sort column is indexed.
    index("orders_created_at_idx").on(table.createdAt),
    uniqueIndex("orders_order_number_unique").on(table.orderNumber),
    // "My Orders" is always one user's orders, newest first — one composite read
    // instead of filtering by user and then sorting the whole user's history.
    index("orders_user_created_idx").on(table.userId, table.createdAt),
    // Operational queues read a status and then walk it newest-first (admin order
    // list, payment retries, refund review).
    index("orders_status_created_idx").on(table.status, table.createdAt),
    // Integer paise, never negative. The arithmetic identity between the parts and
    // `total` is deliberately NOT a CHECK: promotions, rounding and fee rules make
    // it a server-side concern (`server/lib/pricing.ts`), not a storage invariant.
    check("orders_subtotal_nonneg", sql`${table.subtotal} >= 0`),
    check("orders_delivery_fee_nonneg", sql`${table.deliveryFee} >= 0`),
    check("orders_deposit_total_nonneg", sql`${table.depositTotal} >= 0`),
    check("orders_discount_nonneg", sql`${table.discount} >= 0`),
    check("orders_tax_nonneg", sql`${table.tax} >= 0`),
    check("orders_total_nonneg", sql`${table.total} >= 0`),
  ],
);

export const orderItems = mysqlTable(
  "order_items",
  {
    id: int("id").autoincrement().primaryKey(),
    orderId: int("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: int("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    sellerId: int("seller_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    mode: varchar("mode", { length: 6 }).notNull(),
    /**
     * Fulfillment for **this line**, owned by this line's seller.
     *
     * `orders.status` is order-wide, and one order can contain lines from
     * several sellers — so a single order status cannot express "Seller A has
     * shipped, Seller B has not". Letting one seller write the order's status
     * would make them speak for every other seller in it, and would rewrite
     * what the customer sees for goods nobody has touched.
     *
     * Nullable, and null is meaningful: "this seller has not acted yet", which
     * the seller view reads as the order's own status. Values come from the
     * existing order vocabulary (`server/lib/order-fulfillment.ts`) rather than a
     * second set of names. The customer-facing `orders.status` is untouched by
     * seller actions.
     */
    fulfillmentStatus: varchar("fulfillment_status", { length: 20 }),
    /**
     * Why this seller cancelled this line, as they typed it.
     *
     * Stored per line rather than per order for the same reason fulfillment is:
     * a seller cancels *their* part of an order, and the customer's order as a
     * whole may still be proceeding for another seller. A single reason column on
     * `orders` would attribute one seller's explanation to everyone's lines.
     *
     * Informational only — no refund logic reads it, because money handling
     * belongs to the payment architecture, not here.
     */
    cancellationReason: varchar("cancellation_reason", { length: 300 }),
    quantity: int("quantity").notNull().default(1),
    /**
     * For a purchase: the sale price per unit. For a rental: the effective
     * daily rate actually applied (week/month tiers already folded in).
     */
    unitPrice: int("unit_price").notNull(),
    /**
     * The rental portion only, and always 0 for a purchase. Kept separate from
     * the deposit so a rental can be settled without the deposit being mistaken
     * for earnings.
     */
    rentalCharge: int("rental_charge").notNull().default(0),
    /**
     * The refundable deposit for this line, snapshotted. It is included in
     * `lineTotal` (the customer really does pay it today) but it is not money
     * owed to the seller and must never be treated as revenue.
     */
    securityDeposit: int("security_deposit").notNull().default(0),
    /** `rentalCharge + unitPrice×quantity` for a purchase. Includes deposit. */
    lineTotal: int("line_total").notNull(),
    /**
     * Denormalised snapshot of the product as it was at purchase time. The
     * `products` row is FK-restrict and may be edited or archived later; an
     * order receipt must keep showing what was actually bought.
     */
    titleSnapshot: varchar("title_snapshot", { length: 120 }).notNull(),
    /**
     * The product's URL slug as it was at purchase time. Without it a receipt
     * cannot link back to the listing, and with a *live* slug the link rewrites
     * itself the next time the product is renamed — so it is snapshotted with the
     * title like everything else on this line.
     *
     * Nullable because the rows that predate this column have no value to give
     * them; the custom migration backfills every one of them from
     * `products.slug`, and only new rows are expected to set it.
     */
    slugSnapshot: varchar("slug_snapshot", { length: 140 }),
    imageSnapshot: varchar("image_snapshot", { length: 500 }),
    startDate: timestamp("start_date", { mode: "date" }),
    endDate: timestamp("end_date", { mode: "date" }),
    rentalDays: int("rental_days"),
    rentCreditApplied: int("rent_credit_applied").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    /**
     * Line state changes without any product or order rewrite: fulfillment moves,
     * cancellations, returns. Without this column the receipt had no honest answer
     * to "when did this line change?" — `orders.updated_at` only knows the whole
     * order moved, and this line may well have been untouched.
     */
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    index("order_items_order_id_idx").on(table.orderId),
    index("order_items_product_id_idx").on(table.productId),
    index("order_items_seller_id_idx").on(table.sellerId),
    // The seller order list is always one seller's lines, grouped by order — reading
    // them through the pair beats fetching by seller and re-sorting by order in memory.
    index("order_items_seller_order_idx").on(table.sellerId, table.orderId),
    // Integer paise and a positive quantity. Date ordering is intentionally absent:
    // three live rows violate `end_date > start_date`, so that CHECK would refuse
    // to be applied — see Follow-up F2 in docs/database.md.
    check("order_items_unit_price_nonneg", sql`${table.unitPrice} >= 0`),
    check("order_items_rental_charge_nonneg", sql`${table.rentalCharge} >= 0`),
    check("order_items_deposit_nonneg", sql`${table.securityDeposit} >= 0`),
    check("order_items_line_total_nonneg", sql`${table.lineTotal} >= 0`),
    check("order_items_quantity_positive", sql`${table.quantity} > 0`),
    check("order_items_rent_credit_nonneg", sql`${table.rentCreditApplied} >= 0`),
  ],
);

/* ---------------------------------- rentals -------------------------------- */

export const rentals = mysqlTable(
  "rentals",
  {
    id: int("id").autoincrement().primaryKey(),
    orderId: int("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    orderItemId: int("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    productId: int("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    renterId: int("renter_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ownerId: int("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    startDate: timestamp("start_date", { mode: "date" }).notNull(),
    endDate: timestamp("end_date", { mode: "date" }).notNull(),
    actualReturnDate: timestamp("actual_return_date", { mode: "date" }),
    dailyRate: int("daily_rate").notNull(),
    rentalSubtotal: int("rental_subtotal").notNull(),
    securityDeposit: int("security_deposit").notNull().default(0),
    deliveryFee: int("delivery_fee").notNull().default(0),
    total: int("total").notNull(),
    rentCreditApplied: int("rent_credit_applied").notNull().default(0),
    /**
     * Lifecycle state. CONFIRMED | ACTIVE | RETURN_PENDING | OVERDUE | RETURNED
     * | COMPLETED | CANCELLED | DISPUTED.
     *
     * `UPCOMING` is deliberately *not* a stored value: a confirmed booking whose
     * window has not started yet is just `CONFIRMED` with a future `startDate`,
     * and storing a second label for the same fact would let the two disagree.
     * The list derives its tabs from real dates instead.
     */
    status: varchar("status", { length: 14 }).notNull().default("CONFIRMED"),
    /**
     * When the renter asked to return the item, i.e. when `RETURN_PENDING` was
     * entered. Kept so the timeline can show a real timestamp for the step
     * rather than inventing one.
     */
    returnRequestedAt: timestamp("return_requested_at"),
    /** When the return was confirmed and the rental closed out. */
    completedAt: timestamp("completed_at"),
    /**
     * Extension request bookkeeping. No approval or settlement flow exists yet
     * (there is nowhere to charge the extra days), so a request is *recorded*
     * with its server-computed quote and the rental's end date is left alone —
     * extending without a payment would hand out free rental time.
     */
    extensionRequestedAt: timestamp("extension_requested_at"),
    extensionRequestedDays: int("extension_requested_days"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    index("rentals_product_id_idx").on(table.productId),
    index("rentals_start_date_idx").on(table.startDate),
    index("rentals_end_date_idx").on(table.endDate),
    index("rentals_renter_id_idx").on(table.renterId),
    index("rentals_owner_id_idx").on(table.ownerId),
    index("rentals_status_idx").on(table.status),
    // Availability: "is this product free between A and B" scans one product's rows
    // ordered by window — the overlap probe walks (product, start) and stops on the
    // first row that starts after the requested end, so leading with the product and
    // the start date is what makes the scan cheap.
    index("rentals_product_start_end_idx").on(table.productId, table.startDate, table.endDate),
    // The overdue sweep reads rentals whose end has passed; status first keeps it out
    // of cancelled/returned rows entirely.
    index("rentals_status_end_idx").on(table.status, table.endDate),
    // Two audience queues: the renter's own rentals by state, and the owner's.
    index("rentals_renter_status_idx").on(table.renterId, table.status),
    index("rentals_owner_status_idx").on(table.ownerId, table.status),
    check("rentals_daily_rate_nonneg", sql`${table.dailyRate} >= 0`),
    check("rentals_subtotal_nonneg", sql`${table.rentalSubtotal} >= 0`),
    check("rentals_deposit_nonneg", sql`${table.securityDeposit} >= 0`),
    check("rentals_delivery_fee_nonneg", sql`${table.deliveryFee} >= 0`),
    check("rentals_total_nonneg", sql`${table.total} >= 0`),
    check("rentals_rent_credit_nonneg", sql`${table.rentCreditApplied} >= 0`),
    check(
      "rentals_extension_days_positive",
      sql`${table.extensionRequestedDays} IS NULL OR ${table.extensionRequestedDays} > 0`,
    ),
    // `end_date > start_date` is intentionally NOT here: `rentals.id = 129` stores a
    // return time twelve minutes *before* its start (bad seed data), so the CHECK
    // would fail to apply. See Follow-up F2 in docs/database.md.
  ],
);

/* -------------------------------- rental events ------------------------------ */

/**
 * Every step a rental has actually been through, with the time it happened.
 *
 * This exists because a rental's *current* status is not a history: the schema
 * records where a rental is now, never when it was booked, when it started, or
 * when the return was asked for. The lifecycle columns on `rentals` capture the
 * few steps that need to be queried; this table captures the sequence, and is
 * what the timeline renders.
 *
 * The unique index on `(rental_id, type)` is the idempotency guarantee: every
 * event type in the lifecycle can happen at most once per rental, so a retried
 * request or a second reconciliation cannot append a duplicate. Code can insert
 * an event without checking first, and the database is the arbiter.
 */
export const rentalEvents = mysqlTable(
  "rental_events",
  {
    id: int("id").autoincrement().primaryKey(),
    rentalId: int("rental_id")
      .notNull()
      .references(() => rentals.id, { onDelete: "cascade" }),
    /**
     * CONFIRMED | STARTED | RETURN_REQUESTED | RETURNED | COMPLETED | CANCELLED
     * | DELIVERY_COMPLETED.
     *
     * `DELIVERY_COMPLETED` is defined but nothing writes it yet — no system in
     * this app knows when a courier handed an item over. It is left absent from
     * the timeline rather than guessed at, and a future logistics integration
     * has a home to write it.
     */
    type: varchar("type", { length: 24 }).notNull(),
    /** Safe provider/context detail only. Never card, address or credential data. */
    metadata: text("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("rental_events_rental_id_idx").on(table.rentalId),
    uniqueIndex("rental_events_rental_type_unique").on(table.rentalId, table.type),
  ],
);

/* ---------------------------------- reviews -------------------------------- */

export const reviews = mysqlTable(
  "reviews",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: int("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sellerId: int("seller_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orderId: int("order_id").references(() => orders.id, { onDelete: "set null" }),
    /**
     * The order line this review is about — the row that *proves* the review is
     * earned rather than invented.
     *
     * A unique index on this column is what enforces "one review per order item"
     * in the database, so a double-submitted form or two tabs racing each other
     * cannot produce a second review for the same thing. Nullable with
     * `set null`: a removed order line must not silently delete the customer's
     * words, so the review survives as an unattributed row rather than vanishing.
     * Legacy reviews written before this column existed have no line and are
     * therefore *not* editable — there is no longer any proof they were earned.
     */
    orderItemId: int("order_item_id").references(() => orderItems.id, { onDelete: "set null" }),
    rentalId: int("rental_id").references(() => rentals.id, { onDelete: "set null" }),
    /** PURCHASE | RENTAL — see `REVIEW_PURCHASE_TYPES` in `server/lib/review-queries.ts`. */
    purchaseType: varchar("purchase_type", { length: 8 }).notNull().default("PURCHASE"),
    rating: int("rating").notNull(),
    title: varchar("title", { length: 120 }),
    comment: text().notNull(),
    /**
     * Whether the backend proved an order (purchase) or a returned rental backs
     * this review. Written **only** by the server after it has resolved the order
     * line itself; a client that sends the field is ignored by the strict schema.
     */
    isVerifiedPurchase: boolean("is_verified_purchase").notNull().default(false),
    /**
     * Moderation state. PUBLISHED | HIDDEN | PENDING — see `REVIEW_STATUSES` in
     * `server/lib/review-queries.ts`. Defaults to PUBLISHED so a review that
     * passed the eligibility check is visible without a second moderation step,
     * and only `HIDDEN` keeps it out of public queries.
     */
    status: varchar("status", { length: 10 }).notNull().default("PUBLISHED"),
    /** Set when the author edits; the UI shows "Edited" rather than hiding it. */
    isEdited: boolean("is_edited").notNull().default(false),
    /**
     * Denormalised helpful tally.
     *
     * Kept as a counter *and* backed by `review_helpful_votes`: the counter is
     * what the list sorts and renders on, and maintaining it on write means a
     * thousand-row list never needs a correlated COUNT per row. The vote table is
     * the authority — it is what stops one person inflating the number, and what
     * lets "helpful" be undone.
     */
    helpfulCount: int("helpful_count").notNull().default(0),
    /** Reviewer-supplied photos, as a JSON array of storage URLs. */
    images: text("images"),
    /** The seller's one public reply. Never edits the customer's words. */
    sellerReply: text("seller_reply"),
    sellerRepliedAt: timestamp("seller_replied_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    index("reviews_product_id_idx").on(table.productId),
    index("reviews_seller_id_idx").on(table.sellerId),
    // "My reviews", and the reviewability lookups behind the review button.
    index("reviews_user_id_idx").on(table.userId),
    // The product page's default sort: published reviews for a listing, newest
    // first. A leading status column is what keeps a hidden review from needing
    // a filter on every read of the page.
    index("reviews_product_status_created_idx").on(table.productId, table.status, table.createdAt),
    index("reviews_order_item_id_idx").on(table.orderItemId),
    uniqueIndex("reviews_order_item_unique").on(table.orderItemId),
    uniqueIndex("reviews_user_order_product_unique").on(
      table.userId,
      table.orderId,
      table.productId,
    ),
    // A rating outside 1..5 would silently distort `products.rating_average`.
    // (`unique (user_id, order_item_id)` in the brief is already stronger here:
    // `unique (order_item_id)` allows only one review per purchased line at all.)
    check("reviews_rating_in_range", sql`${table.rating} BETWEEN 1 AND 5`),
    check("reviews_helpful_count_nonneg", sql`${table.helpfulCount} >= 0`),
  ],
);

/**
 * Who marked which review helpful.
 *
 * The unique (review, user) pair *is* the anti-inflation rule: marking the same
 * review helpful twice is a constraint violation, not a second vote. Cascades
 * with the review and the voter, so neither can leave an orphan behind.
 */
export const reviewHelpfulVotes = mysqlTable(
  "review_helpful_votes",
  {
    reviewId: int("review_id")
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.reviewId, table.userId] }),
    // "Has this viewer already voted on this page's reviews?" is the read the
    // product page makes for every row it renders.
    index("review_helpful_votes_user_id_idx").on(table.userId),
  ],
);

/* --------------------------------- messages -------------------------------- */

/**
 * One business conversation between a customer and a seller.
 *
 * ## Why it is anchored to something, not a pair of user ids
 *
 * There is no `customer_id`/`seller_id` pair here. Participants live in
 * `conversation_participants`, so this table can never disagree with itself about
 * who is in the room, and "who is the other person" is a join rather than a column
 * that can be half-filled.
 *
 * What it *is* anchored to is the business context: a listing, and optionally the
 * order or rental the exchange is about. That is the whole reason Revaro allows
 * customer↔seller messaging at all — a conversation is a question about a
 * specific product, order or rental, never an open line to a stranger. Both links
 * are nullable with `set null`, because an archived listing or a deleted order
 * must not delete a transcript that may be the only record of what was agreed.
 */
export const conversations = mysqlTable(
  "conversations",
  {
    id: int("id").autoincrement().primaryKey(),
    /** The listing this thread is about. The usual anchor. */
    productId: int("product_id").references(() => products.id, { onDelete: "set null" }),
    /**
     * Set when the thread continued past the purchase — "does it fit my model?",
     * "when will it ship?" — so the conversation pane can show the receipt the
     * exchange belongs to instead of only the product photo.
     */
    orderId: int("order_id").references(() => orders.id, { onDelete: "set null" }),
    /** The rental equivalent of `orderId`, for a thread about a live rental. */
    rentalId: int("rental_id").references(() => rentals.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastMessageAt: timestamp("last_message_at").notNull().defaultNow(),
  },
  (table) => [
    // "My conversations, most recently active first" — the only read this table
    // ever serves, and it sorts on this column every time.
    index("conversations_last_message_at_idx").on(table.lastMessageAt),
  ],
);

export const conversationParticipants = mysqlTable(
  "conversation_participants",
  {
    conversationId: int("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at", { mode: "date" }),
    /**
     * When this person joined the conversation. The composite PK intentionally
     * carries no timestamp of its own, and without one there is no way to answer
     * "who was here first" on a thread that has since lost people.
     */
    createdAt: timestamp("created_at").notNull().defaultNow(),
    /**
     * `last_read_at` moves when someone reads a thread, and it is not the only
     * field that can — so this is a real update timestamp rather than a second
     * copy of it.
     */
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.userId] }),
    index("conversation_participants_user_id_idx").on(table.userId),
  ],
);

export const messages = mysqlTable(
  "messages",
  {
    id: int("id").autoincrement().primaryKey(),
    conversationId: int("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderId: int("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: varchar("body", { length: 2000 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    // The transcript, in order — the one read this table serves.
    index("messages_conversation_id_idx").on(table.conversationId),
    // The unread badge's correlated subquery, which filters on the *pair*
    // (`conversation_id` + `created_at`) rather than the conversation alone. Without
    // this the badge forces a scan of every message ever sent in the thread just to
    // discard the ones the reader has already seen.
    index("messages_conversation_created_idx").on(table.conversationId, table.createdAt),
  ],
);

/* ------------------------------ notifications ------------------------------ */

/**
 * One in-app notification for one user.
 *
 * ## The idempotency rule is the load-bearing part
 *
 * `eventKey` is a caller-supplied, deterministic key for *the thing that happened*
 * — `"ORDER_SHIPPED:1048"`, `"RENTAL_RETURN_DUE:207:2026-10-05"`. It carries a
 * unique index, and that index is what makes a notification fire **once**.
 *
 * Without it, every notification site has to defend itself, and none of them
 * defend themselves completely: an order that moves `PROCESSING → SHIPPED` twice
 * (a retried seller request, a webhook redelivery, a double-clicked button) tells
 * the customer it shipped twice; a rental reminder that runs on two overlapping
 * reads sends two emails. Checking "have I already notified about this?" before
 * inserting is a race — two concurrent requests both read "no" and both write.
 * A unique index removes the race entirely: the loser gets a duplicate-key error
 * and is treated as "already sent", which is what it means.
 *
 * Nullable on purpose, and that is safe in MySQL specifically: `NULL` never
 * collides in a unique index, so genuinely user-authored rows (which have no
 * originating event) coexist freely while every event-driven row is constrained
 * to exactly one per key. The same reasoning is documented on
 * `transactions.idempotencyKey`.
 */
export const notifications = mysqlTable(
  "notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * A token from `NOTIFICATION_TYPES` (`server/lib/notification-events.ts`), which
     * owns the vocabulary and the category each type belongs to. The column stays a
     * plain `varchar` rather than a MySQL `ENUM`, because the existing rows carry
     * types written before that module existed and a migration that rewrites them
     * would be more dangerous than tolerating them.
     */
    type: varchar("type", { length: 40 }).notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    body: varchar("body", { length: 300 }),
    /**
     * Where the bell's dropdown navigates to.
     *
     * This is a *resolved destination*, not a raw entity id: it is what
     * `notificationDestination()` produced at write time, so the client can push a
     * `navigate({ to: link })` without knowing a single route. `relatedEntity*` below
     * is what that destination was derived from, and is kept alongside it so the
     * feed can group by kind and render a type-specific icon even if a link is absent.
     */
    link: varchar("link", { length: 200 }),
    /**
     * What the notification is *about*, denormalised rather than a polymorphic FK.
     *
     * `ORDER | RENTAL | PRODUCT | LISTING | CONVERSATION | PAYMENT | ACCOUNT`.
     * There is no foreign key, and deliberately so: one column pair has to span five
     * different tables, and a "polymorphic reference" enforced by nothing is a lie.
     * The rows are only ever written by `notify()`, which resolves the id from the
     * event that produced it — never by the client.
     */
    relatedEntityType: varchar("related_entity_type", { length: 16 }),
    relatedEntityId: int("related_entity_id"),
    /** Safe extra context as a JSON object. Never addresses, card data or secrets. */
    metadata: text("metadata"),
    /** The once-and-only-once key. `null` for rows not produced by an event. */
    eventKey: varchar("event_key", { length: 190 }),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    /**
     * Read state, preferences and metadata can all change after the row exists.
     * `read_at` is *when* it was read, not whether the row itself has been
     * touched since — so a "mark all read" sweep can be audited without
     * pretending the notification was never edited.
     */
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    // The feed itself: "this user's notifications, newest first".
    index("notifications_user_id_idx").on(table.userId),
    // The bell's badge. Counting *unread* rows is the single most frequent read in
    // the app (every header render on every page), and without the `read_at` column
    // in the index it degrades to "every notification this user has ever had".
    index("notifications_user_read_idx").on(table.userId, table.readAt),
    // "Mark all as read" and the unread tab filter.
    index("notifications_user_created_idx").on(table.userId, table.createdAt),
    // Resolving what a notification pointed at (the activity timeline deep-links, and
    // support needs to answer "what was this about?").
    index("notifications_entity_idx").on(table.relatedEntityType, table.relatedEntityId),
    uniqueIndex("notifications_event_key_unique").on(table.eventKey),
  ],
);

/**
 * Per-user notification preferences.
 *
 * One row per user, created on first read or write — so "no preferences" and
 * "opted out of everything" are different states, and only the second is ever the
 * result of an explicit choice. The absence of a row therefore means *everything
 * on*, which is both the useful default and the one that cannot silently silence a
 * user who never visited the settings page.
 *
 * The channel columns are booleans rather than a JSON blob because they are queried,
 * not iterated: the send path reads exactly two of them (`in_app` for whether to
 * insert the row, `email` for whether to hand off to the email provider), and a
 * JSON column would make that a parse on every notification in the app.
 *
 * The categories are exactly the ones Revaro can honour. There is deliberately no
 * `sms` or `push` column: a setting with no implementation behind it is worse than
 * no setting, because it teaches a user that a toggle works.
 */
export const notificationPreferences = mysqlTable("notification_preferences", {
  userId: int("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Orders and purchases. */
  ordersInApp: boolean("orders_in_app").notNull().default(true),
  ordersEmail: boolean("orders_email").notNull().default(true),
  /** Rentals, reminders and overdue notices. */
  rentalsInApp: boolean("rentals_in_app").notNull().default(true),
  rentalsEmail: boolean("rentals_email").notNull().default(true),
  /** Payments, refunds and failed attempts. */
  paymentsInApp: boolean("payments_in_app").notNull().default(true),
  paymentsEmail: boolean("payments_email").notNull().default(true),
  /** Seller-side events: new orders, listing decisions, customer messages. */
  sellerInApp: boolean("seller_in_app").notNull().default(true),
  sellerEmail: boolean("seller_email").notNull().default(false),
  /** Wishlist price and stock changes. In-app only — no email is generated for these. */
  wishlistInApp: boolean("wishlist_in_app").notNull().default(true),
  /** Admin queue events. In-app only, and only admins hold a row that turns this off. */
  adminInApp: boolean("admin_in_app").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

/* ---------------------------------- reports -------------------------------- */

export const reports = mysqlTable(
  "reports",
  {
    id: int("id").autoincrement().primaryKey(),
    reporterId: int("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: int("product_id").references(() => products.id, { onDelete: "cascade" }),
    reportedUserId: int("reported_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    reason: varchar("reason", { length: 32 }).notNull(),
    details: varchar("details", { length: 1000 }),
    // OPEN | IN_REVIEW | RESOLVED | DISMISSED — see docs/database.md.
    status: varchar("status", { length: 12 }).notNull().default("OPEN"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    // The moderation queue is a status walk in date order: open items first, then
    // the ones already in review, each newest-first.
    index("reports_status_created_idx").on(table.status, table.createdAt),
  ],
);

/* ------------------------------ seller profiles ----------------------------- */

export const sellerProfiles = mysqlTable("seller_profiles", {
  userId: int("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  bio: varchar("bio", { length: 500 }),
  /**
   * Where the seller is based. The display name, phone and avatar are
   * deliberately **not** duplicated here: they already live on `users`
   * (`name`, `phone`, `avatarUrl`), and a second copy is a second source of
   * truth that drifts the first time one of the two is updated.
   */
  location: varchar("location", { length: 120 }),
  responseRateHours: int("response_rate_hours"),
  verified: boolean("verified").notNull().default(false),
  /**
   * Seller totals — the three numbers a seller dashboard and a storefront badge
   * read on every load.
   *
   * Denormalised, and denormalised on purpose: computing them per page load means
   * scanning `order_items` for the seller's whole history to draw one number, and
   * `order_items` only ever grows. They are written inside the same transaction
   * that changes the underlying row — a total that updates on a later read is a
   * total that never agrees with itself while two people are looking at it.
   *
   * `totalEarningsPaise` is after commission and is what a payout is settled
   * against; `totalSalesPaise` is gross and is what a storefront shows. They are
   * separate numbers that will legitimately differ, so they are separate columns.
   */
  totalSalesPaise: int("total_sales_paise").notNull().default(0),
  totalEarningsPaise: int("total_earnings_paise").notNull().default(0),
  listingsCount: int("listings_count").notNull().default(0),
  ratingAverage: double("rating_average").notNull().default(0),
  ratingCount: int("rating_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

/* ------------------------------- transactions ------------------------------- */

export const transactions = mysqlTable(
  "transactions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    orderId: int("order_id").references(() => orders.id, { onDelete: "set null" }),
    type: varchar("type", { length: 20 }).notNull(),
    amount: int("amount").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),
    /**
     * PENDING | PROCESSING | SUCCEEDED | FAILED | CANCELLED | REFUNDED.
     *
     * A row is created the moment a payment intent exists, i.e. *before* any
     * money moves — that is what makes an abandoned checkout visible and
     * cancellable, and what stops the order being created from a client
     * assertion rather than a verified provider result.
     */
    status: varchar("status", { length: 12 }).notNull().default("PENDING"),
    provider: varchar("provider", { length: 20 }).notNull().default("mock"),
    providerTransactionId: varchar("provider_transaction_id", { length: 100 }),
    /**
     * The key the *provider* was asked to create this intent with. Unique, so a
     * retried create-intent hits the constraint and returns the existing
     * transaction instead of opening a second one. This is the first of the two
     * idempotency guards; `idempotencyKey` below is the second, covering order
     * creation itself.
     */
    providerIdempotencyKey: varchar("provider_idempotency_key", { length: 100 }),
    /**
     * Server-issued key for "one checkout attempt → one order". Unique. A
     * repeat order-creation request for the same key returns the order that
     * already exists rather than creating a second one, so a retried request
     * or a double-clicked Pay button can never produce two orders, two
     * transactions, or two charges.
     */
    idempotencyKey: varchar("idempotency_key", { length: 100 }),
    /** UPI | CARD | NET_BANKING | WALLET. Provider-supplied, never guessed. */
    paymentMethod: varchar("payment_method", { length: 16 }),
    /**
     * Provider event ids already applied, JSON array. Webhook delivery is
     * at-least-once, so the same event can arrive more than once; this makes
     * replay a no-op instead of a second order.
     */
    processedEventIds: text("processed_event_ids"),
    /** Safe provider context. Never card numbers, CVV, or provider secrets. */
    metadata: text("metadata"),
    /** Already-safe message to show the user when a payment fails. */
    failureReason: varchar("failure_reason", { length: 255 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    index("transactions_user_id_idx").on(table.userId),
    index("transactions_order_id_idx").on(table.orderId),
    index("transactions_status_idx").on(table.status),
    // Partial-uniqueness is not available in MySQL, so these are full unique
    // indexes over nullable columns. That is correct here because a NULL value
    // never collides in MySQL, so the many legacy/rows-without-a-key rows
    // coexist and only real keys are constrained.
    uniqueIndex("transactions_idempotency_key_unique").on(table.idempotencyKey),
    uniqueIndex("transactions_provider_idempotency_key_unique").on(table.providerIdempotencyKey),
    // The provider reference is the receipt's only tie to the outside world: two
    // rows claiming the same reference would make a refund ambiguous about what it
    // refunds. Nullable, so rows without one still coexist (verified: 0 duplicates).
    uniqueIndex("transactions_provider_reference_unique").on(table.providerTransactionId),
    // The admin money ledger renders newest-first (`listAdminTransactions` sorts
    // `desc(transactions.createdAt)`), so the sort column is indexed.
    index("transactions_created_at_idx").on(table.createdAt),
    // Refund/retry queues filter by state first and then walk newest-first.
    index("transactions_status_created_idx").on(table.status, table.createdAt),
    check("transactions_amount_nonneg", sql`${table.amount} >= 0`),
  ],
);

/* --------------------------------- audit log ------------------------------- */

/**
 * What an administrator did, and when.
 *
 * Admin surfaces change state that customers and sellers depend on: a listing can
 * vanish from Browse, a user can lose their account, money can be marked as paid
 * out. When one of those turns out to be wrong, "who did this, and when" must be
 * answerable from the database rather than from memory — which is what this table is
 * for (spec §58).
 *
 * ## Append-only
 *
 * No UI writes anything but an insert, and no admin endpoint can update or delete a
 * row. An audit trail that participants can edit is a story, not a record. (The
 * schema itself is the only thing that can remove rows — a migration, deliberately
 * not part of any feature.)
 *
 * ## What is deliberately absent
 *
 * Request bodies are never stored wholesale — they can carry passwords, tokens and
 * provider secrets, and an audit log is exactly the kind of long-lived table people
 * forget to re-check when a form gains a field. `details` is a short human sentence
 * written by the caller. No IP addresses either: the rate limiter already keys off
 * `x-forwarded-for`, which behind a local proxy is a shared bucket, and storing a
 * value that is wrong most of the time is worse than storing none.
 */
export const adminAuditLog = mysqlTable(
  "admin_audit_log",
  {
    id: int("id").autoincrement().primaryKey(),
    /** The administrator who performed the action. Never the acted-on user. */
    adminId: int("admin_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** A stable action name, e.g. PRODUCT_STATUS_SET, USER_SUSPENDED, PAYOUT_STATUS_SET. */
    action: varchar("action", { length: 40 }).notNull(),
    /** Coarse entity kind: product | user | order | rental | payout | review | report | category | image | setting. */
    entityType: varchar("entity_type", { length: 20 }).notNull(),
    /** The row the action was about. Kept even when the entity is later deleted. */
    entityId: int("entity_id"),
    /** One short, safe sentence. Never request bodies, credentials or stack traces. */
    details: varchar("details", { length: 300 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    // The two questions the table exists to answer: what did this admin do, and
    // what happened to this entity.
    index("admin_audit_log_admin_created_idx").on(table.adminId, table.createdAt),
    index("admin_audit_log_entity_idx").on(table.entityType, table.entityId),
  ],
);

/* --------------------------- seller payout methods ------------------------- */

/**
 * Where a seller wants their money sent.
 *
 * ## Only a masked label is ever stored
 *
 * There is no payout provider wired up in this app, so there is nothing to
 * tokenise an account with — and a table that quietly accumulated full account
 * numbers "until we add a provider" would be the worst possible place to start.
 * So the row holds the **holder's name** and a **masked** label
 * (`HDFC Bank •••• 4321`) that the seller types in themselves. No account number,
 * no IFSC, no UPI VPA, no card data: the fields a real integration would need are
 * exactly the fields that must never sit in this table.
 *
 * The masked label is snapshotted onto `payouts.methodLabel` when a payout is
 * requested, so deleting a method later cannot rewrite what a past payout said it
 * was sent to — the same reasoning as `orders.deliveryAddressSnapshot`.
 */
export const sellerPayoutMethods = mysqlTable(
  "seller_payout_methods",
  {
    id: int("id").autoincrement().primaryKey(),
    sellerId: int("seller_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** BANK | UPI — the two destinations the UI offers. */
    type: varchar("type", { length: 10 }).notNull().default("BANK"),
    accountHolder: varchar("account_holder", { length: 80 }).notNull(),
    /** Seller-supplied, already masked by them. Never validated as an account. */
    maskedLabel: varchar("masked_label", { length: 80 }).notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [index("seller_payout_methods_seller_id_idx").on(table.sellerId)],
);

/* --------------------------------- payouts -------------------------------- */

/**
 * A seller's request to be paid out.
 *
 * ## A request is not a transfer
 *
 * Nothing in this app moves real money, and nothing pretends to. `status` walks
 * PENDING → PROCESSING → COMPLETED only because an **admin** moved it there
 * (`server/routes/admin.ts`); until then the honest state is "requested", and the
 * seller UI says so in words rather than showing a green tick. A payout that has
 * not been confirmed by whatever eventually pays it must never read as paid.
 *
 * ## The reservation is the double-payout guard
 *
 * The moment a payout is requested its amount is *reserved* — it stops counting
 * towards the available balance. Reservation is not a counter that gets
 * incremented: it is a `SUM` over the rows of this table in `PENDING` or
 * `PROCESSING`, so it cannot drift from reality and cannot be edited by a
 * client. `requestPayout` additionally locks the seller's user row for the
 * duration, so two concurrent requests serialise instead of both reading the
 * same pre-reservation balance.
 *
 * ## `idempotency_key` is unique
 *
 * A retried request or a double-clicked button hits the constraint and returns
 * the payout that already exists instead of reserving the money twice. The same
 * two-guard pattern `transactions` uses for checkout.
 */
export const payouts = mysqlTable(
  "payouts",
  {
    id: int("id").autoincrement().primaryKey(),
    sellerId: int("seller_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Public reference, `PAY-2026-XXXXXX`. Shown to the seller and to support. */
    payoutNumber: varchar("payout_number", { length: 20 }).notNull(),
    /** Integer paise, always positive. The ledger carries the sign. */
    amount: int("amount").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),
    /**
     * PENDING | PROCESSING | COMPLETED | FAILED | CANCELLED.
     *
     * Deliberately **not** the same vocabulary as `wallet_transactions.status`:
     * this is the state of a *request*, which an admin drives, and its states are
     * about handling rather than about whether money is withdrawable. The ledger
     * entry mirrored from it (`lib/wallet.ts`) is where the balance effect lives.
     */
    status: varchar("status", { length: 12 }).notNull().default("PENDING"),
    methodId: int("method_id").references(() => sellerPayoutMethods.id, { onDelete: "set null" }),
    /** The masked label as it stood when this payout was requested. */
    methodLabel: varchar("method_label", { length: 120 }).notNull(),
    /** Optional seller-facing note ("for Diwali stock"). Never instructions to staff. */
    note: varchar("note", { length: 200 }),
    /** Already-safe, already-written explanation shown to the seller. */
    failureReason: varchar("failure_reason", { length: 255 }),
    /**
     * Server-issued key for "one payout attempt → one payout". Unique. See the
     * note above; a NULL never collides in MySQL, so rows without a key coexist.
     */
    idempotencyKey: varchar("idempotency_key", { length: 100 }),
    /** The admin who last acted on it. Null until somebody does. */
    reviewedBy: int("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at"),
    requestedAt: timestamp("requested_at").notNull().defaultNow(),
    processingAt: timestamp("processing_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex("payouts_payout_number_unique").on(table.payoutNumber),
    uniqueIndex("payouts_idempotency_key_unique").on(table.idempotencyKey),
    index("payouts_seller_id_idx").on(table.sellerId),
    index("payouts_status_idx").on(table.status),
    // The wallet's own list and its "what is reserved" aggregate are both
    // seller-scoped and status-scoped, in that order.
    index("payouts_seller_status_idx").on(table.sellerId, table.status),
    index("payouts_requested_at_idx").on(table.requestedAt),
  ],
);

/* -------------------------- seller wallet ledger --------------------------- */

/**
 * The seller financial ledger.
 *
 * ## Why this is separate from `transactions`
 *
 * `transactions` records what a **customer** paid: one row per provider payment
 * intent, keyed by `user_id` (the buyer). This records what a **seller** earned:
 * one row per event in the seller's money story, keyed by `seller_id`. They are
 * different questions with different lifecycles — a customer's `SUCCEEDED` says
 * nothing about whether the seller has been paid — and folding one into the
 * other is how a seller's balance ends up derived from somebody else's checkout.
 *
 * ## Signed integer paise, never a decimal
 *
 * `amount` is a signed count of paise: credits positive, debits negative. The
 * whole app already stores money this way (`orders.subtotal`, `order_items.
 * line_total`), and it is the reason no financial figure in Revaro is ever
 * subject to binary floating-point error. Balances are therefore plain
 * `SUM(amount)` calls in SQL rather than arithmetic performed anywhere.
 *
 * ## Nothing is ever overwritten
 *
 * A refund is a new `REFUND` row; a reversed payout is a new `PAYOUT_REVERSAL`
 * row. The original `SALE` stays exactly as it was written, because "this seller
 * earned ₹2,000 and it was later returned" is a fact, and an audit trail that
 * cannot express it is not an audit trail. `status` marks whether a row still
 * counts towards the balance, never whether it happened.
 *
 * ## `idempotency_key` is unique, and is the recording guard
 *
 * Every earning is recorded from a lifecycle transition that can itself be
 * retried (a replayed webhook, a double-clicked "Mark completed"). The key names
 * the thing that earned the money — `sale:{orderItemId}`, `rental:{rentalId}`,
 * `fee:{ledgerId}` — so a second recording attempt is a constraint violation
 * rather than a second credit.
 */
export const walletTransactions = mysqlTable(
  "wallet_transactions",
  {
    id: int("id").autoincrement().primaryKey(),
    sellerId: int("seller_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** A sale or rental line's provenance. Null for a bare adjustment. */
    orderId: int("order_id").references(() => orders.id, { onDelete: "set null" }),
    orderItemId: int("order_item_id").references(() => orderItems.id, { onDelete: "set null" }),
    rentalId: int("rental_id").references(() => rentals.id, { onDelete: "set null" }),
    /** Set on the `PAYOUT` / `PAYOUT_REVERSAL` pair only. */
    payoutId: int("payout_id").references(() => payouts.id, { onDelete: "set null" }),
    /**
     * SALE | RENTAL | REFUND | PLATFORM_FEE | PAYOUT | PAYOUT_REVERSAL |
     * ADJUSTMENT — the vocabulary lives in `server/lib/wallet.ts`.
     */
    type: varchar("type", { length: 20 }).notNull(),
    /** Signed integer paise. Credits positive, debits negative. */
    amount: int("amount").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),
    /**
     * Two vocabularies in one column, partitioned by `type` and enforced by
     * `assertWalletStatus`:
     *
     *  - earnings (SALE, RENTAL, PLATFORM_FEE, REFUND, ADJUSTMENT):
     *    PENDING | AVAILABLE | REVERSED
     *  - payout rows: the payout's own lifecycle verbatim
     *    (PENDING | PROCESSING | COMPLETED | FAILED | CANCELLED)
     *
     * A payout row mirrors the request it belongs to rather than translating it,
     * because the audit trail is more useful when it shows the states an admin
     * actually set than a lossy translation of them. `PAYOUT_REVERSAL` rows are
     * always `COMPLETED`: the reservation is released by the payout leaving the
     * pending bucket, and this row is the memo that says so.
     */
    status: varchar("status", { length: 12 }).notNull().default("PENDING"),
    /** One sentence a seller can read. Written by the server, never by a client. */
    description: varchar("description", { length: 200 }).notNull(),
    /**
     * What the seller would recognise this by — an order number (`RV-…`), a
     * payout number (`PAY-…`), or a product title. Searchable, and never the
     * auto-increment id: that is a row count.
     */
    reference: varchar("reference", { length: 60 }),
    /** See the note above. Unique; NULL never collides. */
    idempotencyKey: varchar("idempotency_key", { length: 120 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    index("wallet_transactions_seller_id_idx").on(table.sellerId),
    index("wallet_transactions_type_idx").on(table.type),
    index("wallet_transactions_status_idx").on(table.status),
    index("wallet_transactions_created_at_idx").on(table.createdAt),
    // The wallet list: one seller's rows, newest first, optionally narrowed to
    // one type. The leading seller column is what keeps the query scoped.
    index("wallet_transactions_seller_type_created_idx").on(
      table.sellerId,
      table.type,
      table.createdAt,
    ),
    index("wallet_transactions_order_id_idx").on(table.orderId),
    index("wallet_transactions_rental_id_idx").on(table.rentalId),
    index("wallet_transactions_payout_id_idx").on(table.payoutId),
    index("wallet_transactions_order_item_id_idx").on(table.orderItemId),
    uniqueIndex("wallet_transactions_idempotency_key_unique").on(table.idempotencyKey),
  ],
);

/* =============================================================================
 *  FOUNDATION TABLES
 *
 *  The tables below are the data foundation for features that are specified but
 *  not yet built: an order timeline, checkout stock holds, duplicate-submit
 *  guards, replay-safe payment webhooks, platform configuration, and recent
 *  search history. They are deliberately created *empty and with real
 *  constraints* rather than faked — a table with correct FKs, indexes and CHECKs
 *  is cheap, and inventing rows to fill it would be a lie the UI has to keep up.
 *
 *  Which of them have a producer today:
 *
 *    order_events            none — writer lands with the order timeline
 *    stock_reservations      none — writer lands with checkout holds
 *    idempotency_keys        none — `transactions.idempotencyKey` and
 *                                   `payouts.idempotencyKey` cover money writes
 *                                   today; this generalises that pattern
 *    payment_webhook_events  none — `transactions.processedEventIds` covers the
 *                                   payment provider we have today
 *    platform_settings       none — admin settings UI is a placeholder
 *    search_history          none — writer lands with search UX
 *
 *  See docs/database.md for the full ER map and the follow-ups.
 * ========================================================================== */

/* ------------------------------- order events ------------------------------ */

/**
 * Append-only history of one order: every status change with who caused it.
 *
 * Distinct from `admin_audit_log`, which records *admin* actions for review;
 * this is the order's own timeline and may be written by a customer, a seller,
 * an admin or the system. `actorId` is `SET NULL` on user deletion so the story
 * survives the person, and `actorRole` keeps the role as it stood at the time.
 */
export const orderEvents = mysqlTable(
  "order_events",
  {
    id: int("id").autoincrement().primaryKey(),
    orderId: int("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    /** What kind of event. `STATUS_CHANGED` | `NOTE_ADDED` | `CREATED` | … */
    type: varchar("type", { length: 32 }).notNull(),
    /** Null for events that did not move between two states (notes, creation). */
    fromStatus: varchar("from_status", { length: 20 }),
    toStatus: varchar("to_status", { length: 20 }).notNull(),
    /** Who caused it. Null for system actions and for deleted users. */
    actorId: int("actor_id").references(() => users.id, { onDelete: "set null" }),
    /** USER | SELLER | ADMIN | SYSTEM — the role *at the time of the event*. */
    actorRole: varchar("actor_role", { length: 10 }),
    note: varchar("note", { length: 300 }),
    /** Safe JSON context (a tracking number, a reason code). Never secrets. */
    metadata: text("metadata"),
    /** Once-and-only-once key for retried writers. Null never collides. */
    eventKey: varchar("event_key", { length: 190 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    // The timeline read: one order's events in chronological order. Covers the
    // "show me this order" query entirely, so no second index is needed.
    index("order_events_order_created_idx").on(table.orderId, table.createdAt),
    uniqueIndex("order_events_event_key_unique").on(table.eventKey),
    check("order_events_type_not_empty", sql`LENGTH(${table.type}) > 0`),
  ],
);

/* ----------------------------- stock reservations -------------------------- */

/**
 * A short-lived hold on stock, so two people cannot buy the last unit while
 * one of them is still typing their address.
 *
 * The hold is a row rather than a decrement of `products.available_quantity`
 * because a decrement with no owner cannot be undone safely when a checkout is
 * abandoned — here, expiry (`expires_at`) is the undo: a sweeper releases
 * holds that were never converted into an order.
 */
export const stockReservations = mysqlTable(
  "stock_reservations",
  {
    id: int("id").autoincrement().primaryKey(),
    productId: int("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Set once the hold is converted. Null while it is only a hold. */
    orderId: int("order_id").references(() => orders.id, { onDelete: "set null" }),
    quantity: int("quantity").notNull().default(1),
    /** Purchases leave both null; rentals span a window. */
    rentalStart: timestamp("rental_start", { mode: "date" }),
    rentalEnd: timestamp("rental_end", { mode: "date" }),
    expiresAt: timestamp("expires_at").notNull(),
    /** ACTIVE | CONSUMED | RELEASED | EXPIRED */
    status: varchar("status", { length: 12 }).notNull().default("ACTIVE"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    // The expiry sweep: "give back every ACTIVE hold on this product that has
    // passed its deadline", scoped by product so availability reads stay local.
    index("stock_reservations_product_expires_idx").on(
      table.productId,
      table.expiresAt,
      table.status,
    ),
    // The global sweeper walks states by deadline without touching live holds.
    index("stock_reservations_status_expires_idx").on(table.status, table.expiresAt),
    index("stock_reservations_user_id_idx").on(table.userId),
    check("stock_reservations_quantity_positive", sql`${table.quantity} > 0`),
    check(
      "stock_reservations_window_ordered",
      sql`${table.rentalEnd} IS NULL OR ${table.rentalStart} IS NULL OR ${table.rentalEnd} > ${table.rentalStart}`,
    ),
  ],
);

/* ------------------------------ idempotency keys --------------------------- */

/**
 * "This request already ran — here is the answer it got."
 *
 * Money writes already have this pattern locally (`transactions.idempotencyKey`,
 * `payouts.idempotencyKey`); this table generalises it to *any* repeated
 * request, keyed by `(scope, key)` so a checkout key can never collide with a
 * refund key. Storing the response snapshot is what lets a retry return the
 * original result instead of doing the work twice.
 *
 * `expires_at` makes the table self-cleaning: a key past its deadline is
 * irrelevant because the original request is no longer in flight.
 */
export const idempotencyKeys = mysqlTable(
  "idempotency_keys",
  {
    id: int("id").autoincrement().primaryKey(),
    /** `order.create` | `payment.create` | `payout.request` | … */
    scope: varchar("scope", { length: 40 }).notNull(),
    /** Client-supplied key. Combined with `scope`, this is the identity. */
    key: varchar("key", { length: 120 }).notNull(),
    userId: int("user_id").references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 of the normalised request body. */
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    /** HTTP status of the original response, once one was sent. */
    statusCode: int("status_code"),
    /** The original response body, replayed verbatim to a retry. */
    responseBody: text("response_body"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
    /**
     * The row is written twice: a bare claim on the way in, then the original
     * response once it has been sent. Without this there is no way to tell a
     * key that is still waiting from one that already answered, and the sweeper
     * would be guessing which ones are safe to reclaim.
     */
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex("idempotency_keys_scope_key_unique").on(table.scope, table.key),
    // The sweeper only ever looks at expired keys.
    index("idempotency_keys_expires_at_idx").on(table.expiresAt),
    index("idempotency_keys_user_id_idx").on(table.userId),
    check("idempotency_keys_scope_not_empty", sql`LENGTH(${table.scope}) > 0`),
    check("idempotency_keys_key_not_empty", sql`LENGTH(${table.key}) > 0`),
  ],
);

/* -------------------------- payment webhook events ------------------------- */

/**
 * One inbound provider webhook, recorded before anything is done with it.
 *
 * Two jobs: **replay safety** — `(provider, event_id)` is unique, so a provider
 * that delivers the same event five times only ever runs once — and **evidence**
 * — the raw payload is stored, so a disputed payment can be reconstructed
 * without asking the provider for it again.
 *
 * The payload is stored exactly as received. It must never contain a card
 * number, a CVV or a provider secret; the table holds provider references and
 * safe metadata only, same rule as `transactions`.
 */
export const paymentWebhookEvents = mysqlTable(
  "payment_webhook_events",
  {
    id: int("id").autoincrement().primaryKey(),
    provider: varchar("provider", { length: 20 }).notNull(),
    /** The provider's event id. Unique *per provider*. */
    providerEventId: varchar("event_id", { length: 160 }).notNull(),
    eventType: varchar("event_type", { length: 60 }).notNull(),
    payload: text("payload").notNull(),
    signatureVerified: boolean("signature_verified").notNull().default(false),
    /** RECEIVED | PROCESSED | FAILED | IGNORED */
    status: varchar("status", { length: 16 }).notNull().default("RECEIVED"),
    errorMessage: varchar("error_message", { length: 300 }),
    processedAt: timestamp("processed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    // The replay guard, and the reason a retry of the same delivery is a no-op.
    uniqueIndex("payment_webhook_events_provider_event_unique").on(
      table.provider,
      table.providerEventId,
    ),
    // The retry/inspection queue: failed first, newest first within a state.
    index("payment_webhook_events_status_created_idx").on(table.status, table.createdAt),
    check("payment_webhook_events_event_not_empty", sql`LENGTH(${table.providerEventId}) > 0`),
  ],
);

/* ------------------------------ platform settings -------------------------- */

/**
 * Admin-controlled configuration that must not live in the source.
 *
 * A single-row-per-key table with JSON `value` rather than a config file,
 * because the value has to be changed at runtime, written by an admin, and
 * attributed (`updated_by`) — and because a setting that needs a redeploy to
 * change is not a setting.
 *
 * `key` is the primary key: a setting that exists twice has no way to be read.
 */
export const platformSettings = mysqlTable("platform_settings", {
  key: varchar("key", { length: 80 }).primaryKey(),
  /** JSON document. Shape is owned by the feature that reads the key. */
  value: json("value").notNull(),
  description: varchar("description", { length: 200 }),
  updatedBy: int("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

/* ------------------------------- search history ---------------------------- */

/**
 * What a user searched for recently, for the "recent searches" affordance.
 *
 * Unique on `(user_id, term)` on purpose: repeating a search must move it to
 * the top rather than add a duplicate, so the writer is an upsert keyed on the
 * pair. `result_count` is recorded so an empty result is not offered back as a
 * suggestion the next time.
 */
export const searchHistory = mysqlTable(
  "search_history",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    term: varchar("term", { length: 120 }).notNull(),
    resultCount: int("result_count"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    // "Recent searches" is one user's, newest first.
    index("search_history_user_created_idx").on(table.userId, table.createdAt),
    uniqueIndex("search_history_user_term_unique").on(table.userId, table.term),
    check("search_history_term_not_empty", sql`LENGTH(TRIM(${table.term})) > 0`),
  ],
);

/* =============================================================================
 *  ADMIN, SECURITY, SUPPORT AND GROWTH
 *
 *  Foundation tables for the features specified after the schema itself. They go
 *  in now rather than later for two reasons: a table bolted on after the feature
 *  exists is a table the feature already had to work around, and several of these
 *  (RBAC, login attempts, refunds) constrain what those features are allowed to
 *  do before a line of them is written.
 *
 *  Nothing here competes with an existing column. `users.role` stays the source
 *  of truth for the coarse role, `seller_profiles.verified` for verification —
 *  these tables extend around them.
 * ========================================================================== */

/* ----------------------------------- RBAC ---------------------------------- */

export const roles = mysqlTable(
  "roles",
  {
    id: int("id").autoincrement().primaryKey(),
    /**
     * `SUPER_ADMIN | ADMIN | SUPPORT | FINANCE | MODERATOR | CONTENT_MANAGER`,
     * plus `USER` and `SELLER` so the coarse `users.role` value always has a row
     * to resolve against and the two never disagree about what a word means.
     *
     * Seeded by `pnpm db:seed`. A `isSystem` row is never deleted: an audit trail
     * pointing at a role nobody can name reads as "unknown", which is worse than
     * pointing at one that was retired.
     */
    name: varchar("name", { length: 32 }).notNull(),
    description: varchar("description", { length: 200 }),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex("roles_name_unique").on(table.name),
    check("roles_name_not_empty", sql`LENGTH(TRIM(${table.name})) > 0`),
  ],
);

export const permissions = mysqlTable(
  "permissions",
  {
    id: int("id").autoincrement().primaryKey(),
    /** `orders.refund` — `resource.action`, lowercase, dot-separated. */
    key: varchar("key", { length: 64 }).notNull(),
    description: varchar("description", { length: 200 }),
    /** The `orders` in `orders.refund`, so a grant screen can group keys by resource. */
    groupKey: varchar("group_key", { length: 40 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex("permissions_key_unique").on(table.key),
    index("permissions_group_key_idx").on(table.groupKey),
    check("permissions_key_not_empty", sql`LENGTH(TRIM(${table.key})) > 0`),
    // `resource.action` — a key with no separator can never match the check the
    // auth layer performs, so it is rejected here rather than silently denied.
    check("permissions_key_has_separator", sql`${table.key} LIKE '%.%'`),
  ],
);

export const rolePermissions = mysqlTable(
  "role_permissions",
  {
    // `roles` is `cascade` so removing a retired role drops its grants;
    // `permissions` likewise, because a permission nothing can be granted is dead.
    roleId: int("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
    permissionId: int("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.roleId, table.permissionId] }),
    // Granting is checked by role; revoking is checked by permission ("who still
    // has orders.refund?") — both directions are read, so both are indexed.
    index("role_permissions_permission_id_idx").on(table.permissionId),
  ],
);

export const userRoles = mysqlTable(
  "user_roles",
  {
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /**
     * `restrict`: a role that is still assigned cannot be dropped, even if it is
     * not marked `isSystem`. Removing access means deleting the grant row, so
     * this table holds exactly who has what *right now* and never a stale grant.
     */
    roleId: int("role_id").notNull().references(() => roles.id, { onDelete: "restrict" }),
    /** Null when the role came from `users.role` at import rather than a person granting it. */
    grantedBy: int("granted_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.roleId] }),
    index("user_roles_role_id_idx").on(table.roleId),
  ],
);

/* ------------------------------------ MFA ---------------------------------- */

export const userMfa = mysqlTable("user_mfa", {
  userId: int("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /**
   * Base32 TOTP secret, **encrypted before it reaches this column** and decrypted
   * only inside the verification path. The column holds ciphertext; the key lives
   * in the environment. The secret is never written to a log, a response body or
   * client storage.
   */
  secretEncrypted: varchar("secret_encrypted", { length: 512 }).notNull(),
  /** Null until the first successful challenge — scanning the QR and turning it on are different steps. */
  enabledAt: timestamp("enabled_at"),
  /**
   * Step of the last accepted code. A TOTP is valid for 30 seconds, so a code
   * stays replayable for that long; without this, capturing one code once is
   * enough to use it twice.
   */
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const mfaRecoveryCodes = mysqlTable(
  "mfa_recovery_codes",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Hash of the code. Plain, unhashed recovery codes in a table are a back door around the MFA. */
    codeHash: varchar("code_hash", { length: 128 }).notNull(),
    /** Set the moment one is used; the row stays so "you have 6 left" can be counted honestly. */
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    // Two rows claiming the same code would make the lookup ambiguous — and the
    // lookup is the one that decides whether a locked-out admin gets in.
    uniqueIndex("mfa_recovery_codes_hash_unique").on(table.codeHash),
    // "unused codes for this user" is the query every challenge runs.
    index("mfa_recovery_codes_user_used_idx").on(table.userId, table.usedAt),
    check("mfa_recovery_codes_hash_not_empty", sql`LENGTH(${table.codeHash}) > 0`),
  ],
);

/* ---------------------------- login and security --------------------------- */

export const loginAttempts = mysqlTable(
  "login_attempts",
  {
    id: int("id").autoincrement().primaryKey(),
    /**
     * The identifier that was typed — an email address.
     *
     * Never the password. This table has to be safe to read aloud in a support
     * call, which is also why the password column it complements does not exist:
     * there is nothing here a leak could be replayed with.
     */
    identifier: varchar("identifier", { length: 320 }).notNull(),
    /** Null when nobody with that address exists — recording "no such user" against a real id would leak that fact. */
    userId: int("user_id").references(() => users.id, { onDelete: "set null" }),
    ip: varchar("ip", { length: 45 }),
    userAgent: varchar("user_agent", { length: 400 }),
    success: boolean("success").notNull().default(false),
    /** `bad_password` | `no_such_user` | `rate_limited` | `mfa_required` | `account_suspended`. */
    failureReason: varchar("failure_reason", { length: 40 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    // Rate limiting asks "how many attempts for this identifier since T?" — a
    // filter and a sort on the same pair, so one index answers both.
    index("login_attempts_identifier_created_idx").on(table.identifier, table.createdAt),
    // The same question asked by IP, for attempts spraying several accounts.
    index("login_attempts_ip_created_idx").on(table.ip, table.createdAt),
    // The security tab on an account: this user's history, newest first.
    index("login_attempts_user_created_idx").on(table.userId, table.createdAt),
    check("login_attempts_identifier_not_empty", sql`LENGTH(TRIM(${table.identifier})) > 0`),
  ],
);

export const securityEvents = mysqlTable(
  "security_events",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").references(() => users.id, { onDelete: "set null" }),
    /** `LOGIN_SUCCESS | PASSWORD_CHANGED | MFA_ENABLED | SESSION_REVOKED | ROLE_GRANTED | …` */
    type: varchar("type", { length: 48 }).notNull(),
    ip: varchar("ip", { length: 45 }),
    userAgent: varchar("user_agent", { length: 400 }),
    /**
     * JSON of context that is safe to keep — a device label, the name of the
     * field that changed. Never a secret, a token, a password or a code. Written
     * through the redacting logger's shape, not around it.
     */
    details: text("details"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("security_events_user_created_idx").on(table.userId, table.createdAt),
    // "every password change this week" is the query an investigation starts with.
    index("security_events_type_created_idx").on(table.type, table.createdAt),
    check("security_events_type_not_empty", sql`LENGTH(TRIM(${table.type})) > 0`),
  ],
);

/* ------------------------------------ CMS ---------------------------------- */

export const cmsBanners = mysqlTable(
  "cms_banners",
  {
    id: int("id").autoincrement().primaryKey(),
    /** `HERO | CATEGORY_STRIP | FOOTER` — where on the page this slot lives. */
    placement: varchar("placement", { length: 32 }).notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    subtitle: varchar("subtitle", { length: 200 }),
    /** Path or absolute URL. The scheme is validated on write — `javascript:` has no business here. */
    imageUrl: varchar("image_url", { length: 500 }).notNull(),
    linkUrl: varchar("link_url", { length: 500 }),
    sortOrder: int("sort_order").notNull().default(0),
    status: varchar("status", { length: 16 }).notNull().default("DRAFT"),
    startsAt: timestamp("starts_at"),
    endsAt: timestamp("ends_at"),
    createdBy: int("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    // The homepage reads "active banners in this placement, in order" on every
    // load — the index serves the filter and the sort in one scan.
    index("cms_banners_placement_status_sort_idx").on(table.placement, table.status, table.sortOrder),
    // A scheduled banner flips to visible at `starts_at`; this is the row the
    // scheduler looks for.
    index("cms_banners_status_starts_idx").on(table.status, table.startsAt),
    check(
      "cms_banners_window_ordered",
      sql`${table.endsAt} IS NULL OR ${table.startsAt} IS NULL OR ${table.endsAt} > ${table.startsAt}`,
    ),
    check("cms_banners_title_not_empty", sql`LENGTH(TRIM(${table.title})) > 0`),
    check("cms_banners_sort_nonneg", sql`${table.sortOrder} >= 0`),
  ],
);

export const cmsBlocks = mysqlTable(
  "cms_blocks",
  {
    id: int("id").autoincrement().primaryKey(),
    /** Stable name a component looks up (`about.hero`, `footer.legal`), never rendered directly. */
    blockKey: varchar("block_key", { length: 64 }).notNull(),
    /**
     * JSON content. Validated on write **and** re-validated on read: a block whose
     * shape has drifted since it was saved must degrade to empty rather than
     * throw while someone is trying to read the page it sits on.
     *
     * Never rendered with `dangerouslySetInnerHTML` — whatever is in here is
     * structured data that React escapes on the way out.
     */
    content: text("content").notNull(),
    status: varchar("status", { length: 16 }).notNull().default("DRAFT"),
    createdBy: int("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex("cms_blocks_key_unique").on(table.blockKey),
    check("cms_blocks_key_not_empty", sql`LENGTH(TRIM(${table.blockKey})) > 0`),
    check("cms_blocks_content_not_empty", sql`LENGTH(TRIM(${table.content})) > 0`),
  ],
);

/* ---------------------------------- support -------------------------------- */

export const supportTickets = mysqlTable(
  "support_tickets",
  {
    id: int("id").autoincrement().primaryKey(),
    /** `RV-T-8F3K2A` — quotable in conversation, unlike a sequential id. */
    ticketNumber: varchar("ticket_number", { length: 20 }).notNull(),
    /** The person who asked for help. `restrict`: closing an account does not erase what they reported. */
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Null while the ticket sits unassigned — the open queue reads exactly this. */
    assigneeId: int("assignee_id").references(() => users.id, { onDelete: "set null" }),
    orderId: int("order_id").references(() => orders.id, { onDelete: "set null" }),
    subject: varchar("subject", { length: 200 }).notNull(),
    /** `OPEN | PENDING | IN_PROGRESS | RESOLVED | CLOSED` — see `TICKET_STATUSES`. */
    status: varchar("status", { length: 20 }).notNull().default("OPEN"),
    /** `LOW | NORMAL | HIGH | URGENT`. */
    priority: varchar("priority", { length: 12 }).notNull().default("NORMAL"),
    /** Null where no SLA applies. Nullable is not the same as "unbounded". */
    slaDueAt: timestamp("sla_due_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex("support_tickets_number_unique").on(table.ticketNumber),
    // The queue is "open tickets, oldest first", then sorted by when the SLA runs
    // out — the filter column leads.
    index("support_tickets_status_created_idx").on(table.status, table.createdAt),
    // An agent's personal queue: one assignee, filtered by state.
    index("support_tickets_assignee_status_idx").on(table.assigneeId, table.status),
    index("support_tickets_user_created_idx").on(table.userId, table.createdAt),
    // "what is about to breach" — a range scan on a nullable deadline.
    index("support_tickets_sla_idx").on(table.slaDueAt),
    check("support_tickets_sla_after_created", sql`${table.slaDueAt} IS NULL OR ${table.slaDueAt} > ${table.createdAt}`),
    check("support_tickets_subject_not_empty", sql`LENGTH(TRIM(${table.subject})) > 0`),
  ],
);

export const ticketMessages = mysqlTable(
  "ticket_messages",
  {
    id: int("id").autoincrement().primaryKey(),
    ticketId: int("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    authorId: int("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    /**
     * A staff-only note on the ticket.
     *
     * This column is what makes "never expose private message contents beyond
     * what the existing rules allow" enforceable at the data layer: an internal
     * line is filtered out of the customer's query, not hidden with CSS after
     * being serialised into the response.
     */
    isInternal: boolean("is_internal").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    // A thread is always read whole and oldest-first.
    index("ticket_messages_ticket_created_idx").on(table.ticketId, table.createdAt),
    check("ticket_messages_body_not_empty", sql`LENGTH(TRIM(${table.body})) > 0`),
  ],
);

export const ticketAttachments = mysqlTable(
  "ticket_attachments",
  {
    id: int("id").autoincrement().primaryKey(),
    ticketMessageId: int("ticket_message_id")
      .notNull()
      .references(() => ticketMessages.id, { onDelete: "cascade" }),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    /** Storage URL, not bytes: the row is a pointer so a message can be read without loading a file. */
    url: varchar("url", { length: 500 }).notNull(),
    mimeType: varchar("mime_type", { length: 120 }),
    sizeBytes: int("size_bytes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("ticket_attachments_message_id_idx").on(table.ticketMessageId),
    check("ticket_attachments_size_positive", sql`${table.sizeBytes} IS NULL OR ${table.sizeBytes} > 0`),
    check("ticket_attachments_file_not_empty", sql`LENGTH(TRIM(${table.fileName})) > 0`),
  ],
);

/* ------------------------------- money: refunds ---------------------------- */

export const refunds = mysqlTable(
  "refunds",
  {
    id: int("id").autoincrement().primaryKey(),
    /** `RV-RF-8F3K2A` — quoted to the customer the same way an order number is. */
    refundNumber: varchar("refund_number", { length: 20 }).notNull(),
    orderId: int("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    /** Set null when the refund is against the whole order rather than one line. */
    orderItemId: int("order_item_id").references(() => orderItems.id, { onDelete: "set null" }),
    transactionId: int("transaction_id").references(() => transactions.id, { onDelete: "set null" }),
    /** Who the money goes back to. `restrict`: refunds must survive account closure. */
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    amount: int("amount").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),
    reason: varchar("reason", { length: 300 }),
    /** `PENDING | PROCESSING | SUCCEEDED | FAILED | CANCELLED` — see `REFUND_STATUSES`. */
    status: varchar("status", { length: 20 }).notNull().default("PENDING"),
    providerReference: varchar("provider_reference", { length: 100 }),
    /**
     * The retry token for this refund. Submitting the same refund twice must
     * return the first result, not create a second one — this is the column that
     * makes that checkable in a unique index rather than in application memory.
     */
    idempotencyKey: varchar("idempotency_key", { length: 120 }),
    createdBy: int("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex("refunds_number_unique").on(table.refundNumber),
    uniqueIndex("refunds_idempotency_key_unique").on(table.idempotencyKey),
    index("refunds_order_id_idx").on(table.orderId),
    // The refund queue is a status filter walked newest-first.
    index("refunds_status_created_idx").on(table.status, table.createdAt),
    index("refunds_user_created_idx").on(table.userId, table.createdAt),
    // Stricter than the price checks elsewhere on purpose: a refund of zero is
    // not a discount, it is a failed refund that reached the database.
    check("refunds_amount_positive", sql`${table.amount} > 0`),
    check("refunds_currency_length", sql`LENGTH(${table.currency}) = 3`),
  ],
);

export const disputes = mysqlTable(
  "disputes",
  {
    id: int("id").autoincrement().primaryKey(),
    disputeNumber: varchar("dispute_number", { length: 20 }).notNull(),
    orderId: int("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    openedBy: int("opened_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** The party the dispute is against — seller or buyer, depending on who opened it. */
    againstUserId: int("against_user_id").references(() => users.id, { onDelete: "set null" }),
    status: varchar("status", { length: 20 }).notNull().default("OPEN"),
    reason: varchar("reason", { length: 60 }).notNull(),
    description: text("description"),
    resolution: text("resolution"),
    resolvedBy: int("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex("disputes_number_unique").on(table.disputeNumber),
    index("disputes_status_created_idx").on(table.status, table.createdAt),
    index("disputes_order_id_idx").on(table.orderId),
    index("disputes_user_created_idx").on(table.openedBy, table.createdAt),
    check("disputes_resolved_at_not_before_created", sql`${table.resolvedAt} IS NULL OR ${table.resolvedAt} >= ${table.createdAt}`),
    check("disputes_reason_not_empty", sql`LENGTH(TRIM(${table.reason})) > 0`),
  ],
);

/**
 * Who takes how much, and from when.
 *
 * `GLOBAL → CATEGORY → SELLER` is deliberately three rows of the same shape
 * rather than three tables: the resolver reads a narrow window, falls back to a
 * wider one, and stops. Three tables would be three joins to answer one question.
 */
export const commissionRules = mysqlTable(
  "commission_rules",
  {
    id: int("id").autoincrement().primaryKey(),
    /** `GLOBAL | CATEGORY | SELLER`. */
    scope: varchar("scope", { length: 12 }).notNull().default("GLOBAL"),
    categoryId: int("category_id").references(() => categories.id, { onDelete: "set null" }),
    sellerId: int("seller_id").references(() => users.id, { onDelete: "set null" }),
    /**
     * Basis points, never a float: `250` is 2.50%, `10000` is 100%.
     *
     * Money arithmetic never touches a `double` — a commission computed in
     * floating point disagrees with the ledger it is supposed to match, by an
     * amount nobody can predict and everybody has to reconcile.
     */
    percentBp: int("percent_bp").notNull().default(0),
    /** A flat cut per settled line, on top of or instead of the percentage. */
    fixedFeePaise: int("fixed_fee_paise").notNull().default(0),
    effectiveFrom: timestamp("effective_from").notNull().defaultNow(),
    effectiveTo: timestamp("effective_to"),
    createdBy: int("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    // Two rules for the same subject starting at the same instant would make
    // "which one applies?" a coin flip — rejected rather than resolved by luck.
    // MySQL treats NULLs as distinct in a unique index, so many `GLOBAL` rules
    // coexist while the same start instant cannot be claimed twice.
    uniqueIndex("commission_rules_scope_subject_start_unique").on(
      table.scope,
      table.categoryId,
      table.sellerId,
      table.effectiveFrom,
    ),
    // The resolver reads "the newest rule for this scope at time T".
    index("commission_rules_scope_effective_idx").on(table.scope, table.effectiveFrom),
    index("commission_rules_category_idx").on(table.categoryId),
    index("commission_rules_seller_idx").on(table.sellerId),
    check("commission_rules_percent_range", sql`${table.percentBp} BETWEEN 0 AND 10000`),
    check("commission_rules_fixed_fee_nonneg", sql`${table.fixedFeePaise} >= 0`),
    check(
      "commission_rules_window_ordered",
      sql`${table.effectiveTo} IS NULL OR ${table.effectiveTo} > ${table.effectiveFrom}`,
    ),
    // A `CATEGORY` rule naming no category would silently match every category,
    // and a `SELLER` rule naming no seller would silently match every seller.
    // The rule's own shape is checked here rather than left to an API to notice.
    check("commission_rules_category_requires_scope", sql`${table.scope} <> 'CATEGORY' OR ${table.categoryId} IS NOT NULL`),
    check("commission_rules_seller_requires_scope", sql`${table.scope} <> 'SELLER' OR ${table.sellerId} IS NOT NULL`),
  ],
);

export const sellerVerifications = mysqlTable(
  "seller_verifications",
  {
    id: int("id").autoincrement().primaryKey(),
    /** `restrict`: a verification history that vanishes with the account proves nothing. */
    sellerId: int("seller_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: varchar("status", { length: 16 }).notNull().default("PENDING"),
    /** `PAN | GSTIN | AADHAAR | PASSPORT | DRIVING_LICENCE`. */
    documentType: varchar("document_type", { length: 32 }),
    /**
     * **Hash** of the document reference — never the document or its number.
     *
     * What matters later is "was this seller verified, and by whom", which needs
     * no copy of the card. Hashing still lets a resubmission be recognised as the
     * same document, so a rejected seller cannot simply retype it to pass twice.
     */
    documentRefHash: varchar("document_ref_hash", { length: 128 }),
    submittedAt: timestamp("submitted_at"),
    reviewedAt: timestamp("reviewed_at"),
    reviewedBy: int("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    rejectionReason: varchar("rejection_reason", { length: 300 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    // One seller's history, newest submission first.
    index("seller_verifications_seller_status_idx").on(table.sellerId, table.status),
    index("seller_verifications_status_created_idx").on(table.status, table.createdAt),
    check(
      "seller_verifications_reviewed_after_submitted",
      sql`${table.reviewedAt} IS NULL OR ${table.submittedAt} IS NULL OR ${table.reviewedAt} >= ${table.submittedAt}`,
    ),
    // "Rejected" without a reason is a support ticket nobody can answer.
    check(
      "seller_verifications_rejected_needs_reason",
      sql`${table.status} <> 'REJECTED' OR LENGTH(TRIM(COALESCE(${table.rejectionReason}, ''))) > 0`,
    ),
  ],
);

/* ---------------------------------- growth --------------------------------- */

export const coupons = mysqlTable(
  "coupons",
  {
    id: int("id").autoincrement().primaryKey(),
    /**
     * Compared case-insensitively by `utf8mb4_unicode_ci`, so `SAVE10` and
     * `save10` are one coupon rather than two that quietly split the usage count.
     */
    code: varchar("code", { length: 40 }).notNull(),
    description: varchar("description", { length: 200 }),
    /** `PERCENT | FLAT`. */
    discountType: varchar("discount_type", { length: 8 }).notNull(),
    /**
     * Two meanings, one column, and that is only safe because the meaning is
     * pinned by a CHECK beside it: `FLAT` holds **paise**, `PERCENT` holds
     * **basis points** (`100` = 1%, `10000` = 100%).
     */
    discountValue: int("discount_value").notNull(),
    /** Ceiling on a `PERCENT` discount, in paise. */
    maxDiscountPaise: int("max_discount_paise"),
    minimumOrderPaise: int("minimum_order_paise").notNull().default(0),
    /** Null = unlimited. */
    usageLimit: int("usage_limit"),
    /** Null = unlimited per person. */
    perUserLimit: int("per_user_limit"),
    /**
     * Denormalised count of `coupon_redemptions`, incremented inside the same
     * transaction that inserts the redemption. Read on every checkout attempt to
     * answer "is this code used up?" — a count that needs a `COUNT(*)` over the
     * redemption table is a count the checkout cannot afford to make.
     */
    usedCount: int("used_count").notNull().default(0),
    startsAt: timestamp("starts_at"),
    endsAt: timestamp("ends_at"),
    status: varchar("status", { length: 16 }).notNull().default("ACTIVE"),
    /** `ALL | CATEGORY | PRODUCT`. */
    appliesTo: varchar("applies_to", { length: 12 }).notNull().default("ALL"),
    categoryId: int("category_id").references(() => categories.id, { onDelete: "set null" }),
    sellerId: int("seller_id").references(() => users.id, { onDelete: "set null" }),
    createdBy: int("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex("coupons_code_unique").on(table.code),
    // "codes that are live right now" — the status filters, the window range-scan.
    index("coupons_status_starts_idx").on(table.status, table.startsAt, table.endsAt),
    index("coupons_category_idx").on(table.categoryId),
    index("coupons_seller_idx").on(table.sellerId),
    check("coupons_value_positive", sql`${table.discountValue} > 0`),
    // The column's second meaning, enforced: a `PERCENT` coupon cannot be given a
    // value that is not basis points, and 10000bp is the ceiling — a 1000% coupon
    // is a typo, not a promotion.
    check(
      "coupons_percent_bp_range",
      sql`${table.discountType} <> 'PERCENT' OR ${table.discountValue} BETWEEN 1 AND 10000`,
    ),
    check("coupons_max_discount_nonneg", sql`${table.maxDiscountPaise} IS NULL OR ${table.maxDiscountPaise} >= 0`),
    check("coupons_minimum_order_nonneg", sql`${table.minimumOrderPaise} >= 0`),
    check("coupons_usage_limit_positive", sql`${table.usageLimit} IS NULL OR ${table.usageLimit} > 0`),
    check("coupons_per_user_limit_positive", sql`${table.perUserLimit} IS NULL OR ${table.perUserLimit} > 0`),
    check("coupons_used_count_nonneg", sql`${table.usedCount} >= 0`),
    check(
      "coupons_window_ordered",
      sql`${table.endsAt} IS NULL OR ${table.startsAt} IS NULL OR ${table.endsAt} > ${table.startsAt}`,
    ),
    // A `CATEGORY` coupon that names no category would match every category.
    check("coupons_category_requires_scope", sql`${table.appliesTo} <> 'CATEGORY' OR ${table.categoryId} IS NOT NULL`),
    // The counter and its ceiling in one constraint: a race that pushes the count
    // past the limit fails the write instead of admitting one redemption too many.
    check("coupons_used_within_limit", sql`${table.usageLimit} IS NULL OR ${table.usedCount} <= ${table.usageLimit}`),
  ],
);

export const couponRedemptions = mysqlTable(
  "coupon_redemptions",
  {
    id: int("id").autoincrement().primaryKey(),
    couponId: int("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "cascade" }),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    orderId: int("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    /** What was actually taken off, in paise — not re-derived later from the coupon, which may since have changed. */
    discountPaise: int("discount_paise").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    // One coupon once per order. Retrying checkout must not double-apply the code,
    // and a unique index is the only place that check survives a crash between
    // the two writes it has to be consistent with.
    uniqueIndex("coupon_redemptions_coupon_order_unique").on(table.couponId, table.orderId),
    // "codes I have used" and "who redeemed this code" both read from here.
    index("coupon_redemptions_user_created_idx").on(table.userId, table.createdAt),
    index("coupon_redemptions_coupon_created_idx").on(table.couponId, table.createdAt),
    check("coupon_redemptions_discount_positive", sql`${table.discountPaise} > 0`),
  ],
);

/* ----------------------------------- config -------------------------------- */

export const featureFlags = mysqlTable(
  "feature_flags",
  {
    id: int("id").autoincrement().primaryKey(),
    key: varchar("key", { length: 64 }).notNull(),
    description: varchar("description", { length: 200 }),
    enabled: boolean("enabled").notNull().default(false),
    /** 0–100. Shipping a risky change at 5% is how it reaches real traffic without reaching all of it. */
    rolloutPercent: int("rollout_percent").notNull().default(0),
    /** `ALL | SELLER | ADMIN | BETA` — who the percentage is sampled from. */
    audience: varchar("audience", { length: 16 }).notNull().default("ALL"),
    createdBy: int("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex("feature_flags_key_unique").on(table.key),
    // Every request resolves the flags it needs; the enabled ones are the whole
    // set, so this is a covering filter rather than a sort.
    index("feature_flags_enabled_idx").on(table.enabled),
    check("feature_flags_rollout_range", sql`${table.rolloutPercent} BETWEEN 0 AND 100`),
    check("feature_flags_key_not_empty", sql`LENGTH(TRIM(${table.key})) > 0`),
  ],
);

export const appConfig = mysqlTable(
  "app_config",
  {
    id: int("id").autoincrement().primaryKey(),
    configKey: varchar("config_key", { length: 64 }).notNull(),
    /**
     * JSON. Re-validated on read as well as write: a value whose shape has
     * drifted since it was saved must fall back to its default rather than take
     * the page down with it.
     */
    value: text("value").notNull(),
    updatedBy: int("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex("app_config_key_unique").on(table.configKey),
    check("app_config_key_not_empty", sql`LENGTH(TRIM(${table.configKey})) > 0`),
    check("app_config_value_not_empty", sql`LENGTH(TRIM(${table.value})) > 0`),
  ],
);

export const exportJobs = mysqlTable(
  "export_jobs",
  {
    id: int("id").autoincrement().primaryKey(),
    /** Retry token: asking for the same export twice returns the first job. */
    jobKey: varchar("job_key", { length: 40 }).notNull(),
    /** `ORDERS | PAYOUTS | AUDIT_LOG | PRODUCTS | TRANSACTIONS`. */
    type: varchar("type", { length: 32 }).notNull(),
    requestedBy: int("requested_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** JSON of the filters the export was asked for — an export nobody can reproduce is evidence of nothing. */
    scope: text("scope"),
    status: varchar("status", { length: 16 }).notNull().default("PENDING"),
    fileUrl: varchar("file_url", { length: 500 }),
    errorMessage: varchar("error_message", { length: 500 }),
    rowCount: int("row_count"),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex("export_jobs_key_unique").on(table.jobKey),
    // "my exports, newest first" for the requester.
    index("export_jobs_user_created_idx").on(table.requestedBy, table.createdAt),
    // The worker takes the oldest `PENDING` job — the queue read is this index.
    index("export_jobs_status_created_idx").on(table.status, table.createdAt),
    check("export_jobs_row_count_nonneg", sql`${table.rowCount} IS NULL OR ${table.rowCount} >= 0`),
    check("export_jobs_expires_after_created", sql`${table.expiresAt} IS NULL OR ${table.expiresAt} > ${table.createdAt}`),
    check("export_jobs_type_not_empty", sql`LENGTH(TRIM(${table.type})) > 0`),
  ],
);

/* =============================================================================
 *  RELATIONS
 *
 *  Lets `db.query.*` do joined reads without N+1: a graph read through a
 *  relation is a `LEFT JOIN`, not one round trip per row. Every relation below
 *  mirrors a real foreign key — nothing here invents a link the data does not
 *  have.
 *
 *  Where a table has two FKs to the same parent (`rentals.renter_id` and
 *  `rentals.owner_id`, `reviews.user_id` and `reviews.seller_id`, …) both sides
 *  carry a `relationName`; without it Drizzle cannot tell the two edges apart
 *  and the graph resolves to the wrong one.
 * ========================================================================== */

export const usersRelations = relations(users, ({ one, many }) => ({
  addresses: many(addresses),
  sessions: many(sessions),
  sellerProfile: one(sellerProfiles),
  notificationPreferences: one(notificationPreferences),
  products: many(products),
  favorites: many(favorites),
  cart: one(carts),
  soldItems: many(orderItems),
  buyerOrders: many(orders),
  rentalsAsRenter: many(rentals, { relationName: "rentalRenter" }),
  rentalsAsOwner: many(rentals, { relationName: "rentalOwner" }),
  reviewsAsReviewer: many(reviews, { relationName: "reviewAuthor" }),
  reviewsAsSeller: many(reviews, { relationName: "reviewSeller" }),
  reportsFiled: many(reports, { relationName: "reportReporter" }),
  reportsAbout: many(reports, { relationName: "reportSubject" }),
  payoutsAsSeller: many(payouts, { relationName: "payoutSeller" }),
  payoutsReviewed: many(payouts, { relationName: "payoutReviewer" }),
  payoutMethods: many(sellerPayoutMethods),
  transactions: many(transactions),
  walletEntries: many(walletTransactions),
  notifications: many(notifications),
  conversationParticipations: many(conversationParticipants),
  messages: many(messages),
  sentOrderEvents: many(orderEvents),
  stockReservations: many(stockReservations),
  idempotencyKeys: many(idempotencyKeys),
  searchHistory: many(searchHistory),
  updatedSettings: many(platformSettings),
  auditEntries: many(adminAuditLog),
  // Admin, security and support — the graph a "who is this account" read walks.
  //
  // Where a child carries two or more FKs back to `users`, both sides name the
  // edge: without a `relationName` Drizzle cannot tell which of the two it is
  // walking, and the graph quietly resolves to the wrong one.
  grantedRoles: many(userRoles, { relationName: "roleGrantee" }),
  rolesGranted: many(userRoles, { relationName: "roleGrantor" }),
  mfa: one(userMfa),
  recoveryCodes: many(mfaRecoveryCodes),
  loginAttempts: many(loginAttempts),
  securityEvents: many(securityEvents),
  bannersCreated: many(cmsBanners),
  blocksCreated: many(cmsBlocks),
  supportTicketsRaised: many(supportTickets, { relationName: "ticketRequester" }),
  supportTicketsAssigned: many(supportTickets, { relationName: "ticketAssignee" }),
  ticketsAuthored: many(ticketMessages),
  couponsCreated: many(coupons, { relationName: "couponCreator" }),
  couponsAsSeller: many(coupons, { relationName: "couponSeller" }),
  verificationsSubmitted: many(sellerVerifications, { relationName: "verificationSeller" }),
  verificationsReviewed: many(sellerVerifications, { relationName: "verificationReviewer" }),
  refundsReceived: many(refunds, { relationName: "refundReceiver" }),
  refundsCreated: many(refunds, { relationName: "refundCreator" }),
  disputesOpened: many(disputes, { relationName: "disputeOpener" }),
  disputesAgainst: many(disputes, { relationName: "disputeTarget" }),
  disputesResolved: many(disputes, { relationName: "disputeResolver" }),
  commissionsAsSeller: many(commissionRules, { relationName: "commissionSeller" }),
  commissionsCreated: many(commissionRules, { relationName: "commissionCreator" }),
  featureFlagsCreated: many(featureFlags),
  configUpdated: many(appConfig),
  exportsRequested: many(exportJobs),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const addressesRelations = relations(addresses, ({ one, many }) => ({
  user: one(users, { fields: [addresses.userId], references: [users.id] }),
  orders: many(orders),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: "categoryHierarchy",
  }),
  children: many(categories, { relationName: "categoryHierarchy" }),
  products: many(products),
  commissionRules: many(commissionRules),
  coupons: many(coupons),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  seller: one(users, { fields: [products.sellerId], references: [users.id] }),
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  images: many(productImages),
  tags: many(productTags),
  favorites: many(favorites),
  orderItems: many(orderItems),
  rentals: many(rentals),
  reviews: many(reviews),
  conversations: many(conversations),
  reports: many(reports),
  reservations: many(stockReservations),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, {
    fields: [productImages.productId],
    references: [products.id],
  }),
}));

export const productTagsRelations = relations(productTags, ({ one }) => ({
  product: one(products, { fields: [productTags.productId], references: [products.id] }),
}));

export const favoritesRelations = relations(favorites, ({ one }) => ({
  user: one(users, { fields: [favorites.userId], references: [users.id] }),
  product: one(products, { fields: [favorites.productId], references: [products.id] }),
}));

export const cartsRelations = relations(carts, ({ one, many }) => ({
  user: one(users, { fields: [carts.userId], references: [users.id] }),
  items: many(cartItems),
}));

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, { fields: [cartItems.cartId], references: [carts.id] }),
  product: one(products, { fields: [cartItems.productId], references: [products.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  deliveryAddress: one(addresses, {
    fields: [orders.deliveryAddressId],
    references: [addresses.id],
  }),
  items: many(orderItems),
  rentals: many(rentals),
  transactions: many(transactions),
  events: many(orderEvents),
  conversations: many(conversations),
  walletEntries: many(walletTransactions),
  supportTickets: many(supportTickets),
  refunds: many(refunds),
  disputes: many(disputes),
  couponRedemptions: many(couponRedemptions),
}));

export const orderItemsRelations = relations(orderItems, ({ one, many }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
  seller: one(users, { fields: [orderItems.sellerId], references: [users.id] }),
  // Inverse of `rentals.order_item_id` — the FK lives on `rentals`, so this side
  // declares the *many* only. Declaring both sides with explicit fields would be
  // two unpaired relations, and Drizzle would resolve them to the wrong edge.
  rentals: many(rentals),
  reviews: many(reviews),
  walletEntries: many(walletTransactions),
  refunds: many(refunds),
}));

export const rentalsRelations = relations(rentals, ({ one, many }) => ({
  order: one(orders, { fields: [rentals.orderId], references: [orders.id] }),
  orderItem: one(orderItems, {
    fields: [rentals.orderItemId],
    references: [orderItems.id],
  }),
  product: one(products, { fields: [rentals.productId], references: [products.id] }),
  renter: one(users, {
    fields: [rentals.renterId],
    references: [users.id],
    relationName: "rentalRenter",
  }),
  owner: one(users, {
    fields: [rentals.ownerId],
    references: [users.id],
    relationName: "rentalOwner",
  }),
  events: many(rentalEvents),
  reviews: many(reviews),
  walletEntries: many(walletTransactions),
}));

export const rentalEventsRelations = relations(rentalEvents, ({ one }) => ({
  rental: one(rentals, { fields: [rentalEvents.rentalId], references: [rentals.id] }),
}));

export const reviewsRelations = relations(reviews, ({ one, many }) => ({
  product: one(products, { fields: [reviews.productId], references: [products.id] }),
  user: one(users, {
    fields: [reviews.userId],
    references: [users.id],
    relationName: "reviewAuthor",
  }),
  seller: one(users, {
    fields: [reviews.sellerId],
    references: [users.id],
    relationName: "reviewSeller",
  }),
  order: one(orders, { fields: [reviews.orderId], references: [orders.id] }),
  orderItem: one(orderItems, {
    fields: [reviews.orderItemId],
    references: [orderItems.id],
  }),
  rental: one(rentals, { fields: [reviews.rentalId], references: [rentals.id] }),
  helpfulVotes: many(reviewHelpfulVotes),
}));

export const reviewHelpfulVotesRelations = relations(
  reviewHelpfulVotes,
  ({ one }) => ({
    review: one(reviews, {
      fields: [reviewHelpfulVotes.reviewId],
      references: [reviews.id],
    }),
    user: one(users, { fields: [reviewHelpfulVotes.userId], references: [users.id] }),
  }),
);

export const sellerProfilesRelations = relations(sellerProfiles, ({ one }) => ({
  user: one(users, { fields: [sellerProfiles.userId], references: [users.id] }),
}));

export const sellerPayoutMethodsRelations = relations(
  sellerPayoutMethods,
  ({ one, many }) => ({
    seller: one(users, {
      fields: [sellerPayoutMethods.sellerId],
      references: [users.id],
    }),
    payouts: many(payouts),
  }),
);

export const payoutsRelations = relations(payouts, ({ one, many }) => ({
  seller: one(users, {
    fields: [payouts.sellerId],
    references: [users.id],
    relationName: "payoutSeller",
  }),
  method: one(sellerPayoutMethods, {
    fields: [payouts.methodId],
    references: [sellerPayoutMethods.id],
  }),
  reviewedByUser: one(users, {
    fields: [payouts.reviewedBy],
    references: [users.id],
    relationName: "payoutReviewer",
  }),
  walletEntries: many(walletTransactions),
}));

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  user: one(users, { fields: [transactions.userId], references: [users.id] }),
  order: one(orders, { fields: [transactions.orderId], references: [orders.id] }),
  refunds: many(refunds),
}));

export const walletTransactionsRelations = relations(
  walletTransactions,
  ({ one }) => ({
    seller: one(users, { fields: [walletTransactions.sellerId], references: [users.id] }),
    order: one(orders, { fields: [walletTransactions.orderId], references: [orders.id] }),
    orderItem: one(orderItems, {
      fields: [walletTransactions.orderItemId],
      references: [orderItems.id],
    }),
    rental: one(rentals, { fields: [walletTransactions.rentalId], references: [rentals.id] }),
    payout: one(payouts, { fields: [walletTransactions.payoutId], references: [payouts.id] }),
  }),
);

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  product: one(products, { fields: [conversations.productId], references: [products.id] }),
  order: one(orders, { fields: [conversations.orderId], references: [orders.id] }),
  rental: one(rentals, { fields: [conversations.rentalId], references: [rentals.id] }),
  participants: many(conversationParticipants),
  messages: many(messages),
}));

export const conversationParticipantsRelations = relations(
  conversationParticipants,
  ({ one }) => ({
    conversation: one(conversations, {
      fields: [conversationParticipants.conversationId],
      references: [conversations.id],
    }),
    user: one(users, {
      fields: [conversationParticipants.userId],
      references: [users.id],
    }),
  }),
);

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, { fields: [messages.senderId], references: [users.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const notificationPreferencesRelations = relations(
  notificationPreferences,
  ({ one }) => ({
    user: one(users, {
      fields: [notificationPreferences.userId],
      references: [users.id],
    }),
  }),
);

export const reportsRelations = relations(reports, ({ one }) => ({
  reporter: one(users, {
    fields: [reports.reporterId],
    references: [users.id],
    relationName: "reportReporter",
  }),
  product: one(products, { fields: [reports.productId], references: [products.id] }),
  reportedUser: one(users, {
    fields: [reports.reportedUserId],
    references: [users.id],
    relationName: "reportSubject",
  }),
}));

export const adminAuditLogRelations = relations(adminAuditLog, ({ one }) => ({
  admin: one(users, { fields: [adminAuditLog.adminId], references: [users.id] }),
}));

/* --------------------------- relations: foundation ------------------------- */

export const orderEventsRelations = relations(orderEvents, ({ one }) => ({
  order: one(orders, { fields: [orderEvents.orderId], references: [orders.id] }),
  actor: one(users, { fields: [orderEvents.actorId], references: [users.id] }),
}));

export const stockReservationsRelations = relations(
  stockReservations,
  ({ one }) => ({
    product: one(products, {
      fields: [stockReservations.productId],
      references: [products.id],
    }),
    user: one(users, { fields: [stockReservations.userId], references: [users.id] }),
    order: one(orders, { fields: [stockReservations.orderId], references: [orders.id] }),
  }),
);

export const idempotencyKeysRelations = relations(idempotencyKeys, ({ one }) => ({
  user: one(users, { fields: [idempotencyKeys.userId], references: [users.id] }),
}));

export const platformSettingsRelations = relations(platformSettings, ({ one }) => ({
  updatedByUser: one(users, {
    fields: [platformSettings.updatedBy],
    references: [users.id],
  }),
}));

export const searchHistoryRelations = relations(searchHistory, ({ one }) => ({
  user: one(users, { fields: [searchHistory.userId], references: [users.id] }),
}));

/* --------------------------- relations: admin, growth ---------------------- */

export const rolesRelations = relations(roles, ({ many }) => ({
  grants: many(rolePermissions),
  holders: many(userRoles),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  grants: many(rolePermissions),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  // Both edges to `users` are named — see the note in `usersRelations`.
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
    relationName: "roleGrantee",
  }),
  grantedBy: one(users, {
    fields: [userRoles.grantedBy],
    references: [users.id],
    relationName: "roleGrantor",
  }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
}));

export const userMfaRelations = relations(userMfa, ({ one }) => ({
  user: one(users, { fields: [userMfa.userId], references: [users.id] }),
}));

export const mfaRecoveryCodesRelations = relations(mfaRecoveryCodes, ({ one }) => ({
  user: one(users, { fields: [mfaRecoveryCodes.userId], references: [users.id] }),
}));

export const loginAttemptsRelations = relations(loginAttempts, ({ one }) => ({
  user: one(users, { fields: [loginAttempts.userId], references: [users.id] }),
}));

export const securityEventsRelations = relations(securityEvents, ({ one }) => ({
  user: one(users, { fields: [securityEvents.userId], references: [users.id] }),
}));

export const cmsBannersRelations = relations(cmsBanners, ({ one }) => ({
  createdBy: one(users, { fields: [cmsBanners.createdBy], references: [users.id] }),
}));

export const cmsBlocksRelations = relations(cmsBlocks, ({ one }) => ({
  createdBy: one(users, { fields: [cmsBlocks.createdBy], references: [users.id] }),
}));

export const supportTicketsRelations = relations(supportTickets, ({ one, many }) => ({
  requester: one(users, {
    fields: [supportTickets.userId],
    references: [users.id],
    relationName: "ticketRequester",
  }),
  assignee: one(users, {
    fields: [supportTickets.assigneeId],
    references: [users.id],
    relationName: "ticketAssignee",
  }),
  order: one(orders, { fields: [supportTickets.orderId], references: [orders.id] }),
  messages: many(ticketMessages),
}));

export const ticketMessagesRelations = relations(ticketMessages, ({ one, many }) => ({
  ticket: one(supportTickets, { fields: [ticketMessages.ticketId], references: [supportTickets.id] }),
  author: one(users, { fields: [ticketMessages.authorId], references: [users.id] }),
  attachments: many(ticketAttachments),
}));

export const ticketAttachmentsRelations = relations(ticketAttachments, ({ one }) => ({
  message: one(ticketMessages, {
    fields: [ticketAttachments.ticketMessageId],
    references: [ticketMessages.id],
  }),
}));

export const refundsRelations = relations(refunds, ({ one }) => ({
  order: one(orders, { fields: [refunds.orderId], references: [orders.id] }),
  orderItem: one(orderItems, { fields: [refunds.orderItemId], references: [orderItems.id] }),
  transaction: one(transactions, { fields: [refunds.transactionId], references: [transactions.id] }),
  user: one(users, { fields: [refunds.userId], references: [users.id], relationName: "refundReceiver" }),
  createdBy: one(users, {
    fields: [refunds.createdBy],
    references: [users.id],
    relationName: "refundCreator",
  }),
}));

export const disputesRelations = relations(disputes, ({ one }) => ({
  order: one(orders, { fields: [disputes.orderId], references: [orders.id] }),
  openedBy: one(users, {
    fields: [disputes.openedBy],
    references: [users.id],
    relationName: "disputeOpener",
  }),
  againstUser: one(users, {
    fields: [disputes.againstUserId],
    references: [users.id],
    relationName: "disputeTarget",
  }),
  resolvedBy: one(users, {
    fields: [disputes.resolvedBy],
    references: [users.id],
    relationName: "disputeResolver",
  }),
}));

export const commissionRulesRelations = relations(commissionRules, ({ one }) => ({
  category: one(categories, { fields: [commissionRules.categoryId], references: [categories.id] }),
  seller: one(users, {
    fields: [commissionRules.sellerId],
    references: [users.id],
    relationName: "commissionSeller",
  }),
  createdBy: one(users, {
    fields: [commissionRules.createdBy],
    references: [users.id],
    relationName: "commissionCreator",
  }),
}));

export const sellerVerificationsRelations = relations(sellerVerifications, ({ one }) => ({
  seller: one(users, {
    fields: [sellerVerifications.sellerId],
    references: [users.id],
    relationName: "verificationSeller",
  }),
  reviewedBy: one(users, {
    fields: [sellerVerifications.reviewedBy],
    references: [users.id],
    relationName: "verificationReviewer",
  }),
}));

export const couponsRelations = relations(coupons, ({ one, many }) => ({
  category: one(categories, { fields: [coupons.categoryId], references: [categories.id] }),
  seller: one(users, { fields: [coupons.sellerId], references: [users.id], relationName: "couponSeller" }),
  createdBy: one(users, {
    fields: [coupons.createdBy],
    references: [users.id],
    relationName: "couponCreator",
  }),
  redemptions: many(couponRedemptions),
}));

export const couponRedemptionsRelations = relations(couponRedemptions, ({ one }) => ({
  coupon: one(coupons, { fields: [couponRedemptions.couponId], references: [coupons.id] }),
  user: one(users, { fields: [couponRedemptions.userId], references: [users.id] }),
  order: one(orders, { fields: [couponRedemptions.orderId], references: [orders.id] }),
}));

export const featureFlagsRelations = relations(featureFlags, ({ one }) => ({
  createdBy: one(users, { fields: [featureFlags.createdBy], references: [users.id] }),
}));

export const appConfigRelations = relations(appConfig, ({ one }) => ({
  updatedBy: one(users, { fields: [appConfig.updatedBy], references: [users.id] }),
}));

export const exportJobsRelations = relations(exportJobs, ({ one }) => ({
  requestedBy: one(users, { fields: [exportJobs.requestedBy], references: [users.id] }),
}));

/* =============================================================================
 *  INFERRED TYPES
 *
 *  `$inferSelect` / `$inferInsert` give exact row and insert types straight from
 *  the table definitions above, so a type can never drift from the column it
 *  describes. Server code imports these directly from `./schema`.
 *
 *  (The client cannot import this file — `tsconfig.app.json` does not include
 *  `server/`. Where the client needs the same vocabulary it mirrors it in
 *  `src/lib/types.ts`, and `tests/listing-status.test.ts` asserts the two agree,
 *  which is the existing convention rather than sharing a module across
 *  tsconfigs.)
 * ========================================================================== */

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Address = typeof addresses.$inferSelect;
export type NewAddress = typeof addresses.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type ProductImage = typeof productImages.$inferSelect;
export type NewProductImage = typeof productImages.$inferInsert;
export type ProductTag = typeof productTags.$inferSelect;
export type NewProductTag = typeof productTags.$inferInsert;
export type Favorite = typeof favorites.$inferSelect;
export type NewFavorite = typeof favorites.$inferInsert;
export type Cart = typeof carts.$inferSelect;
export type NewCart = typeof carts.$inferInsert;
export type CartItem = typeof cartItems.$inferSelect;
export type NewCartItem = typeof cartItems.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
export type Rental = typeof rentals.$inferSelect;
export type NewRental = typeof rentals.$inferInsert;
export type RentalEvent = typeof rentalEvents.$inferSelect;
export type NewRentalEvent = typeof rentalEvents.$inferInsert;
export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
export type ReviewHelpfulVote = typeof reviewHelpfulVotes.$inferSelect;
export type NewReviewHelpfulVote = typeof reviewHelpfulVotes.$inferInsert;
export type SellerProfile = typeof sellerProfiles.$inferSelect;
export type NewSellerProfile = typeof sellerProfiles.$inferInsert;
export type SellerPayoutMethod = typeof sellerPayoutMethods.$inferSelect;
export type NewSellerPayoutMethod = typeof sellerPayoutMethods.$inferInsert;
export type Payout = typeof payouts.$inferSelect;
export type NewPayout = typeof payouts.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type NewWalletTransaction = typeof walletTransactions.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type ConversationParticipant = typeof conversationParticipants.$inferSelect;
export type NewConversationParticipant = typeof conversationParticipants.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference = typeof notificationPreferences.$inferInsert;
export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
export type AdminAuditLog = typeof adminAuditLog.$inferSelect;
export type NewAdminAuditLog = typeof adminAuditLog.$inferInsert;
export type OrderEvent = typeof orderEvents.$inferSelect;
export type NewOrderEvent = typeof orderEvents.$inferInsert;
export type StockReservation = typeof stockReservations.$inferSelect;
export type NewStockReservation = typeof stockReservations.$inferInsert;
export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
export type NewIdempotencyKey = typeof idempotencyKeys.$inferInsert;
export type PaymentWebhookEvent = typeof paymentWebhookEvents.$inferSelect;
export type NewPaymentWebhookEvent = typeof paymentWebhookEvents.$inferInsert;
export type PlatformSetting = typeof platformSettings.$inferSelect;
export type NewPlatformSetting = typeof platformSettings.$inferInsert;
export type SearchHistoryEntry = typeof searchHistory.$inferSelect;
export type NewSearchHistoryEntry = typeof searchHistory.$inferInsert;
export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;
export type RolePermission = typeof rolePermissions.$inferSelect;
export type NewRolePermission = typeof rolePermissions.$inferInsert;
/**
 * A grant of a `roles` row to a user.
 *
 * Deliberately **not** named `UserRole`: `server/lib/enums.ts` already exports
 * `UserRole` as the string `"USER" | "SELLER" | "ADMIN"`, and two exports with
 * the same name and different meanings is a bug waiting for a bad import.
 */
export type RoleAssignment = typeof userRoles.$inferSelect;
export type NewRoleAssignment = typeof userRoles.$inferInsert;
export type UserMfa = typeof userMfa.$inferSelect;
export type NewUserMfa = typeof userMfa.$inferInsert;
export type MfaRecoveryCode = typeof mfaRecoveryCodes.$inferSelect;
export type NewMfaRecoveryCode = typeof mfaRecoveryCodes.$inferInsert;
export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type NewLoginAttempt = typeof loginAttempts.$inferInsert;
export type SecurityEvent = typeof securityEvents.$inferSelect;
export type NewSecurityEvent = typeof securityEvents.$inferInsert;
export type CmsBanner = typeof cmsBanners.$inferSelect;
export type NewCmsBanner = typeof cmsBanners.$inferInsert;
export type CmsBlock = typeof cmsBlocks.$inferSelect;
export type NewCmsBlock = typeof cmsBlocks.$inferInsert;
export type SupportTicket = typeof supportTickets.$inferSelect;
export type NewSupportTicket = typeof supportTickets.$inferInsert;
export type TicketMessage = typeof ticketMessages.$inferSelect;
export type NewTicketMessage = typeof ticketMessages.$inferInsert;
export type TicketAttachment = typeof ticketAttachments.$inferSelect;
export type NewTicketAttachment = typeof ticketAttachments.$inferInsert;
export type Refund = typeof refunds.$inferSelect;
export type NewRefund = typeof refunds.$inferInsert;
export type Dispute = typeof disputes.$inferSelect;
export type NewDispute = typeof disputes.$inferInsert;
export type CommissionRule = typeof commissionRules.$inferSelect;
export type NewCommissionRule = typeof commissionRules.$inferInsert;
export type SellerVerification = typeof sellerVerifications.$inferSelect;
export type NewSellerVerification = typeof sellerVerifications.$inferInsert;
export type Coupon = typeof coupons.$inferSelect;
export type NewCoupon = typeof coupons.$inferInsert;
export type CouponRedemption = typeof couponRedemptions.$inferSelect;
export type NewCouponRedemption = typeof couponRedemptions.$inferInsert;
export type FeatureFlag = typeof featureFlags.$inferSelect;
export type NewFeatureFlag = typeof featureFlags.$inferInsert;
export type AppConfigEntry = typeof appConfig.$inferSelect;
export type NewAppConfigEntry = typeof appConfig.$inferInsert;
export type ExportJob = typeof exportJobs.$inferSelect;
export type NewExportJob = typeof exportJobs.$inferInsert;
