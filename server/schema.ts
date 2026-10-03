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
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
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
  /**
   * Where the seller is based. The display name, phone and avatar are
   * deliberately **not** duplicated here: they already live on `users`
   * (`name`, `phone`, `avatarUrl`), and a second copy is a second source of
   * truth that drifts the first time one of the two is updated.
   */
  location: varchar("location", { length: 120 }),
  responseRateHours: int("response_rate_hours"),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
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
    uniqueIndex("transactions_provider_idempotency_key_unique").on(table.providerIdempotencyKey),
    index("transactions_provider_transaction_id_idx").on(table.providerTransactionId),
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
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
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
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
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
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
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
