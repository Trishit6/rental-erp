import {
  boolean,
  double,
  index,
  int,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";

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
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const sessions = mysqlTable(
  "sessions",
  {
    // Primary key is the SHA-256 hash of the opaque session token — raw tokens never touch the DB.
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at").notNull().defaultNow(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
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
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
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
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
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
    listingType: varchar("listing_type", { length: 8 }).notNull().default("SALE"),
    status: varchar("status", { length: 16 }).notNull().default("ACTIVE"),
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
    allowsDelivery: boolean("allows_delivery").notNull().default(true),
    allowsPickup: boolean("allows_pickup").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("products_slug_unique").on(table.slug),
    index("products_seller_id_idx").on(table.sellerId),
    index("products_category_id_idx").on(table.categoryId),
    index("products_status_idx").on(table.status),
    index("products_listing_type_idx").on(table.listingType),
    index("products_created_at_idx").on(table.createdAt),
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
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
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
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
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
    paymentStatus: varchar("payment_status", { length: 20 })
      .notNull()
      .default("PENDING"),
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
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("orders_user_id_idx").on(table.userId),
    index("orders_status_idx").on(table.status),
    uniqueIndex("orders_order_number_unique").on(table.orderNumber),
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
    imageSnapshot: varchar("image_snapshot", { length: 500 }),
    startDate: timestamp("start_date", { mode: "date" }),
    endDate: timestamp("end_date", { mode: "date" }),
    rentalDays: int("rental_days"),
    rentCreditApplied: int("rent_credit_applied").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("order_items_order_id_idx").on(table.orderId),
    index("order_items_product_id_idx").on(table.productId),
    index("order_items_seller_id_idx").on(table.sellerId),
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
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("rentals_product_id_idx").on(table.productId),
    index("rentals_start_date_idx").on(table.startDate),
    index("rentals_end_date_idx").on(table.endDate),
    index("rentals_renter_id_idx").on(table.renterId),
    index("rentals_owner_id_idx").on(table.ownerId),
    index("rentals_status_idx").on(table.status),
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
    rentalId: int("rental_id").references(() => rentals.id, { onDelete: "set null" }),
    rating: int("rating").notNull(),
    title: varchar("title", { length: 120 }),
    comment: text().notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("reviews_product_id_idx").on(table.productId),
    index("reviews_seller_id_idx").on(table.sellerId),
    uniqueIndex("reviews_user_order_product_unique").on(
      table.userId,
      table.orderId,
      table.productId,
    ),
  ],
);

/* --------------------------------- messages -------------------------------- */

export const conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("product_id").references(() => products.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastMessageAt: timestamp("last_message_at").notNull().defaultNow(),
});

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
  (table) => [index("messages_conversation_id_idx").on(table.conversationId)],
);

/* ------------------------------ notifications ------------------------------ */

export const notifications = mysqlTable(
  "notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 32 }).notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    body: varchar("body", { length: 300 }),
    link: varchar("link", { length: 200 }),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("notifications_user_id_idx").on(table.userId)],
);

/* ---------------------------------- reports -------------------------------- */

export const reports = mysqlTable("reports", {
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
  status: varchar("status", { length: 12 }).notNull().default("OPEN"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ------------------------------ seller profiles ----------------------------- */

export const sellerProfiles = mysqlTable("seller_profiles", {
  userId: int("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  bio: varchar("bio", { length: 500 }),
  responseRateHours: int("response_rate_hours"),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
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
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
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
    uniqueIndex("transactions_provider_idempotency_key_unique").on(
      table.providerIdempotencyKey,
    ),
    index("transactions_provider_transaction_id_idx").on(table.providerTransactionId),
  ],
);
