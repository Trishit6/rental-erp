import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  inArray,
  like,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  adminAuditLog,
  orders,
  payouts,
  products,
  rentals,
  reviews,
  transactions,
  users,
  walletTransactions,
} from "../schema";
import { paginationQuerySchema } from "./api";
import {
  buildOrderListFilters,
  buildOrderListSort,
  ORDER_SORTS,
  ORDER_STATUSES,
  ORDER_TYPES,
  resolveOrderFilters,
  RENTAL_STATUSES,
  type ResolvedOrderFilters,
} from "./order-queries";
import { buildRentalFilters, buildRentalSort, resolveRentalFilters } from "./rental-queries";

/**
 * The admin workspace's server-side queries.
 *
 * ## Why this module exists
 *
 * Admin tables look at the *same* data the customer and seller surfaces do, but
 * through the other end of the telescope: no user scoping (an admin legitimately
 * sees everyone), and a much larger result space — every order, every rental,
 * every account. Reusing `resolveOrderFilters` / `resolveRentalFilters` is
 * deliberate: the customer-facing filter vocabulary has already been worked out
 * (date boundaries, the rental-status namespace, legacy values), and an admin
 * filter that disagreed with the customer's idea of the same words would be a
 * support-ticket generator.
 *
 * Everything is resolved in SQL. A page of twenty rows is what leaves the
 * database, never the whole table — the same rule the customer order history
 * follows, because order history grows without bound regardless of who is reading
 * it.
 */

/* --------------------------------- orders ---------------------------------- */

/**
 * The admin order list query.
 *
 * Deliberately the customer's own list query plus two admin-only extensions:
 * `customer` search matches the buyer's name/email (an admin is usually looking
 * for a person, not a product), and `seller` filters to orders containing that
 * seller's lines.
 */
export const adminOrdersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).catch("").default(""),
  status: z.string().trim().optional().catch(undefined),
  type: z.string().trim().optional().catch(undefined),
  sort: z.string().trim().optional().catch(undefined),
  from: z.string().trim().optional().catch(undefined),
  to: z.string().trim().optional().catch(undefined),
  customer: z.string().trim().max(120).catch("").default(""),
  seller: z.coerce.number().int().positive().nullish(),
  paymentStatus: z.string().trim().optional().catch(undefined),
});

export type AdminOrdersQuery = z.infer<typeof adminOrdersQuerySchema>;

export type AdminOrderRow = {
  id: number;
  orderNumber: string | null;
  orderType: string;
  status: string;
  paymentStatus: string;
  total: number;
  currency: string;
  itemCount: number | null;
  customerName: string;
  customerEmail: string;
  createdAt: Date;
};

/** Admin-only extensions over the customer's own order predicates. */
function adminOrderConditions(query: AdminOrdersQuery): SQL[] {
  const conditions: SQL[] = [];

  if (query.customer) {
    const pattern = `%${query.customer}%`;
    conditions.push(
      exists(
        sql`(SELECT 1 FROM users u
             WHERE u.id = ${orders.userId} AND (u.name LIKE ${pattern} OR u.email LIKE ${pattern}))`,
      )!,
    );
  }
  if (query.seller) {
    conditions.push(
      exists(
        sql`(SELECT 1 FROM order_items oi
             WHERE oi.order_id = ${orders.id} AND oi.seller_id = ${query.seller})`,
      )!,
    );
  }
  if (query.paymentStatus) {
    const allowed = ["PENDING", "PROCESSING", "PAID", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"];
    if ((allowed as string[]).includes(query.paymentStatus)) {
      conditions.push(eq(orders.paymentStatus, query.paymentStatus));
    }
  }

  return conditions;
}

export async function listAdminOrders(query: AdminOrdersQuery): Promise<{
  rows: AdminOrderRow[];
  total: number;
}> {
  const resolved: ResolvedOrderFilters = resolveOrderFilters({
    search: query.search,
    status: query.status,
    type: query.type,
    sort: query.sort,
    from: query.from,
    to: query.to,
    page: query.page,
    pageSize: query.pageSize,
  });
  const where = and(buildOrderListFilters(resolved), ...adminOrderConditions(query));

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        orderType: orders.orderType,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        total: orders.total,
        currency: orders.currency,
        customerName: users.name,
        customerEmail: users.email,
        createdAt: orders.createdAt,
        itemCount: sql<number>`(SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = ${orders.id})`,
      })
      .from(orders)
      .innerJoin(users, eq(orders.userId, users.id))
      .where(where)
      .orderBy(...buildOrderListSort(resolved.sort))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ value: count() }).from(orders).innerJoin(users, eq(orders.userId, users.id)).where(where),
  ]);

  return {
    rows: rows.map((row) => ({ ...row, itemCount: Number(row.itemCount ?? 0) })),
    total: Number(totalRow.value),
  };
}

/* --------------------------------- rentals --------------------------------- */

/**
 * The admin rental list. Same filters the renter surface accepts (status, bucket,
 * search over product/order number/rental id), but never user-scoped.
 */
export const adminRentalsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).catch("").default(""),
  status: z.string().trim().optional().catch(undefined),
  bucket: z.string().trim().optional().catch(undefined),
  sort: z.string().trim().optional().catch(undefined),
  from: z.string().trim().optional().catch(undefined),
  to: z.string().trim().optional().catch(undefined),
  /**
   * The "returns" view: rentals whose item actually came back.
   *
   * Not expressible as a bucket. `completed` is `RETURNED | COMPLETED | CANCELLED`
   * (`CLOSED_STATUSES`), and a cancelled rental has no returned item — so reusing the
   * bucket would put cancellations on a returns screen, which is precisely the record
   * somebody checking a returns report most needs to *not* see. Declared as a boolean
   * here rather than reusing a status filter, because it spans exactly two statuses.
   */
  returned: z
    .union([z.literal(true), z.literal("true"), z.literal("1"), z.literal(1)])
    .optional()
    .catch(undefined),
});

export type AdminRentalsQuery = z.infer<typeof adminRentalsQuerySchema>;

export type AdminRentalRow = {
  id: number;
  status: string;
  startDate: Date;
  endDate: Date;
  actualReturnDate: Date | null;
  rentalSubtotal: number;
  securityDeposit: number;
  total: number;
  title: string;
  productSlug: string;
  orderNumber: string | null;
  renterName: string;
  ownerName: string;
  createdAt: Date;
};

export async function listAdminRentals(query: AdminRentalsQuery): Promise<{
  rows: AdminRentalRow[];
  total: number;
}> {
  const resolved = resolveRentalFilters({
    search: query.search,
    status: query.status,
    bucket: query.bucket,
    sort: query.sort,
    from: query.from,
    to: query.to,
    page: query.page,
    pageSize: query.pageSize,
    // Role is meaningless to an admin: the whole table is the scope.
    role: "all",
  });
  // The returned-item view is applied *after* the shared filter builder, because
  // `resolveRentalFilters` is the customer list's vocabulary and has no such concept —
  // a renter asking for "my returns" is asking for a bucket, an administrator is asking
  // which items came back. Both compose, so the admin condition is ANDed on.
  const baseWhere = buildRentalFilters(resolved);
  const where =
    query.returned === true
      ? and(baseWhere, inArray(rentals.status, ["RETURNED", "COMPLETED"]))
      : baseWhere;

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: rentals.id,
        status: rentals.status,
        startDate: rentals.startDate,
        endDate: rentals.endDate,
        actualReturnDate: rentals.actualReturnDate,
        rentalSubtotal: rentals.rentalSubtotal,
        securityDeposit: rentals.securityDeposit,
        total: rentals.total,
        title: products.title,
        productSlug: products.slug,
        orderNumber: orders.orderNumber,
        renterName: sql<string>`(SELECT u.name FROM users u WHERE u.id = ${rentals.renterId})`,
        ownerName: sql<string>`(SELECT u.name FROM users u WHERE u.id = ${rentals.ownerId})`,
        createdAt: rentals.createdAt,
      })
      .from(rentals)
      .innerJoin(products, eq(rentals.productId, products.id))
      .innerJoin(orders, eq(rentals.orderId, orders.id))
      .where(where)
      .orderBy(...buildRentalSort(resolved.sort))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ value: count() }).from(rentals).where(where),
  ]);

  return { rows, total: Number(totalRow.value) };
}

/* ---------------------------------- users ---------------------------------- */

export const adminUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).catch("").default(""),
  role: z.enum(["USER", "SELLER", "ADMIN", "SUSPENDED"]).nullish(),
  sort: z.enum(["newest", "oldest", "name"]).catch("newest").default("newest"),
});

export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;

export type AdminUserRow = {
  id: number;
  name: string;
  email: string;
  role: string;
  verified: boolean;
  orders: number;
  rentals: number;
  isSeller: boolean;
  sellerVerified: boolean | null;
  createdAt: Date;
};

export async function listAdminUsers(query: AdminUsersQuery): Promise<{
  rows: AdminUserRow[];
  total: number;
}> {
  const conditions: SQL[] = [];
  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(or(like(users.name, pattern), like(users.email, pattern))!);
  }
  if (query.role === "SUSPENDED") {
    // "Suspended" is the role the suspend endpoint writes; see admin.ts.
    conditions.push(eq(users.role, "SUSPENDED"));
  } else if (query.role) {
    conditions.push(eq(users.role, query.role));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const order =
    query.sort === "oldest"
      ? [asc(users.createdAt), asc(users.id)]
      : query.sort === "name"
        ? [asc(users.name), asc(users.id)]
        : [desc(users.createdAt), desc(users.id)];

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        verified: users.verified,
        createdAt: users.createdAt,
        orders: sql<number>`(SELECT COUNT(*) FROM orders o WHERE o.user_id = ${users.id})`,
        rentals: sql<number>`(SELECT COUNT(*) FROM rentals r WHERE r.renter_id = ${users.id})`,
        isSeller: sql<boolean>`EXISTS (SELECT 1 FROM seller_profiles sp WHERE sp.user_id = ${users.id})`,
        sellerVerified: sql<boolean | null>`(SELECT sp.verified FROM seller_profiles sp WHERE sp.user_id = ${users.id} LIMIT 1)`,
      })
      .from(users)
      .where(where)
      .orderBy(...order)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ value: count() }).from(users).where(where),
  ]);

  return {
    rows: rows.map((row) => ({
      ...row,
      orders: Number(row.orders ?? 0),
      rentals: Number(row.rentals ?? 0),
    })),
    total: Number(totalRow.value),
  };
}

/* --------------------------------- sellers --------------------------------- */

export const adminSellersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).catch("").default(""),
  status: z.enum(["verified", "unverified", "suspended"]).nullish(),
});

export type AdminSellersQuery = z.infer<typeof adminSellersQuerySchema>;

export type AdminSellerRow = {
  id: number;
  name: string;
  email: string;
  location: string | null;
  verified: boolean;
  suspended: boolean;
  products: number;
  orders: number;
  rentals: number;
  revenue: number;
  createdAt: Date;
};

export async function listAdminSellers(query: AdminSellersQuery): Promise<{
  rows: AdminSellerRow[];
  total: number;
}> {
  // `SUSPENDED` joins the role list on purpose. A seller whose account was suspended
  // keeps their seller profile but has `role = 'SUSPENDED'`, so the original
  // `["SELLER","ADMIN"]` list made `status=suspended` return zero rows — the base role
  // filter and the suspended filter contradicted each other, and the screen silently
  // showed nothing instead of an error. Keeping them means "suspended" is a view an
  // administrator can actually reach.
  const conditions: SQL[] = [inArray(users.role, ["SELLER", "ADMIN", "SUSPENDED"])];
  if (query.search) {
    const pattern = `%${query.search}%`;
    // Location lives on `seller_profiles`, which is not in this query's FROM list, so
    // it has to be reached through a correlated subquery. Referencing the column
    // directly (`like(products.location, …)`) made this endpoint fail outright with
    // "Unknown column" — searching sellers was a 500, not a filter.
    conditions.push(
      or(
        like(users.name, pattern),
        like(users.email, pattern),
        sql`(SELECT sp.location FROM seller_profiles sp WHERE sp.user_id = ${users.id}) LIKE ${pattern}`,
      )!,
    );
  }
  if (query.status === "verified") conditions.push(eq(users.verified, true));
  if (query.status === "unverified") conditions.push(eq(users.verified, false));
  if (query.status === "suspended") conditions.push(eq(users.role, "SUSPENDED"));
  const where = and(...conditions);

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        verified: users.verified,
        createdAt: users.createdAt,
        location: sql<string | null>`(SELECT sp.location FROM seller_profiles sp WHERE sp.user_id = ${users.id} LIMIT 1)`,
        products: sql<number>`(SELECT COUNT(*) FROM products p WHERE p.seller_id = ${users.id})`,
        orders: sql<number>`(SELECT COUNT(DISTINCT oi.order_id) FROM order_items oi WHERE oi.seller_id = ${users.id})`,
        rentals: sql<number>`(SELECT COUNT(*) FROM rentals r WHERE r.owner_id = ${users.id})`,
        revenue: sql<number>`(SELECT COALESCE(SUM(wt.amount), 0) FROM wallet_transactions wt
             WHERE wt.seller_id = ${users.id} AND wt.type IN ('SALE','RENTAL')
               AND wt.status <> 'REVERSED')`,
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ value: count() }).from(users).where(where),
  ]);

  return {
    rows: rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      location: row.location,
      verified: Boolean(row.verified),
      suspended: row.role === "SUSPENDED",
      products: Number(row.products ?? 0),
      orders: Number(row.orders ?? 0),
      rentals: Number(row.rentals ?? 0),
      revenue: Number(row.revenue ?? 0),
      createdAt: row.createdAt,
    })),
    total: Number(totalRow.value),
  };
}

/* --------------------------------- finance --------------------------------- */

export type AdminFinanceSummary = {
  /** Orders not still PENDING_PAYMENT — the same revenue boundary /admin/stats uses. */
  grossRevenue: number;
  /** What sellers were credited (gross earnings rows, unreversed). */
  sellerEarnings: number;
  /** The platform's cut (PLATFORM_FEE rows, unreversed). */
  platformEarnings: number;
  /** Refund-shaped ledger rows (customer refunds owed/settled). */
  refunds: number;
  /** SUM over PENDING/PROCESSING payouts. */
  pendingPayouts: number;
  /** SUM over COMPLETED payouts. */
  completedPayouts: number;
  currency: string;
};

export async function getAdminFinanceSummary(): Promise<AdminFinanceSummary> {
  const [revenueRow] = await db
    .select({ value: sql<number>`COALESCE(SUM(${orders.total}), 0)` })
    .from(orders)
    .where(sql`${orders.status} <> 'PENDING_PAYMENT'`);

  const [walletRow] = await db
    .select({
      earnings: sql<number>`COALESCE(SUM(CASE WHEN ${walletTransactions.type} IN ('SALE','RENTAL') AND ${walletTransactions.status} <> 'REVERSED' THEN ${walletTransactions.amount} ELSE 0 END), 0)`,
      fees: sql<number>`COALESCE(SUM(CASE WHEN ${walletTransactions.type} = 'PLATFORM_FEE' AND ${walletTransactions.status} <> 'REVERSED' THEN ${walletTransactions.amount} ELSE 0 END), 0)`,
      refunds: sql<number>`COALESCE(SUM(CASE WHEN ${walletTransactions.type} = 'REFUND' AND ${walletTransactions.status} <> 'REVERSED' THEN ${walletTransactions.amount} ELSE 0 END), 0)`,
    })
    .from(walletTransactions);

  const [payoutRow] = await db
    .select({
      pending: sql<number>`COALESCE(SUM(CASE WHEN ${payouts.status} IN ('PENDING','PROCESSING') THEN ${payouts.amount} ELSE 0 END), 0)`,
      completed: sql<number>`COALESCE(SUM(CASE WHEN ${payouts.status} = 'COMPLETED' THEN ${payouts.amount} ELSE 0 END), 0)`,
    })
    .from(payouts);

  return {
    grossRevenue: Number(revenueRow?.value ?? 0),
    sellerEarnings: Number(walletRow?.earnings ?? 0),
    // Fees are stored negative; report the magnitude.
    platformEarnings: Math.abs(Number(walletRow?.fees ?? 0)),
    refunds: Math.abs(Number(walletRow?.refunds ?? 0)),
    pendingPayouts: Number(payoutRow?.pending ?? 0),
    completedPayouts: Number(payoutRow?.completed ?? 0),
    currency: "INR",
  };
}

/* ------------------------------- transactions ------------------------------- */

export const adminTransactionsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).catch("").default(""),
  status: z.string().trim().optional().catch(undefined),
  type: z.string().trim().optional().catch(undefined),
});

export type AdminTransactionsQuery = z.infer<typeof adminTransactionsQuerySchema>;

export type AdminTransactionRow = {
  id: number;
  type: string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  providerTransactionId: string | null;
  paymentMethod: string | null;
  failureReason: string | null;
  orderNumber: string | null;
  customerName: string;
  createdAt: Date;
};

const TRANSACTION_STATUSES = [
  "PENDING",
  "PROCESSING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
];
const TRANSACTION_TYPES = ["PAYMENT", "REFUND", "PAYOUT"];

export async function listAdminTransactions(query: AdminTransactionsQuery): Promise<{
  rows: AdminTransactionRow[];
  total: number;
}> {
  const conditions: SQL[] = [];
  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(
      or(
        like(transactions.providerTransactionId, pattern),
        like(orders.orderNumber, pattern),
        like(users.email, pattern),
      )!,
    );
  }
  if (query.status && (TRANSACTION_STATUSES as string[]).includes(query.status)) {
    conditions.push(eq(transactions.status, query.status));
  }
  if (query.type && (TRANSACTION_TYPES as string[]).includes(query.type)) {
    conditions.push(eq(transactions.type, query.type));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: transactions.id,
        type: transactions.type,
        amount: transactions.amount,
        currency: transactions.currency,
        status: transactions.status,
        provider: transactions.provider,
        providerTransactionId: transactions.providerTransactionId,
        paymentMethod: transactions.paymentMethod,
        failureReason: transactions.failureReason,
        orderNumber: orders.orderNumber,
        customerName: users.name,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .leftJoin(orders, eq(transactions.orderId, orders.id))
      .innerJoin(users, eq(transactions.userId, users.id))
      .where(where)
      .orderBy(desc(transactions.createdAt), desc(transactions.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({ value: count() })
      .from(transactions)
      .leftJoin(orders, eq(transactions.orderId, orders.id))
      .innerJoin(users, eq(transactions.userId, users.id))
      .where(where),
  ]);

  return { rows, total: Number(totalRow.value) };
}

/* --------------------------------- reviews ---------------------------------- */

export const adminReviewsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).catch("").default(""),
  status: z.enum(["PUBLISHED", "HIDDEN", "PENDING"]).nullish(),
  scope: z.enum(["product", "seller"]).catch("product").default("product"),
});

export type AdminReviewsQuery = z.infer<typeof adminReviewsQuerySchema>;

export type AdminReviewRow = {
  id: number;
  rating: number;
  title: string | null;
  comment: string;
  status: string;
  purchaseType: string;
  isVerifiedPurchase: boolean;
  reviewerName: string;
  productTitle: string | null;
  productSlug: string | null;
  sellerName: string | null;
  createdAt: Date;
};

export async function listAdminReviews(query: AdminReviewsQuery): Promise<{
  rows: AdminReviewRow[];
  total: number;
}> {
  const conditions: SQL[] = [];
  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(or(like(reviews.comment, pattern), like(users.name, pattern))!);
  }
  if (query.status) conditions.push(eq(reviews.status, query.status));
  if (query.scope === "seller") conditions.push(isNotNullSellerReply());
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        title: reviews.title,
        comment: reviews.comment,
        status: reviews.status,
        purchaseType: reviews.purchaseType,
        isVerifiedPurchase: reviews.isVerifiedPurchase,
        reviewerName: users.name,
        productTitle: products.title,
        productSlug: products.slug,
        sellerName: sql<string | null>`(SELECT u.name FROM users u WHERE u.id = ${reviews.sellerId})`,
        createdAt: reviews.createdAt,
      })
      .from(reviews)
      .innerJoin(users, eq(reviews.userId, users.id))
      .leftJoin(products, eq(reviews.productId, products.id))
      .where(where)
      .orderBy(desc(reviews.createdAt), desc(reviews.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({ value: count() })
      .from(reviews)
      .innerJoin(users, eq(reviews.userId, users.id))
      .leftJoin(products, eq(reviews.productId, products.id))
      .where(where),
  ]);

  return { rows, total: Number(totalRow.value) };
}

/**
 * "Seller reviews" scope: reviews about a *seller's service*. The data model has
 * one review entity (about a product line); the closest honest filter is "reviews
 * that carry a seller reply", i.e. ones where a seller actively engaged. Inventing
 * a second review type would create data that nothing writes.
 */
function isNotNullSellerReply(): SQL {
  return sql`${reviews.sellerReply} IS NOT NULL`;
}

/* -------------------------------- audit log --------------------------------- */

export const adminAuditQuerySchema = paginationQuerySchema.extend({
  action: z.string().trim().max(40).catch("").default(""),
  entityType: z.string().trim().max(20).catch("").default(""),
});

export type AdminAuditQuery = z.infer<typeof adminAuditQuerySchema>;

export type AdminAuditRow = {
  id: number;
  adminId: number;
  adminName: string;
  action: string;
  entityType: string;
  entityId: number | null;
  details: string | null;
  createdAt: Date;
};

export async function listAdminAuditLog(query: AdminAuditQuery): Promise<{
  rows: AdminAuditRow[];
  total: number;
}> {
  const conditions: SQL[] = [];
  if (query.action) conditions.push(like(adminAuditLog.action, `%${query.action}%`));
  if (query.entityType) conditions.push(eq(adminAuditLog.entityType, query.entityType));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: adminAuditLog.id,
        adminId: adminAuditLog.adminId,
        adminName: users.name,
        action: adminAuditLog.action,
        entityType: adminAuditLog.entityType,
        entityId: adminAuditLog.entityId,
        details: adminAuditLog.details,
        createdAt: adminAuditLog.createdAt,
      })
      .from(adminAuditLog)
      .innerJoin(users, eq(adminAuditLog.adminId, users.id))
      .where(where)
      .orderBy(desc(adminAuditLog.createdAt), desc(adminAuditLog.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({ value: count() })
      .from(adminAuditLog)
      .innerJoin(users, eq(adminAuditLog.adminId, users.id))
      .where(where),
  ]);

  return { rows, total: Number(totalRow.value) };
}

/* ------------------------------ vocabularies -------------------------------- */

/** Statuses the admin order table can filter by — the customer's vocabulary plus the rental namespace. */
export const ADMIN_ORDER_STATUS_FILTERS = [...ORDER_STATUSES];
export const ADMIN_RENTAL_STATUS_FILTERS = [...RENTAL_STATUSES];
export const ADMIN_ORDER_SORTS = [...ORDER_SORTS];
export const ADMIN_ORDER_TYPES = [...ORDER_TYPES];
