import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { categories, orderItems, orders, payouts, products, refunds, transactions, users, walletTransactions } from "../schema";

/**
 * Finance reporting and reconciliation (PROMPT 28).
 *
 * ## What "commission" actually is
 *
 * There is no commission table and no per-order fee column. The platform's cut is a
 * `wallet_transactions` row of type `PLATFORM_FEE`, written negative against the
 * seller at the moment the sale is recorded (`lib/wallet.ts`). That is deliberate:
 * the fee is an event in the seller's ledger, so a fee change is a new row rather
 * than an edit, and "what did we charge on this line" survives a rule change. Every
 * figure here reads that ledger back rather than recomputing a percentage, so the
 * report and the seller's own wallet can never disagree.
 *
 * ## Why the revenue report has no single "profit" number
 *
 * A refund returns the customer's whole amount — goods, deposit and the seller's
 * share — while the platform only ever kept the fee. Subtracting the full refund
 * from the fee is a *conservative* view (the money came out of the gross, not the
 * fee), and presenting it as profit would be a lie. So `commission` and `refunded`
 * are reported side by side, and `netRevenueAfterRefunds` is labelled for what it
 * is: fees less everything returned to customers.
 */

export const REPORT_CURRENCY = "INR";

/* ------------------------------- commission -------------------------------- */

export type CommissionByVendor = {
  sellerId: number;
  sellerName: string;
  /** GMV credited to this seller, in paise. */
  sales: number;
  /** Platform fee charged against this seller, as a positive magnitude. */
  commission: number;
  feeCount: number;
};

export type CommissionByCategory = {
  categoryId: number;
  categoryName: string;
  sales: number;
  commission: number;
};

export type CommissionBreakdown = {
  currency: string;
  byVendor: CommissionByVendor[];
  byCategory: CommissionByCategory[];
  totals: { sales: number; commission: number };
};

/** Commission grouped by the seller it was charged to, and by the product category. */
export async function getCommissionBreakdown(): Promise<CommissionBreakdown> {
  const liveTypes = inArray(walletTransactions.type, ["SALE", "RENTAL", "PLATFORM_FEE"]);
  const notReversed = ne(walletTransactions.status, "REVERSED");

  const salesExpr = sql<number>`COALESCE(SUM(CASE WHEN ${walletTransactions.type} IN ('SALE','RENTAL') THEN ${walletTransactions.amount} ELSE 0 END), 0)`;
  const commissionExpr = sql<number>`COALESCE(-SUM(CASE WHEN ${walletTransactions.type} = 'PLATFORM_FEE' THEN ${walletTransactions.amount} ELSE 0 END), 0)`;
  const feeCountExpr = sql<number>`COALESCE(SUM(CASE WHEN ${walletTransactions.type} = 'PLATFORM_FEE' THEN 1 ELSE 0 END), 0)`;

  const [byVendor, byCategory] = await Promise.all([
    db
      .select({
        sellerId: walletTransactions.sellerId,
        sellerName: users.name,
        sales: salesExpr,
        commission: commissionExpr,
        feeCount: feeCountExpr,
      })
      .from(walletTransactions)
      .innerJoin(users, eq(walletTransactions.sellerId, users.id))
      .where(and(liveTypes, notReversed))
      .groupBy(walletTransactions.sellerId, users.name)
      .orderBy(desc(commissionExpr))
      .limit(200),
    db
      .select({
        categoryId: categories.id,
        categoryName: categories.name,
        sales: salesExpr,
        commission: commissionExpr,
      })
      .from(walletTransactions)
      .innerJoin(orderItems, eq(walletTransactions.orderItemId, orderItems.id))
      .innerJoin(products, eq(orderItems.productId, products.id))
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(and(liveTypes, notReversed))
      .groupBy(categories.id, categories.name)
      .orderBy(desc(commissionExpr))
      .limit(200),
  ]);

  const vendorRows = byVendor.map((row) => ({
    sellerId: row.sellerId,
    sellerName: row.sellerName,
    sales: Number(row.sales),
    commission: Number(row.commission),
    feeCount: Number(row.feeCount),
  }));
  const categoryRows = byCategory.map((row) => ({
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    sales: Number(row.sales),
    commission: Number(row.commission),
  }));

  return {
    currency: REPORT_CURRENCY,
    byVendor: vendorRows,
    byCategory: categoryRows,
    totals: {
      sales: vendorRows.reduce((sum, row) => sum + row.sales, 0),
      commission: vendorRows.reduce((sum, row) => sum + row.commission, 0),
    },
  };
}

/* ------------------------------ revenue report ----------------------------- */

export type RevenueMonth = {
  /** `YYYY-MM`. */
  month: string;
  gross: number;
  commission: number;
  orders: number;
};

export type PlatformRevenueReport = {
  currency: string;
  /** What customers paid on orders that are settled or refunded. */
  grossCollected: number;
  /** Platform fees charged, as a positive magnitude. */
  commission: number;
  /** What sellers were credited for sales and rentals. */
  sellerEarnings: number;
  /** Money actually returned to customers. */
  refunded: number;
  /** `commission - refunded`. See the module note — a conservative view, labelled. */
  netRevenueAfterRefunds: number;
  byMonth: RevenueMonth[];
};

const COLLECTED_STATUSES = ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"];

/** The platform's money story, with a six-month trend. */
export async function getPlatformRevenue(): Promise<PlatformRevenueReport> {
  const [grossRow] = await db
    .select({ value: sql<number>`COALESCE(SUM(${orders.total}), 0)` })
    .from(orders)
    .where(inArray(orders.paymentStatus, COLLECTED_STATUSES));

  const [ledgerRow] = await db
    .select({
      commission: sql<number>`COALESCE(-SUM(CASE WHEN ${walletTransactions.type} = 'PLATFORM_FEE' THEN ${walletTransactions.amount} ELSE 0 END), 0)`,
      sellerEarnings: sql<number>`COALESCE(SUM(CASE WHEN ${walletTransactions.type} IN ('SALE','RENTAL') THEN ${walletTransactions.amount} ELSE 0 END), 0)`,
    })
    .from(walletTransactions)
    .where(
      and(
        inArray(walletTransactions.type, ["SALE", "RENTAL", "PLATFORM_FEE"]),
        ne(walletTransactions.status, "REVERSED"),
      ),
    );

  const [refundRow] = await db
    .select({ value: sql<number>`COALESCE(SUM(${refunds.amount}), 0)` })
    .from(refunds)
    .where(eq(refunds.status, "SUCCEEDED"));

  const grossOrders = await db
    .select({
      month: sql<string>`DATE_FORMAT(${orders.createdAt}, '%Y-%m')`,
      gross: sql<number>`COALESCE(SUM(${orders.total}), 0)`,
      orders: sql<number>`COUNT(*)`,
    })
    .from(orders)
    .where(inArray(orders.paymentStatus, COLLECTED_STATUSES))
    .groupBy(sql`DATE_FORMAT(${orders.createdAt}, '%Y-%m')`)
    .orderBy(desc(sql`DATE_FORMAT(${orders.createdAt}, '%Y-%m')`))
    .limit(6);

  const feeMonths = await db
    .select({
      month: sql<string>`DATE_FORMAT(${walletTransactions.createdAt}, '%Y-%m')`,
      commission: sql<number>`COALESCE(-SUM(${walletTransactions.amount}), 0)`,
    })
    .from(walletTransactions)
    .where(
      and(
        eq(walletTransactions.type, "PLATFORM_FEE"),
        ne(walletTransactions.status, "REVERSED"),
      ),
    )
    .groupBy(sql`DATE_FORMAT(${walletTransactions.createdAt}, '%Y-%m')`)
    .orderBy(desc(sql`DATE_FORMAT(${walletTransactions.createdAt}, '%Y-%m')`))
    .limit(6);

  const feeByMonth = new Map(feeMonths.map((row) => [row.month, Number(row.commission)]));
  const byMonth: RevenueMonth[] = grossOrders.map((row) => ({
    month: row.month,
    gross: Number(row.gross),
    commission: feeByMonth.get(row.month) ?? 0,
    orders: Number(row.orders),
  }));

  const commission = Number(ledgerRow?.commission ?? 0);
  const refunded = Number(refundRow?.value ?? 0);

  return {
    currency: REPORT_CURRENCY,
    grossCollected: Number(grossRow?.value ?? 0),
    commission,
    sellerEarnings: Number(ledgerRow?.sellerEarnings ?? 0),
    refunded,
    netRevenueAfterRefunds: commission - refunded,
    byMonth,
  };
}

/* ------------------------------ reconciliation ----------------------------- */

export type ReconciliationMismatch = {
  /** Stable machine key, so the UI can group and a test can assert on it. */
  kind:
    | "ORDERS_VS_PAYMENTS_TOTAL"
    | "PAID_WITHOUT_PAYMENT"
    | "PAYMENT_WITHOUT_ORDER"
    | "ORDER_PAYMENT_STATUS_MISMATCH"
    | "REFUND_EXCEEDS_CAPTURED"
    | "PAYOUT_EXCEEDS_EARNINGS";
  severity: "HIGH" | "MEDIUM";
  entityType: "order" | "transaction" | "seller" | "summary";
  entityId: number | null;
  reference: string | null;
  detail: string;
  amount: number | null;
};

export type ReconciliationTotals = {
  ordersCollected: number;
  capturedPayments: number;
  refunded: number;
  completedPayouts: number;
};

export type ReconciliationReport = {
  generatedAt: string;
  currency: string;
  totals: ReconciliationTotals;
  mismatches: ReconciliationMismatch[];
};

/**
 * The summary-level checks, as a pure function.
 *
 * Rows are compared individually below, but a difference can also exist without any
 * single row looking wrong — a payment recorded against the wrong order, a manual
 * adjustment, a partial write. Comparing the *totals* is what catches those, and
 * keeping it pure means it is tested without a database.
 */
export function reconcileTotals(totals: ReconciliationTotals): ReconciliationMismatch[] {
  const mismatches: ReconciliationMismatch[] = [];
  const drift = totals.ordersCollected - totals.capturedPayments;
  if (drift !== 0) {
    mismatches.push({
      kind: "ORDERS_VS_PAYMENTS_TOTAL",
      severity: "HIGH",
      entityType: "summary",
      entityId: null,
      reference: null,
      detail: `Settled orders total ${formatPaise(totals.ordersCollected)} but captured payments total ${formatPaise(
        totals.capturedPayments,
      )} (difference ${formatPaise(Math.abs(drift))}).`,
      amount: drift,
    });
  }
  return mismatches;
}

/**
 * Orders vs transactions vs payouts, with the mismatches that need a human.
 *
 * Each list is capped: a reconciliation view that returns fifty thousand rows is a
 * report nobody reads, and the totals above already say whether there is a problem.
 */
export async function getReconciliation(): Promise<ReconciliationReport> {
  const [ordersRow] = await db
    .select({ value: sql<number>`COALESCE(SUM(${orders.total}), 0)` })
    .from(orders)
    .where(inArray(orders.paymentStatus, COLLECTED_STATUSES));
  const [paymentsRow] = await db
    .select({ value: sql<number>`COALESCE(SUM(${transactions.amount}), 0)` })
    .from(transactions)
    .where(and(eq(transactions.type, "PAYMENT"), eq(transactions.status, "SUCCEEDED")));
  const [refundsRow] = await db
    .select({ value: sql<number>`COALESCE(SUM(${refunds.amount}), 0)` })
    .from(refunds)
    .where(eq(refunds.status, "SUCCEEDED"));
  const [payoutsRow] = await db
    .select({ value: sql<number>`COALESCE(SUM(${payouts.amount}), 0)` })
    .from(payouts)
    .where(eq(payouts.status, "COMPLETED"));

  const totals: ReconciliationTotals = {
    ordersCollected: Number(ordersRow?.value ?? 0),
    capturedPayments: Number(paymentsRow?.value ?? 0),
    refunded: Number(refundsRow?.value ?? 0),
    completedPayouts: Number(payoutsRow?.value ?? 0),
  };

  const liveRefundSum = sql<number>`COALESCE((SELECT SUM(r.amount) FROM refunds r WHERE r.order_id = ${orders.id} AND r.status IN ('PENDING','PROCESSING','SUCCEEDED')), 0)`;
  const capturedSum = sql<number>`COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.order_id = ${orders.id} AND t.type = 'PAYMENT' AND t.status = 'SUCCEEDED'), 0)`;

  const [paidWithoutPayment, paymentWithoutOrder, statusMismatch, refundsOverCaptured, sellerLedger] =
    await Promise.all([
      db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          paymentStatus: orders.paymentStatus,
          total: orders.total,
        })
        .from(orders)
        .where(
          and(
            inArray(orders.paymentStatus, COLLECTED_STATUSES),
            sql`NOT EXISTS (SELECT 1 FROM transactions t WHERE t.order_id = ${orders.id} AND t.type = 'PAYMENT' AND t.status = 'SUCCEEDED')`,
          ),
        )
        .limit(50),
      db
        .select({
          id: transactions.id,
          amount: transactions.amount,
          providerTransactionId: transactions.providerTransactionId,
          createdAt: transactions.createdAt,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.type, "PAYMENT"),
            eq(transactions.status, "SUCCEEDED"),
            sql`${transactions.orderId} IS NULL`,
          ),
        )
        .limit(50),
      db
        .select({
          id: transactions.id,
          orderId: orders.id,
          orderNumber: orders.orderNumber,
          paymentStatus: orders.paymentStatus,
          amount: transactions.amount,
        })
        .from(transactions)
        .innerJoin(orders, eq(transactions.orderId, orders.id))
        .where(
          and(
            eq(transactions.type, "PAYMENT"),
            eq(transactions.status, "SUCCEEDED"),
            inArray(orders.paymentStatus, ["PENDING", "FAILED"]),
          ),
        )
        .limit(50),
      db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          total: orders.total,
          liveRefunds: liveRefundSum,
          captured: capturedSum,
        })
        .from(orders)
        .where(sql`${liveRefundSum} > ${capturedSum}`)
        .limit(50),
      db
        .select({
          sellerId: walletTransactions.sellerId,
          sellerName: users.name,
          earnings: sql<number>`COALESCE(SUM(CASE WHEN ${walletTransactions.type} IN ('SALE','RENTAL','PLATFORM_FEE','REFUND','ADJUSTMENT') AND ${walletTransactions.status} <> 'REVERSED' THEN ${walletTransactions.amount} ELSE 0 END), 0)`,
          paidOut: sql<number>`COALESCE(-SUM(CASE WHEN ${walletTransactions.type} = 'PAYOUT' AND ${walletTransactions.status} = 'COMPLETED' THEN ${walletTransactions.amount} ELSE 0 END), 0)`,
        })
        .from(walletTransactions)
        .innerJoin(users, eq(walletTransactions.sellerId, users.id))
        .groupBy(walletTransactions.sellerId, users.name),
    ]);

  const mismatches: ReconciliationMismatch[] = reconcileTotals(totals);

  for (const row of paidWithoutPayment) {
    mismatches.push({
      kind: "PAID_WITHOUT_PAYMENT",
      severity: "HIGH",
      entityType: "order",
      entityId: row.id,
      reference: row.orderNumber,
      detail: `Order ${row.orderNumber ?? `#${row.id}`} is ${row.paymentStatus} but has no settled payment.`,
      amount: row.total,
    });
  }

  for (const row of paymentWithoutOrder) {
    mismatches.push({
      kind: "PAYMENT_WITHOUT_ORDER",
      severity: "HIGH",
      entityType: "transaction",
      entityId: row.id,
      reference: row.providerTransactionId,
      detail: `Payment ${row.providerTransactionId ?? `#${row.id}`} settled but is not attached to any order.`,
      amount: row.amount,
    });
  }

  for (const row of statusMismatch) {
    mismatches.push({
      kind: "ORDER_PAYMENT_STATUS_MISMATCH",
      severity: "MEDIUM",
      entityType: "order",
      entityId: row.orderId,
      reference: row.orderNumber,
      detail: `Order ${row.orderNumber ?? `#${row.orderId}`} has a settled payment but its payment status is ${row.paymentStatus}.`,
      amount: row.amount,
    });
  }

  for (const row of refundsOverCaptured) {
    mismatches.push({
      kind: "REFUND_EXCEEDS_CAPTURED",
      severity: "HIGH",
      entityType: "order",
      entityId: row.id,
      reference: row.orderNumber,
      detail: `Order ${row.orderNumber ?? `#${row.id}`} has ${formatPaise(
        Number(row.liveRefunds),
      )} in live refunds against ${formatPaise(Number(row.captured))} captured.`,
      amount: Number(row.liveRefunds) - Number(row.captured),
    });
  }

  for (const row of sellerLedger) {
    const earnings = Number(row.earnings);
    const paidOut = Number(row.paidOut);
    if (paidOut > earnings) {
      mismatches.push({
        kind: "PAYOUT_EXCEEDS_EARNINGS",
        severity: "HIGH",
        entityType: "seller",
        entityId: row.sellerId,
        reference: row.sellerName,
        detail: `${row.sellerName} has been paid out ${formatPaise(paidOut)} against lifetime earnings of ${formatPaise(
          earnings,
        )}.`,
        amount: paidOut - earnings,
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    currency: REPORT_CURRENCY,
    totals,
    mismatches,
  };
}

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}
