import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  lte,
  like,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import {
  orders,
  payments,
  transactions,
  users,
} from "../../schema";
import { paginationQuerySchema } from "../../lib/api";
import { getSetting } from "../settings/service";
import { getRegistryEntry } from "../../lib/settings/registry";

/* --------------------------------- payments view --------------------------------- */

/**
 * Query schema for the payments admin table.
 *
 * Filters: method, status, date range, order number, UTR (providerTransactionId),
 * and a free-text search across provider-ref, order number, and customer name.
 */
export const adminPaymentsQuerySchema = paginationQuerySchema.extend({
  status: z.string().trim().optional().catch(undefined),
  method: z.string().trim().optional().catch(undefined),
  type: z.string().trim().optional().catch(undefined),
  from: z.string().trim().optional().catch(undefined),
  to: z.string().trim().optional().catch(undefined),
  search: z.string().trim().optional().catch(""),
  orderNumber: z.string().trim().max(20).optional().catch(""),
  utr: z.string().trim().max(100).optional().catch(""),
});

export type AdminPaymentsQuery = z.infer<typeof adminPaymentsQuerySchema>;

export type AdminPaymentRow = {
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
  customerName: string | null;
  createdAt: Date;
};

/**
 * Build the WHERE conditions for the payments admin list query.
 */
function adminPaymentConditions(query: AdminPaymentsQuery): SQL[] {
  const conditions: SQL[] = [];

  if (query.status) {
    conditions.push(eq(transactions.status, query.status));
  }
  if (query.method) {
    conditions.push(eq(transactions.paymentMethod, query.method));
  }
  if (query.type) {
    conditions.push(eq(transactions.type, query.type));
  }
  if (query.from || query.to) {
    const fromDate = query.from ? new Date(query.from) : undefined;
    const toDate = query.to ? new Date(query.to) : undefined;
    if (fromDate) conditions.push(gte(transactions.createdAt, fromDate));
    if (toDate) conditions.push(lte(transactions.createdAt, toDate));
  }
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
  if (query.orderNumber) {
    conditions.push(eq(orders.orderNumber, query.orderNumber));
  }
  if (query.utr) {
    conditions.push(
      like(transactions.providerTransactionId, `%${query.utr}%`),
    );
  }

  return conditions;
}

export async function listAdminPayments(query: AdminPaymentsQuery): Promise<{
  rows: AdminPaymentRow[];
  total: number;
}> {
  const resolved = {
    page: query.page,
    pageSize: query.pageSize,
    sort: query.sort,
  };

  const where = and(
    ...adminPaymentConditions(query),
    ...(resolved.sort ? [asc(transactions.createdAt)] : []),
  );

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

  return {
    rows: rows.map((row) => ({
      ...row,
      retryHint: row.failureReason
        ? `Failed payment: ${row.failureReason}`
        : row.status === "PROCESSING"
          ? "Payment still being settled"
          : null,
    })),
    total: Number(totalRow.value),
  };
}

/* --------------------------------- manual UPI queue --------------------------------- */

/**
 * List of PROCESSING manual UPI intents that need verification.
 * These are payments with status PROCESSING that were initiated manually
 * (UTR entered by user, not via provider webhook).
 */
export async function listManualUpiQueue(): Promise<{
  id: number;
  orderNumber: string | null;
  amount: number;
  currency: string;
  utr: string | null;
  createdAt: Date;
  ageMinutes: number;
}> {
  const now = new Date();
  const [rows] = await db
    .select({
      id: transactions.id,
      orderNumber: orders.orderNumber,
      amount: transactions.amount,
      currency: transactions.currency,
      utr: transactions.metadata, // UTR stored in metadata
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .leftJoin(orders, eq(transactions.orderId, orders.id))
    .where(
      and(
        eq(transactions.type, "PAYMENT"),
        eq(transactions.status, "PROCESSING"),
      ),
    );

  const result = rows.map((row) => {
    const ageMs = now.getTime() - row.createdAt.getTime();
    const ageMinutes = Math.floor(ageMs / 60000);
    return {
      id: row.id,
      orderNumber: row.orderNumber,
      amount: row.amount,
      currency: row.currency,
      utr: row.utr as string | null,
      createdAt: row.createdAt,
      ageMinutes,
    };
  });

  return result;
}

/* --------------------------------- COD queue --------------------------------- */

/**
 * List of orders awaiting COD cash collection.
 * These are orders with paymentStatus that indicates COD was chosen but not yet collected.
 */
export async function listCodQueue(): Promise<{
  id: number;
  orderNumber: string;
  total: number;
  currency: string;
  createdAt: Date;
  daysSincePlaced: number;
}> {
  const now = new Date();
  const [rows] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      total: orders.total,
      currency: orders.currency,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(
      ne(orders.paymentStatus, "PAID"),
    );

  const result = rows.map((row) => {
    const ageMs = now.getTime() - row.createdAt.getTime();
    const daysSincePlaced = Math.floor(ageMs / 86400000);
    return {
      id: row.id,
      orderNumber: row.orderNumber,
      total: row.total,
      currency: row.currency,
      createdAt: row.createdAt,
      daysSincePlaced,
    };
  });

  return result;
}

/* --------------------------------- refunds manual payout queue --------------------------------- */

/**
 * List of refunds marked as MANUAL_PAYOUT_REQUIRED that need admin action.
 */
export async function listManualRefundsQueue(): Promise<{
  id: number;
  refundNumber: string;
  amount: number;
  currency: string;
  orderNumber: string | null;
  createdAt: Date;
  ageMinutes: number;
}> {
  const now = new Date();
  const [rows] = await db
    .select({
      id: refunds.id,
      refundNumber: refunds.refundNumber,
      amount: refunds.amount,
      currency: refunds.currency,
      orderNumber: orders.orderNumber,
      createdAt: refunds.createdAt,
    })
    .from(refunds)
    .leftJoin(orders, eq(refunds.orderId, orders.id))
    .where(eq(refunds.status, "MANUAL_PAYOUT_REQUIRED"));

  const result = rows.map((row) => {
    const ageMs = now.getTime() - row.createdAt.getTime();
    const ageMinutes = Math.floor(ageMs / 60000);
    return {
      id: row.id,
      refundNumber: row.refundNumber,
      amount: row.amount,
      currency: row.currency,
      orderNumber: row.orderNumber,
      createdAt: row.createdAt,
      ageMinutes,
    };
  });

  return result;
}

/* --------------------------------- platform settings helpers --------------------------------- */

/**
 * Read a payments setting with fallback to registry defaults.
 */
export async function readPaymentsSetting(key: string) {
  return await getSetting(key);
}