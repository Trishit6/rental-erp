import { and, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { orderItems, orders, products, rentals, reviews } from "../schema";

/**
 * Seller analytics.
 *
 * ## What counts as revenue
 *
 * `order_items.line_total` includes the refundable security deposit, because the
 * customer really does pay it at checkout. It is **not** money the seller keeps —
 * it comes back on return. So every earnings figure here is
 * `line_total − security_deposit`, and rental earnings come from
 * `rentals.rental_subtotal`, which the rental engine already computes as the
 * charge *without* the deposit. Reading `line_total` directly is the single most
 * likely way to overstate what a seller has earned, and it is the mistake this
 * module exists to not make.
 *
 * Cancelled lines are excluded throughout. A cancelled order's line total is a
 * refund that is still `PENDING` in the ledger, not income.
 *
 * ## Periods
 *
 * `7d` / `30d` / `90d` / `ytd` are relative to *now* and resolved on the server,
 * so a link a seller bookmarks keeps meaning "the last 30 days" rather than a
 * fixed window that quietly ages. A custom range is accepted but capped, because
 * an unbounded date range on an orders table is a table scan a stranger can ask
 * for by editing a query string.
 *
 * ## Timezones
 *
 * Buckets are cut in **UTC** via `CONVERT_TZ(..., @@session.time_zone, '+00:00')`
 * rather than a bare `DATE(created_at)`. The bare form buckets by the *server's*
 * local day, which means an order placed at 06:00 UTC lands in yesterday's
 * column for half the year and every "revenue over time" chart disagrees with the
 * dates printed beside it. The boundaries come back as `YYYY-MM-DD` strings and
 * are parsed as UTC on the client, so both ends agree.
 */

export const ANALYTICS_PERIODS = ["7d", "30d", "90d", "ytd", "custom"] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

/** Two years. Long enough for a real business, short enough to stay indexed. */
export const MAX_CUSTOM_RANGE_DAYS = 730;

export const analyticsQuerySchema = z.object({
  period: z.string().trim().optional().catch(undefined),
  from: z.string().trim().optional().catch(undefined),
  to: z.string().trim().optional().catch(undefined),
  metric: z.string().trim().optional().catch(undefined),
});

const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseBoundary(value: string | undefined, endOfDay: boolean): Date | null {
  if (!value) return null;
  const suffix = BARE_DATE.test(value) ? (endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z") : "";
  const parsed = new Date(`${value}${suffix}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export type ResolvedAnalyticsRange = {
  period: AnalyticsPeriod;
  from: Date;
  to: Date;
  /** Daily columns for a short window, monthly for a long one. */
  bucket: "day" | "month";
};

export function isAnalyticsPeriod(value: unknown): value is AnalyticsPeriod {
  return typeof value === "string" && (ANALYTICS_PERIODS as readonly string[]).includes(value);
}

/**
 * Resolve a period to concrete UTC boundaries.
 *
 * An unparseable or absurd `custom` range falls back to 30 days rather than
 * throwing: a mangled query string should show a seller's last 30 days, not an
 * error page. Boundaries are inclusive of `to`'s whole day.
 */
export function resolveAnalyticsRange(
  raw: unknown,
  now: Date = new Date(),
): ResolvedAnalyticsRange {
  const parsed = analyticsQuerySchema.parse(raw ?? {});
  const period = isAnalyticsPeriod(parsed.period) ? parsed.period : "30d";

  let from: Date;
  const to: Date = now;

  if (period === "custom") {
    const requestedFrom = parseBoundary(parsed.from, false);
    const requestedTo = parseBoundary(parsed.to, true) ?? now;
    if (requestedFrom && requestedTo >= requestedFrom) {
      const days = (requestedTo.getTime() - requestedFrom.getTime()) / 86_400_000;
      if (days <= MAX_CUSTOM_RANGE_DAYS) {
        return {
          period,
          from: requestedFrom,
          to: requestedTo,
          bucket: days > 92 ? "month" : "day",
        };
      }
    }
    from = new Date(now.getTime() - 30 * 86_400_000);
  } else if (period === "ytd") {
    from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  } else {
    const days = Number(period.replace("d", ""));
    from = new Date(now.getTime() - days * 86_400_000);
  }

  return { period, from, to, bucket: "day" };
}

/** How a "top products" list is ranked. */
export const TOP_PRODUCT_METRICS = ["revenue", "units", "rentals", "rating"] as const;
export type TopProductMetric = (typeof TOP_PRODUCT_METRICS)[number];

export function isTopProductMetric(value: unknown): value is TopProductMetric {
  return typeof value === "string" && (TOP_PRODUCT_METRICS as readonly string[]).includes(value);
}

/**
 * Purchases counted as income.
 *
 * Rental *lines* are excluded (`mode = 'BUY'`) because a rental's earnings are
 * real but they arrive as `rentals` rows and are added separately below —
 * counting a rental line here as well would book it twice.
 */
const EARNED_LINE = sql<number>`${orderItems.lineTotal} - ${orderItems.securityDeposit}`;

/** Lines that represent something a seller actually fulfilled or still owes. */
const COUNTABLE_ORDER = and(
  sql`${orders.status} <> 'CANCELLED'`,
  sql`COALESCE(${orderItems.fulfillmentStatus}, ${orders.status}) <> 'CANCELLED'`,
);

/** Rentals that earned money: everything but a cancelled booking. */
const EARNED_RENTAL = sql<number>`${rentals.rentalSubtotal}`;
const COUNTABLE_RENTAL = sql`${rentals.status} <> 'CANCELLED'`;

export type SellerAnalytics = {
  range: { period: AnalyticsPeriod; from: string; to: string; bucket: "day" | "month" };
  totals: {
    /** Purchase + rental earnings, net of refundable deposits. Paise. */
    revenuePaise: number;
    purchaseRevenuePaise: number;
    rentalRevenuePaise: number;
    /** Distinct orders containing at least one of this seller's lines. */
    orders: number;
    purchaseOrders: number;
    rentalBookings: number;
    unitsSold: number;
    unitsRented: number;
    averageRating: number;
    ratingCount: number;
  };
  /**
   * One point per bucket, with **both** revenue sources kept apart.
   *
   * Split rather than pre-summed because the totals include rentals and a
   * combined series would silently disagree with them: a seller whose income is
   * all rental would see a flat line above a non-zero total. The client adds the
   * two columns for the headline chart and draws them side by side for the
   * comparison.
   */
  series: {
    date: string;
    /** Purchases, net of refundable deposits. Paise. */
    purchaseRevenuePaise: number;
    /** Rentals, net of refundable deposits. Paise. */
    rentalRevenuePaise: number;
    orders: number;
    unitsSold: number;
  }[];
  topProducts: {
    id: number;
    title: string;
    slug: string;
    primaryImage: string | null;
    listingType: string;
    status: string;
    revenuePaise: number;
    unitsSold: number;
    unitsRented: number;
    ratingAverage: number;
    ratingCount: number;
  }[];
};

const TOP_PRODUCT_LIMIT = 8;

/**
 * A merged bucket, before zero-filling.
 *
 * Internal to this module: it exists because the purchases and the rentals arrive
 * as two result sets that have to become one timeline, and this is the shape they
 * meet in.
 */
type AnalyticsBucket = {
  date: string;
  purchase: number;
  rental: number;
  orders: number;
  units: number;
};

/**
 * Everything the analytics page renders, in a fixed number of queries.
 *
 * Five aggregates plus one ranked list. The series is grouped in SQL and then
 * **zero-filled in JS** for the days with no orders, because a chart whose line
 * jumps straight from the 3rd to the 9th of the month is lying about what
 * happened — and a seller comparing "days with sales" against "days in range"
 * deserves an answer that does not require them to know that a missing row means
 * zero.
 */
export async function getSellerAnalytics(
  sellerId: number,
  range: ResolvedAnalyticsRange,
  metric: TopProductMetric = "revenue",
): Promise<SellerAnalytics> {
  const { from, to } = range;
  const window = and(gte(orders.createdAt, from), lte(orders.createdAt, to));

  const [purchase] = await db
    .select({
      revenue: sql<number>`COALESCE(SUM(${EARNED_LINE}), 0)`,
      units: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)`,
      orders: count(),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(eq(orderItems.sellerId, sellerId), eq(orderItems.mode, "BUY"), window, COUNTABLE_ORDER),
    );

  const [rental] = await db
    .select({
      revenue: sql<number>`COALESCE(SUM(${EARNED_RENTAL}), 0)`,
      units: sql<number>`COUNT(*)`,
    })
    .from(rentals)
    .where(
      and(
        eq(rentals.ownerId, sellerId),
        COUNTABLE_RENTAL,
        gte(rentals.createdAt, from),
        lte(rentals.createdAt, to),
      ),
    );

  // Distinct orders, not lines: a three-line order from one seller is one order.
  const [orderCount] = await db
    .select({ value: sql<number>`COUNT(DISTINCT ${orderItems.orderId})` })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orderItems.sellerId, sellerId), window, COUNTABLE_ORDER));

  const [purchaseOrderCount] = await db
    .select({ value: sql<number>`COUNT(DISTINCT ${orderItems.orderId})` })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(eq(orderItems.sellerId, sellerId), eq(orderItems.mode, "BUY"), window, COUNTABLE_ORDER),
    );

  const [ratings] = await db
    .select({
      average: sql<number>`COALESCE(AVG(${reviews.rating}), 0)`,
      total: count(),
    })
    .from(reviews)
    .where(and(eq(reviews.sellerId, sellerId), inArray(reviews.status, ["PUBLISHED"])));

  const bucketExpr =
    range.bucket === "month"
      ? sql<string>`DATE_FORMAT(CONVERT_TZ(${orders.createdAt}, @@session.time_zone, '+00:00'), '%Y-%m-01')`
      : sql<string>`DATE_FORMAT(CONVERT_TZ(${orders.createdAt}, @@session.time_zone, '+00:00'), '%Y-%m-%d')`;

  // The same bucket expression over the rentals table. Rentals live in their own
  // table with their own dates and their own lifecycle, so they cannot share the
  // order query — but they must share the *buckets*, or a chart would show
  // purchases for some days and not others.
  const rentalBucketExpr =
    range.bucket === "month"
      ? sql<string>`DATE_FORMAT(CONVERT_TZ(${rentals.createdAt}, @@session.time_zone, '+00:00'), '%Y-%m-01')`
      : sql<string>`DATE_FORMAT(CONVERT_TZ(${rentals.createdAt}, @@session.time_zone, '+00:00'), '%Y-%m-%d')`;

  const [purchaseSeries, rentalSeries] = await Promise.all([
    db
      .select({
        date: bucketExpr,
        revenue: sql<number>`COALESCE(SUM(${EARNED_LINE}), 0)`,
        orders: sql<number>`COUNT(DISTINCT ${orderItems.orderId})`,
        units: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(
        and(eq(orderItems.sellerId, sellerId), eq(orderItems.mode, "BUY"), window, COUNTABLE_ORDER),
      )
      .groupBy(bucketExpr)
      .orderBy(bucketExpr),

    db
      .select({
        date: rentalBucketExpr,
        revenue: sql<number>`COALESCE(SUM(${EARNED_RENTAL}), 0)`,
      })
      .from(rentals)
      .where(
        and(
          eq(rentals.ownerId, sellerId),
          COUNTABLE_RENTAL,
          gte(rentals.createdAt, from),
          lte(rentals.createdAt, to),
        ),
      )
      .groupBy(rentalBucketExpr)
      .orderBy(rentalBucketExpr),
  ]);

  /**
   * The two grouped result sets, merged into one bucket-keyed shape.
   *
   * Merging here rather than in the client is the point: the chart, the totals
   * and the table all read the same buckets, so a bar can never be drawn for a
   * day the totals did not count. A `LEFT JOIN` in SQL would be one query
   * instead of two, but it needs the *union* of both bucket lists to be right,
   * and a `FULL OUTER JOIN` is not portable — so the merge is four lines of JS
   * over two small result sets, which is cheaper than being wrong.
   */
  const grouped: AnalyticsBucket[] = [
    ...purchaseSeries.map((row) => ({
      date: String(row.date),
      purchase: Number(row.revenue ?? 0),
      rental: 0,
      orders: Number(row.orders ?? 0),
      units: Number(row.units ?? 0),
    })),
    ...rentalSeries.map((row) => ({
      date: String(row.date),
      purchase: 0,
      rental: Number(row.revenue ?? 0),
      orders: 0,
      units: 0,
    })),
  ].reduce<AnalyticsBucket[]>((acc, row: AnalyticsBucket) => {
    const existing = acc.find((entry) => entry.date === row.date);
    if (existing) {
      existing.purchase += row.purchase;
      existing.rental += row.rental;
      existing.orders += row.orders;
      existing.units += row.units;
    } else {
      acc.push({ ...row });
    }
    return acc;
  }, []);

  const topProducts = await listTopProducts(sellerId, metric);

  const purchaseRevenue = Number(purchase?.revenue ?? 0);
  const rentalRevenue = Number(rental?.revenue ?? 0);

  return {
    range: {
      period: range.period,
      from: from.toISOString(),
      to: to.toISOString(),
      bucket: range.bucket,
    },
    totals: {
      revenuePaise: purchaseRevenue + rentalRevenue,
      purchaseRevenuePaise: purchaseRevenue,
      rentalRevenuePaise: rentalRevenue,
      orders: Number(orderCount?.value ?? 0),
      purchaseOrders: Number(purchaseOrderCount?.value ?? 0),
      rentalBookings: Number(rental?.units ?? 0),
      unitsSold: Number(purchase?.units ?? 0),
      unitsRented: Number(rental?.units ?? 0),
      averageRating: Math.round(Number(ratings?.average ?? 0) * 10) / 10,
      ratingCount: Number(ratings?.total ?? 0),
    },
    series: zeroFillSeries(grouped, range),
    topProducts,
  };
}

/**
 * Revenue over time, with the empty stretches made explicit.
 *
 * Zero-filling is bounded to the buckets the range can actually contain, so a
 * two-year custom range produces 24 monthly points rather than 730 daily ones.
 */
function zeroFillSeries(
  grouped: AnalyticsBucket[],
  range: ResolvedAnalyticsRange,
): SellerAnalytics["series"] {
  const byDate = new Map(grouped.map((row) => [String(row.date), row]));
  /** One point, whichever branch we are in — keeps the two loops identical. */
  const point = (key: string): SellerAnalytics["series"][number] => {
    const row = byDate.get(key);
    return {
      date: key,
      purchaseRevenuePaise: Number(row?.purchase ?? 0),
      rentalRevenuePaise: Number(row?.rental ?? 0),
      orders: Number(row?.orders ?? 0),
      unitsSold: Number(row?.units ?? 0),
    };
  };

  const points: SellerAnalytics["series"] = [];

  if (range.bucket === "month") {
    const cursor = new Date(
      Date.UTC(Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth(), 1)),
    );
    const last = Date.UTC(range.to.getUTCFullYear(), range.to.getUTCMonth(), 1);
    let guard = 0;
    while (cursor.getTime() <= last && guard < 240) {
      const key = cursor.toISOString().slice(0, 10);
      points.push(point(key));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      guard += 1;
    }
    return points;
  }

  const cursor = new Date(`${range.from.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const last = range.to.toISOString().slice(0, 10);
  let guard = 0;
  while (cursor.toISOString().slice(0, 10) <= last && guard < 800) {
    const key = cursor.toISOString().slice(0, 10);
    points.push(point(key));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
  }
  return points;
}

/**
 * The seller's best-performing listings, ranked by a metric the seller chose.
 *
 * Ranked in SQL over the same order/rental tables as everything else, so the
 * ordering can never be a client-side guess over a partial page. Ratings come
 * from `products.rating_average`, which `rating-aggregate.ts` keeps equal to the
 * published reviews.
 */
async function listTopProducts(
  sellerId: number,
  metric: TopProductMetric,
): Promise<SellerAnalytics["topProducts"]> {
  const soldUnits = sql<number>`(
    SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi
    WHERE oi.product_id = ${products.id} AND oi.mode = 'BUY'
  )`;
  const rentalCount = sql<number>`(
    SELECT COUNT(*) FROM rentals r WHERE r.product_id = ${products.id}
  )`;
  const revenue = sql<number>`(
    SELECT COALESCE(SUM(oi.line_total - oi.security_deposit), 0) FROM order_items oi
    WHERE oi.product_id = ${products.id}
  )`;

  const order =
    metric === "units"
      ? desc(soldUnits)
      : metric === "rentals"
        ? desc(rentalCount)
        : metric === "rating"
          ? desc(products.ratingAverage)
          : desc(revenue);

  return db
    .select({
      id: products.id,
      title: products.title,
      slug: products.slug,
      listingType: products.listingType,
      status: products.status,
      ratingAverage: products.ratingAverage,
      ratingCount: products.ratingCount,
      revenuePaise: revenue,
      unitsSold: soldUnits,
      unitsRented: rentalCount,
      primaryImage: sql<string | null>`(
        SELECT pi.url FROM product_images pi WHERE pi.product_id = ${products.id}
        ORDER BY pi.sort_order ASC LIMIT 1
      )`,
    })
    .from(products)
    .where(eq(products.sellerId, sellerId))
    .orderBy(order, desc(products.id))
    .limit(TOP_PRODUCT_LIMIT);
}

export type SellerSummary = {
  products: {
    total: number;
    active: number;
    draft: number;
    paused: number;
    archived: number;
    outOfStock: number;
  };
  orders: {
    total: number;
    /** Lines still waiting on this seller to act. */
    pending: number;
    inProgress: number;
    shipped: number;
    delivered: number;
    cancelled: number;
  };
  rentals: {
    total: number;
    active: number;
    upcoming: number;
    returnPending: number;
    overdue: number;
    completed: number;
  };
  earnings: {
    /** Net of refundable deposits, and over the seller's whole history. */
    salePaise: number;
    rentalPaise: number;
    /** After the platform's configured commission. Paise. */
    saleNetPaise: number;
    rentalNetPaise: number;
    currency: string;
  };
  reviews: { average: number; count: number; awaitingReply: number };
};

/**
 * The dashboard's headline cards.
 *
 * One pass per dimension, each a `COUNT` with a `SUM(CASE …)` rather than a row
 * per listing. The dashboard previously called `/rentals?role=all` and counted
 * the result in the browser — which downloaded every rental a seller was party
 * to, on both sides of the table, to produce one number.
 *
 * "Pending" counts *lines*, not orders: an order is only as pending as its
 * slowest line, and a seller with three lines and two shipped still has work
 * outstanding.
 */
export async function getSellerSummary(
  sellerId: number,
  saleFeePercent: number,
  rentalFeePercent: number,
): Promise<SellerSummary> {
  const [productCounts] = await db
    .select({
      total: count(),
      active: sql<number>`COALESCE(SUM(${products.status} IN ('PUBLISHED','OUT_OF_STOCK')), 0)`,
      draft: sql<number>`COALESCE(SUM(${products.status} = 'DRAFT'), 0)`,
      paused: sql<number>`COALESCE(SUM(${products.status} = 'PAUSED'), 0)`,
      archived: sql<number>`COALESCE(SUM(${products.status} = 'ARCHIVED'), 0)`,
      outOfStock: sql<number>`COALESCE(SUM(${products.availableQuantity} <= 0), 0)`,
    })
    .from(products)
    .where(eq(products.sellerId, sellerId));

  const [orderCounts] = await db
    .select({
      total: sql<number>`COUNT(DISTINCT ${orderItems.orderId})`,
      pending: sql<number>`COALESCE(SUM(COALESCE(${orderItems.fulfillmentStatus}, ${orders.status}) IN ('CONFIRMED')), 0)`,
      inProgress: sql<number>`COALESCE(SUM(COALESCE(${orderItems.fulfillmentStatus}, ${orders.status}) IN ('PROCESSING','READY_FOR_PICKUP')), 0)`,
      shipped: sql<number>`COALESCE(SUM(COALESCE(${orderItems.fulfillmentStatus}, ${orders.status}) = 'SHIPPED'), 0)`,
      delivered: sql<number>`COALESCE(SUM(COALESCE(${orderItems.fulfillmentStatus}, ${orders.status}) IN ('DELIVERED','COMPLETED')), 0)`,
      cancelled: sql<number>`COALESCE(SUM(COALESCE(${orderItems.fulfillmentStatus}, ${orders.status}) = 'CANCELLED'), 0)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(eq(orderItems.sellerId, sellerId));

  const [rentalCounts] = await db
    .select({
      total: count(),
      active: sql<number>`COALESCE(SUM(${rentals.status} IN ('ACTIVE','OVERDUE')), 0)`,
      upcoming: sql<number>`COALESCE(SUM(${rentals.status} = 'CONFIRMED'), 0)`,
      returnPending: sql<number>`COALESCE(SUM(${rentals.status} = 'RETURN_PENDING'), 0)`,
      overdue: sql<number>`COALESCE(SUM(${rentals.status} = 'OVERDUE'), 0)`,
      completed: sql<number>`COALESCE(SUM(${rentals.status} IN ('RETURNED','COMPLETED')), 0)`,
    })
    .from(rentals)
    .where(eq(rentals.ownerId, sellerId));

  const [sale] = await db
    .select({ value: sql<number>`COALESCE(SUM(${EARNED_LINE}), 0)` })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orderItems.sellerId, sellerId), eq(orderItems.mode, "BUY"), COUNTABLE_ORDER));

  const [rental] = await db
    .select({ value: sql<number>`COALESCE(SUM(${EARNED_RENTAL}), 0)` })
    .from(rentals)
    .where(and(eq(rentals.ownerId, sellerId), COUNTABLE_RENTAL));

  const [reviewCounts] = await db
    .select({
      average: sql<number>`COALESCE(AVG(${reviews.rating}), 0)`,
      total: count(),
      awaitingReply: sql<number>`COALESCE(SUM(${reviews.sellerReply} IS NULL), 0)`,
    })
    .from(reviews)
    .where(and(eq(reviews.sellerId, sellerId), inArray(reviews.status, ["PUBLISHED"])));

  const salePaise = Number(sale?.value ?? 0);
  const rentalPaise = Number(rental?.value ?? 0);

  return {
    products: {
      total: Number(productCounts?.total ?? 0),
      active: Number(productCounts?.active ?? 0),
      draft: Number(productCounts?.draft ?? 0),
      paused: Number(productCounts?.paused ?? 0),
      archived: Number(productCounts?.archived ?? 0),
      outOfStock: Number(productCounts?.outOfStock ?? 0),
    },
    orders: {
      total: Number(orderCounts?.total ?? 0),
      pending: Number(orderCounts?.pending ?? 0),
      inProgress: Number(orderCounts?.inProgress ?? 0),
      shipped: Number(orderCounts?.shipped ?? 0),
      delivered: Number(orderCounts?.delivered ?? 0),
      cancelled: Number(orderCounts?.cancelled ?? 0),
    },
    rentals: {
      total: Number(rentalCounts?.total ?? 0),
      active: Number(rentalCounts?.active ?? 0),
      upcoming: Number(rentalCounts?.upcoming ?? 0),
      returnPending: Number(rentalCounts?.returnPending ?? 0),
      overdue: Number(rentalCounts?.overdue ?? 0),
      completed: Number(rentalCounts?.completed ?? 0),
    },
    earnings: {
      salePaise,
      rentalPaise,
      // The platform's commission comes from `server/lib/config.ts`, never from a
      // literal in a route — the `/seller/earnings` response used to hardcode
      // 5% and 10% while the environment configured something else.
      saleNetPaise: Math.round(salePaise * (1 - saleFeePercent / 100)),
      rentalNetPaise: Math.round(rentalPaise * (1 - rentalFeePercent / 100)),
      currency: "INR",
    },
    reviews: {
      average: Math.round(Number(reviewCounts?.average ?? 0) * 10) / 10,
      count: Number(reviewCounts?.total ?? 0),
      awaitingReply: Number(reviewCounts?.awaitingReply ?? 0),
    },
  };
}

/** Statuses a seller's own rentals can be filtered by, in lifecycle order. */
export const SELLER_RENTAL_STATUS_FILTERS = [
  "CONFIRMED",
  "ACTIVE",
  "RETURN_PENDING",
  "OVERDUE",
  "RETURNED",
  "COMPLETED",
  "CANCELLED",
] as const;

export function isSellerRentalStatus(
  value: unknown,
): value is (typeof SELLER_RENTAL_STATUS_FILTERS)[number] {
  return (
    typeof value === "string" && (SELLER_RENTAL_STATUS_FILTERS as readonly string[]).includes(value)
  );
}
