import { and, asc, desc, eq, gte, like, lte, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { orderItems, orders, products, users } from "../schema";
import { HttpError } from "./api";
import { toFulfillmentAddress } from "./address-snapshot";
import { effectiveFulfillment } from "./order-fulfillment";

/**
 * Seller-side order queries.
 *
 * ## The rule this module exists to enforce
 *
 * A seller may only ever see **their own lines** of an order. A customer order
 * can (and will) contain products from several sellers, so the naive query —
 * load the order, load its items, filter for display — hands every seller the
 * whole order and relies on the UI to hide the rest. That is a data breach with
 * extra steps: the response is on the wire, and anything in it is readable.
 *
 * So seller ownership is **in the WHERE clause of every query here**, alongside
 * the identifier, never as a check afterwards:
 *
 *  - the list joins `order_items` filtered by `seller_id`, so the aggregates
 *    (item count, subtotal) are computed from the seller's lines only;
 *  - the detail looks the order up *through* its items, so another seller's
 *    order is the same 404 as an order that does not exist;
 *  - search never matches another seller's `title_snapshot` (see below).
 */

/** Everything a seller can filter or sort their order list by. */
export const sellerOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).catch(20).default(20),
  search: z.string().trim().max(120).catch("").default(""),
  status: z.string().trim().optional().catch(undefined),
  paymentStatus: z.string().trim().optional().catch(undefined),
  from: z.string().trim().optional().catch(undefined),
  to: z.string().trim().optional().catch(undefined),
  sort: z.string().trim().optional().catch(undefined),
});

export type SellerOrdersQuery = z.infer<typeof sellerOrdersQuerySchema>;

/**
 * Tabs, in lifecycle order, using the existing order vocabulary. `CONFIRMED`
 * leads because a line's status before a seller acts is the order's own status,
 * which is `CONFIRMED` once payment has settled.
 */
export const SELLER_ORDER_STATUS_FILTERS = [
  "CONFIRMED",
  "PROCESSING",
  "READY_FOR_PICKUP",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
] as const;

export type SellerOrderStatusFilter = (typeof SELLER_ORDER_STATUS_FILTERS)[number];

export const SELLER_ORDER_SORTS = ["newest", "oldest", "total_desc", "total_asc"] as const;
export type SellerOrderSort = (typeof SELLER_ORDER_SORTS)[number];

/**
 * Payment states a seller may filter by. Read from `orders.payment_status`,
 * which is the existing money lifecycle — this module never derives payment
 * state, and there is deliberately no way for a seller to set it.
 */
export const SELLER_PAYMENT_STATUSES = [
  "PENDING",
  "PROCESSING",
  "PAID",
  "FAILED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
] as const;

/**
 * Rank of a *line's* effective fulfillment, for the "least advanced line" rollup.
 *
 * `CANCELLED` ranks above everything so it only wins when it is the only thing
 * left — an order with one cancelled line and one shipped line is not "cancelled".
 * An unrecognised value ranks last-but-one rather than throwing: the column is a
 * `varchar`, so a value written by a future feature must still render.
 */
const RANK_SQL = sql`CASE COALESCE(${orderItems.fulfillmentStatus}, ${orders.status})
  WHEN 'PENDING_PAYMENT' THEN 0
  WHEN 'CONFIRMED' THEN 1
  WHEN 'PROCESSING' THEN 2
  WHEN 'READY_FOR_PICKUP' THEN 3
  WHEN 'SHIPPED' THEN 4
  WHEN 'DELIVERED' THEN 5
  WHEN 'COMPLETED' THEN 6
  WHEN 'CANCELLED' THEN 7
  ELSE 8 END`;

const RANK_BY_STATUS: Record<string, number> = {
  PENDING_PAYMENT: 0,
  CONFIRMED: 1,
  PROCESSING: 2,
  READY_FOR_PICKUP: 3,
  SHIPPED: 4,
  DELIVERED: 5,
  COMPLETED: 6,
  CANCELLED: 7,
};

const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseBoundary(value: string | undefined, endOfDay: boolean): Date | null {
  if (!value) return null;
  const suffix = BARE_DATE.test(value) ? (endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z") : "";
  const parsed = new Date(`${value}${suffix}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export type ResolvedSellerOrderFilters = {
  page: number;
  pageSize: number;
  search: string;
  status: SellerOrderStatusFilter | null;
  paymentStatus: string | null;
  sort: SellerOrderSort;
  from: Date | null;
  to: Date | null;
};

export function resolveSellerOrderFilters(raw: unknown): ResolvedSellerOrderFilters {
  const parsed = sellerOrdersQuerySchema.parse(raw ?? {});
  return {
    page: parsed.page,
    pageSize: parsed.pageSize,
    search: parsed.search.trim(),
    status: (SELLER_ORDER_STATUS_FILTERS as readonly string[]).includes(parsed.status ?? "")
      ? (parsed.status as SellerOrderStatusFilter)
      : null,
    paymentStatus: (SELLER_PAYMENT_STATUSES as readonly string[]).includes(
      parsed.paymentStatus ?? "",
    )
      ? (parsed.paymentStatus as string)
      : null,
    sort: (SELLER_ORDER_SORTS as readonly string[]).includes(parsed.sort ?? "")
      ? (parsed.sort as SellerOrderSort)
      : "newest",
    from: parseBoundary(parsed.from, false),
    to: parseBoundary(parsed.to, true),
  };
}

/**
 * Conditions that are **order-level**, so they can be applied without corrupting
 * the aggregates.
 *
 * This distinction is the whole reason this function is separate from the join:
 * a predicate that mentions `order_items.title_snapshot` and is evaluated per
 * joined row would drop the seller's *other* lines out of the SUM, silently
 * under-reporting their subtotal. Written as an EXISTS over the seller's own
 * lines it is a property of the order, and every one of that seller's lines is
 * still counted.
 */
export function buildSellerOrderConditions(
  sellerId: number,
  filters: ResolvedSellerOrderFilters,
): SQL[] {
  const conditions: SQL[] = [];

  if (filters.search) {
    const pattern = `%${filters.search}%`;
    conditions.push(
      or(
        like(orders.orderNumber, pattern),
        like(users.name, pattern),
        // Only *this seller's* line titles. Matching the whole order's items
        // would let a seller find an order by typing a competitor's product
        // name — a search that answers with another seller's inventory.
        sql`EXISTS (SELECT 1 FROM order_items mine
                    WHERE mine.order_id = ${orders.id}
                      AND mine.seller_id = ${sellerId}
                      AND mine.title_snapshot LIKE ${pattern})`,
      )!,
    );
  }

  if (filters.paymentStatus) conditions.push(eq(orders.paymentStatus, filters.paymentStatus));
  if (filters.from) conditions.push(gte(orders.createdAt, filters.from));
  if (filters.to) conditions.push(lte(orders.createdAt, filters.to));

  return conditions;
}

/**
 * The seller-visible fulfillment filter, applied as a HAVING over the rollup
 * rank. An order counts as being in a state when its **least advanced** line is
 * in that state — a partly-shipped order is not "shipped".
 */
export function buildSellerOrderHaving(filters: ResolvedSellerOrderFilters): SQL | undefined {
  if (!filters.status) return undefined;
  const rank = RANK_BY_STATUS[filters.status];
  if (rank === undefined) return undefined;
  return sql`MIN(${RANK_SQL}) = ${rank}`;
}

export function buildSellerOrderSort(sort: SellerOrderSort) {
  switch (sort) {
    case "oldest":
      return [asc(orders.createdAt), asc(orders.id)];
    case "total_desc":
      return [desc(sql`SUM(${orderItems.lineTotal})`), desc(orders.id)];
    case "total_asc":
      return [asc(sql`SUM(${orderItems.lineTotal})`), asc(orders.id)];
    case "newest":
    default:
      // `id` breaks ties so pagination is stable when two orders share a
      // timestamp — without it, page 2 can repeat a row from page 1.
      return [desc(orders.createdAt), desc(orders.id)];
  }
}

export type SellerOrderSummary = {
  id: number;
  orderNumber: string | null;
  status: string;
  /** The seller's own rollup, which is what their tabs are built from. */
  fulfillmentStatus: string;
  paymentStatus: string;
  itemCount: number;
  /** Units across the seller's lines, so "2 items" means what it says. */
  unitCount: number;
  /** From `order_items.line_total` for this seller, never the order total. */
  sellerSubtotal: number;
  currency: string;
  deliveryMethod: string;
  createdAt: string;
  customerName: string | null;
  /** Next moves available to the seller, computed by the state machine. */
  canCancel: boolean;
};

/**
 * One page of the seller's orders, newest first by default.
 *
 * Two queries, ever: the page itself, and the count. No per-order follow-up, so
 * a 20-row page costs the same as a 1-row page.
 */
export async function listSellerOrders(
  sellerId: number,
  filters: ResolvedSellerOrderFilters,
): Promise<{ rows: SellerOrderSummary[]; total: number }> {
  const conditions = buildSellerOrderConditions(sellerId, filters);
  const having = buildSellerOrderHaving(filters);

  const where = and(eq(orderItems.sellerId, sellerId), ...conditions);

  // `$dynamic()` so the HAVING can be added only when a status filter is set,
  // while the SQL is still generated in the one legal order.
  const rowsQuery = db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      currency: orders.currency,
      deliveryMethod: orders.deliveryMethod,
      createdAt: orders.createdAt,
      customerName: users.name,
      itemCount: sql<number>`COUNT(${orderItems.id})`,
      unitCount: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)`,
      sellerSubtotal: sql<number>`COALESCE(SUM(${orderItems.lineTotal}), 0)`,
      rank: sql<number>`MIN(${RANK_SQL})`,
    })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .innerJoin(users, eq(users.id, orders.userId))
    .where(where)
    .groupBy(orders.id)
    .$dynamic();

  if (having) rowsQuery.having(having);

  const rows = await rowsQuery
    .orderBy(...buildSellerOrderSort(filters.sort))
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);

  const countQuery = db.select({ total: sql<number>`COUNT(*)` }).from(
    db
      .select({ id: orders.id })
      .from(orders)
      .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
      .innerJoin(users, eq(users.id, orders.userId))
      .where(where)
      .groupBy(orders.id)
      .having(having ?? sql`1 = 1`)
      .as("seller_orders"),
  );

  const [[counted]] = await Promise.all([countQuery]);

  return {
    total: Number(counted?.total ?? 0),
    rows: rows.map((row) => {
      const fulfillmentStatus = rankToStatus(Number(row.rank), row.status);
      return {
        id: row.id,
        orderNumber: row.orderNumber,
        status: row.status,
        fulfillmentStatus,
        paymentStatus: row.paymentStatus,
        itemCount: Number(row.itemCount),
        unitCount: Number(row.unitCount),
        sellerSubtotal: Number(row.sellerSubtotal),
        currency: row.currency,
        deliveryMethod: row.deliveryMethod,
        createdAt: row.createdAt.toISOString(),
        customerName: row.customerName,
        canCancel: ["CONFIRMED", "PROCESSING", "READY_FOR_PICKUP"].includes(fulfillmentStatus),
      };
    }),
  };
}

function rankToStatus(rank: number, orderStatus: string): string {
  const byRank = Object.entries(RANK_BY_STATUS).find(([, value]) => value === rank);
  return byRank ? byRank[0] : effectiveFulfillment(null, orderStatus);
}

export type SellerOrderLine = {
  id: number;
  productId: number;
  productSlug: string | null;
  title: string;
  imageUrl: string | null;
  condition: string | null;
  mode: string;
  quantity: number;
  unitPrice: number;
  rentalCharge: number;
  securityDeposit: number;
  lineTotal: number;
  fulfillmentStatus: string;
  startDate: string | null;
  endDate: string | null;
  rentalDays: number | null;
};

export type SellerOrderDetail = {
  order: SellerOrderSummary & {
    paymentProvider: string;
    paymentReference: string | null;
    placedAt: string;
  };
  /** Only this seller's lines. Never the whole order. */
  items: SellerOrderLine[];
  delivery: { method: string; address: ReturnType<typeof toFulfillmentAddress> };
  /** Contact details needed to fulfil this order, and nothing else. */
  customer: { name: string | null; phone: string | null };
  timeline: { key: string; label: string; at: string | null; state: string }[];
  actions: { next: string[]; canCancel: boolean; canSetFulfillment: boolean };
};

/**
 * One order, as the seller of its lines may see it.
 *
 * The order is reached **through** the seller's items (`WHERE order_id = ? AND
 * seller_id = ?`) rather than fetched and then filtered, so a request for
 * another seller's order cannot succeed far enough to be told apart from a
 * non-existent one. Both are a 404 — a 403 would confirm the order number is
 * real, which is exactly what an IDOR probe is looking for.
 */
export async function getSellerOrder(
  sellerId: number,
  reference: string | number,
): Promise<SellerOrderDetail> {
  const [orderRow] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      currency: orders.currency,
      deliveryMethod: orders.deliveryMethod,
      deliveryAddressSnapshot: orders.deliveryAddressSnapshot,
      paymentProvider: orders.paymentProvider,
      paymentReference: orders.paymentReference,
      createdAt: orders.createdAt,
      customerName: users.name,
    })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .innerJoin(users, eq(users.id, orders.userId))
    // Ownership is in the predicate, not a check afterwards: the order is
    // reached *through* this seller's line, so another seller's order is
    // indistinguishable from one that does not exist.
    .where(and(eq(orderItems.sellerId, sellerId), orderReferenceCondition(reference)))
    .limit(1);

  if (!orderRow) throw new HttpError(404, "NOT_FOUND", "Order not found.");

  const lines = await db
    .select({
      id: orderItems.id,
      productId: orderItems.productId,
      title: orderItems.titleSnapshot,
      imageSnapshot: orderItems.imageSnapshot,
      productSlug: products.slug,
      productImage: sql<string | null>`(
        SELECT pi.url FROM product_images pi WHERE pi.product_id = ${orderItems.productId}
        ORDER BY pi.sort_order ASC LIMIT 1
      )`,
      condition: products.condition,
      mode: orderItems.mode,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
      rentalCharge: orderItems.rentalCharge,
      securityDeposit: orderItems.securityDeposit,
      lineTotal: orderItems.lineTotal,
      fulfillmentStatus: orderItems.fulfillmentStatus,
      startDate: orderItems.startDate,
      endDate: orderItems.endDate,
      rentalDays: orderItems.rentalDays,
    })
    .from(orderItems)
    // `leftJoin`, so a removed listing cannot make a line vanish from a
    // seller's own order history. The snapshot is what is displayed.
    .leftJoin(products, eq(products.id, orderItems.productId))
    .where(and(eq(orderItems.orderId, orderRow.id), eq(orderItems.sellerId, sellerId)))
    .orderBy(asc(orderItems.id));

  const sellerSubtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const unitCount = lines.reduce((sum, line) => sum + line.quantity, 0);

  const address = toFulfillmentAddress(orderRow.deliveryAddressSnapshot);

  return {
    order: {
      id: orderRow.id,
      orderNumber: orderRow.orderNumber,
      status: orderRow.status,
      fulfillmentStatus: rollupStatus(
        orderRow.status,
        lines.map((line) => line.fulfillmentStatus),
      ),
      paymentStatus: orderRow.paymentStatus,
      itemCount: lines.length,
      unitCount,
      sellerSubtotal,
      currency: orderRow.currency,
      deliveryMethod: orderRow.deliveryMethod,
      createdAt: orderRow.createdAt.toISOString(),
      customerName: orderRow.customerName,
      canCancel: false,
      paymentProvider: orderRow.paymentProvider,
      paymentReference: orderRow.paymentReference,
      placedAt: orderRow.createdAt.toISOString(),
    },
    items: lines.map((line) => ({
      id: line.id,
      productId: line.productId,
      productSlug: line.productSlug,
      title: line.title,
      // The purchase-time image, falling back to the live one. Same rule the
      // customer's receipt uses: history first.
      imageUrl: line.imageSnapshot ?? line.productImage ?? null,
      condition: line.condition,
      mode: line.mode,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      rentalCharge: line.rentalCharge,
      securityDeposit: line.securityDeposit,
      lineTotal: line.lineTotal,
      fulfillmentStatus: effectiveFulfillment(line.fulfillmentStatus, orderRow.status),
      startDate: line.startDate ? line.startDate.toISOString() : null,
      endDate: line.endDate ? line.endDate.toISOString() : null,
      rentalDays: line.rentalDays,
    })),
    delivery: { method: orderRow.deliveryMethod, address },
    // Name and phone only. No email, no account id, no unrelated addresses: a
    // seller needs to know who to hand the parcel to, not who the customer is.
    customer: {
      name: orderRow.customerName,
      phone: address?.phone ?? null,
    },
    timeline: buildSellerOrderTimeline(orderRow.status, lines),
    actions: {
      next: [],
      canCancel: ["CONFIRMED", "PROCESSING", "READY_FOR_PICKUP"].includes(
        rollupStatus(
          orderRow.status,
          lines.map((line) => line.fulfillmentStatus),
        ),
      ),
      canSetFulfillment: lines.length > 0,
    },
  };
}

/**
 * `RV-2026-XXXXXX` or a legacy numeric id.
 *
 * Both forms are matched with their own predicate, so a non-numeric reference is
 * never coerced to `NaN` and used in a numeric comparison.
 */
function orderReferenceCondition(reference: string | number): SQL {
  const numeric = Number(reference);
  if (Number.isInteger(numeric) && numeric > 0) return eq(orders.id, numeric);
  return eq(orders.orderNumber, String(reference));
}

/**
 * The seller's rollup: the least advanced of their lines, because an order is
 * only as far along as its slowest line.
 */
function rollupStatus(orderStatus: string, lineStatuses: (string | null)[]): string {
  if (lineStatuses.length === 0) return effectiveFulfillment(null, orderStatus);
  const ranked = lineStatuses.map((status) => effectiveFulfillment(status, orderStatus));
  const cancellable = ranked.filter((status) => status !== "CANCELLED");
  if (cancellable.length === 0) return "CANCELLED";

  return cancellable.reduce((least, status) => {
    const a = RANK_BY_STATUS[least] ?? 8;
    const b = RANK_BY_STATUS[status] ?? 8;
    return b < a ? status : least;
  });
}

/**
 * The timeline, from verified facts only.
 *
 * `orders` records the order's *current* status, not when each status was
 * reached, so steps carry a timestamp only where one genuinely exists
 * (`createdAt`). Inventing "today" for a step nobody recorded is the failure
 * this shape exists to avoid — the same rule the customer's order timeline and
 * the rental timeline both follow.
 */
function buildSellerOrderTimeline(
  orderStatus: string,
  lines: { fulfillmentStatus: string | null }[],
): { key: string; label: string; at: string | null; state: string }[] {
  const steps = [
    "CONFIRMED",
    "PROCESSING",
    "READY_FOR_PICKUP",
    "SHIPPED",
    "DELIVERED",
    "COMPLETED",
  ];
  const labels: Record<string, string> = {
    CONFIRMED: "Order received",
    PROCESSING: "Processing started",
    READY_FOR_PICKUP: "Ready",
    SHIPPED: "Shipped",
    DELIVERED: "Delivered",
    COMPLETED: "Completed",
  };

  const rollup = rollupStatus(
    orderStatus,
    lines.map((line) => line.fulfillmentStatus),
  );
  const reached = RANK_BY_STATUS[rollup] ?? 1;

  return steps.map((step) => {
    const rank = RANK_BY_STATUS[step] ?? 0;
    return {
      key: step,
      label: labels[step] ?? step,
      // Recorded facts only: no step can claim a time the database does not hold.
      at: null,
      state: rank < reached ? "done" : rank === reached ? "current" : "pending",
    };
  });
}
