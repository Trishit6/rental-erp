import { Router } from "../lib/http";
import { eq, getTableColumns } from "drizzle-orm";
import { db } from "../db";
import { ok, HttpError, buildPagination } from "../lib/api";
import { requireStepUp } from "../lib/auth";
import { notificationEventKey } from "../lib/notification-events";
import { notify } from "../lib/notifications";
import { getPaymentProvider } from "../lib/payments";
import { listAdminPayments, listManualUpiQueue, listCodQueue, listManualRefundsQueue, readPaymentsSetting } from "../lib/payments/admin-queries";
import { getAdminTransactionDetail } from "../lib/transaction-admin";
import { transactions, orders, refunds, platformSettings } from "../schema";

export const adminPaymentsRoute = new Router();

/* ------------------------------ payments list ------------------------------ */

adminPaymentsRoute.get(
  "/",
  async (c) => {
    const page = Number(c.req.query("page")) || 1;
    const pageSize = Number(c.req.query("pageSize")) || 20;
    const { rows, total } = await listAdminPayments({ page, pageSize });
    return c.json(ok(rows, buildPagination(page, pageSize, total)));
  },
);

/* ------------------------------ payment detail ------------------------------ */

adminPaymentsRoute.get(
  "/:id",
  async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpError(400, "INVALID_ID", "A transaction id must be a positive integer.");
    }
    const detail = await getAdminTransactionDetail(id);
    if (!detail) throw new HttpError(404, "NOT_FOUND", "Transaction not found.");
    return c.json(ok(detail));
  },
);

/* ------------------------------ manual UPI queue ------------------------------ */

adminPaymentsRoute.get(
  "/manual-upi-queue",
  async (c) => {
    const items = await listManualUpiQueue();
    return c.json(ok(items));
  },
);

/* ------------------------------ verify manual UPI ------------------------------ */

adminPaymentsRoute.post(
  "/manual-upi-queue/:id/confirm",
  async (c) => {
    await requireStepUp(c);
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpError(400, "INVALID_ID", "A transaction id must be a positive integer.");
    }

    const [tx] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id))
      .limit(1);

    if (!tx) {
      throw new HttpError(404, "NOT_FOUND", "Transaction not found.");
    }

    if (tx.type !== "PAYMENT" || tx.status !== "PROCESSING") {
      throw new HttpError(409, "INVALID_STATE", "Transaction is not in PROCESSING state.");
    }

    const provider = getPaymentProvider();
    if (typeof provider.verifyPayment !== "function") {
      throw new HttpError(501, "PROVIDER_UNAVAILABLE", "Payment provider cannot verify payments.");
    }

    let utr: string | null = null;
    try {
      const metadata: unknown = tx.metadata ? JSON.parse(tx.metadata) : null;
      if (typeof metadata === "object" && metadata !== null && "utr" in metadata && typeof metadata.utr === "string") {
        utr = metadata.utr.trim() || null;
      }
    } catch {
      utr = null;
    }
    if (!utr) {
      throw new HttpError(400, "MISSING_UTR", "No UTR found for this transaction.");
    }

    const result = await provider.verifyPayment({
      providerPaymentId: utr,
    });

    if (result.status !== "SUCCEEDED") {
      await db
        .update(transactions)
        .set({ status: "FAILED", failureReason: result.failureReason, updatedAt: new Date() })
        .where(eq(transactions.id, id));

      const [order] = tx.orderId
        ? await db.select({ orderNumber: orders.orderNumber }).from(orders).where(eq(orders.id, tx.orderId)).limit(1)
        : [];
      await notify(db, {
        userId: tx.userId,
        type: "PAYMENT_FAILED",
        title: "Payment verification failed",
        body: `The UPI payment for order ${order?.orderNumber ?? `#${tx.id}`} was not verified.`,
        context: { orderId: tx.orderId, orderNumber: order?.orderNumber },
        eventKey: notificationEventKey("PAYMENT_FAILED", id, `${tx.id}:failed`),
      });

      throw new HttpError(409, "PAYMENT_FAILED", "The UPI payment was not verified.");
    }

    await db
      .update(transactions)
      .set({ status: "SUCCEEDED", updatedAt: new Date() })
      .where(eq(transactions.id, id));

    const [order] = tx.orderId
      ? await db.select({ orderNumber: orders.orderNumber }).from(orders).where(eq(orders.id, tx.orderId)).limit(1)
      : [];
    await notify(db, {
      userId: tx.userId,
      type: "PAYMENT_PROCESSED",
      title: "Your payment has been verified",
      body: `Your UPI payment of ₹${(tx.amount / 100).toFixed(2)} has been verified.`,
      context: { orderId: tx.orderId, orderNumber: order?.orderNumber },
      eventKey: notificationEventKey("PAYMENT_PROCESSED", id, `${tx.id}:succeeded`),
    });

    return c.json(ok({ status: "SUCCEEDED", providerPaymentId: utr }));
  },
);

/* ------------------------------ manual UPI reject ------------------------------ */

adminPaymentsRoute.post(
  "/manual-upi-queue/:id/reject",
  async (c) => {
    await requireStepUp(c);
    const id = Number(c.req.param("id"));
    const body = await c.req.json<{ reason?: unknown }>();
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (!reason || reason.length < 3) {
      throw new HttpError(400, "REASON_REQUIRED", "A reason is required to reject a payment.");
    }

    const [tx] = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
    if (!tx) throw new HttpError(404, "NOT_FOUND", "Transaction not found.");
    await db
      .update(transactions)
      .set({ status: "FAILED", failureReason: reason, updatedAt: new Date() })
      .where(eq(transactions.id, id));

    const [order] = tx.orderId
      ? await db.select({ orderNumber: orders.orderNumber }).from(orders).where(eq(orders.id, tx.orderId)).limit(1)
      : [];
    await notify(db, {
      userId: tx.userId,
      type: "PAYMENT_REJECTED",
      title: "Payment rejected",
      body: `The UPI payment for order ${order?.orderNumber ?? `#${tx.id}`} was rejected.`,
      context: { orderId: tx.orderId, orderNumber: order?.orderNumber },
      eventKey: notificationEventKey("PAYMENT_REJECTED", id, `${tx.id}:rejected`),
    });

    return c.json(ok({ status: "FAILED", reason }));
  },
);

/* ------------------------------ COD queue ------------------------------ */

adminPaymentsRoute.get(
  "/cod-queue",
  async (c) => {
    const items = await listCodQueue();
    return c.json(ok(items));
  },
);

/* ------------------------------ mark COD collected ------------------------------ */

adminPaymentsRoute.post(
  "/cod-queue/:id/collect",
  async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpError(400, "INVALID_ID", "An order id must be a positive integer.");
    }

    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1);

    if (!order) {
      throw new HttpError(404, "NOT_FOUND", "Order not found.");
    }

    if (order.paymentStatus === "PAID") {
      throw new HttpError(409, "ALREADY_PAID", "This order has already been paid.");
    }

    await db
      .update(orders)
      .set({ paymentStatus: "PAID", updatedAt: new Date() })
      .where(eq(orders.id, id));

    await notify(db, {
      userId: order.userId,
      type: "COD_COLLECTED",
      title: "COD payment collected",
      body: `COD payment of ₹${(order.total / 100).toFixed(2)} has been collected for order ${order.orderNumber ?? `#${order.id}`}.`,
      context: { orderId: order.id, orderNumber: order.orderNumber },
      eventKey: notificationEventKey("COD_COLLECTED", order.id, `${order.id}:cod-collected`),
    });

    return c.json(ok({ status: "PAID", orderId: order.id }));
  },
);

/* ------------------------------ manual refunds queue ------------------------------ */

adminPaymentsRoute.get(
  "/refunds/manual-queue",
  async (c) => {
    const items = await listManualRefundsQueue();
    return c.json(ok(items));
  },
);

/* ------------------------------ mark manual refund paid ------------------------------ */

adminPaymentsRoute.post(
  "/refunds/manual-queue/:id/mark-paid",
  async (c) => {
    await requireStepUp(c);
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpError(400, "INVALID_ID", "A refund id must be a positive integer.");
    }

    const [refund] = await db
      .select({ ...getTableColumns(refunds), orderNumber: orders.orderNumber })
      .from(refunds)
      .leftJoin(orders, eq(refunds.orderId, orders.id))
      .where(eq(refunds.id, id))
      .limit(1);

    if (!refund) {
      throw new HttpError(404, "NOT_FOUND", "Refund not found.");
    }

    if (refund.status !== "MANUAL_PAYOUT_REQUIRED") {
      throw new HttpError(409, "INVALID_STATE", "This refund is not in MANUAL_PAYOUT_REQUIRED state.");
    }

    await db
      .update(refunds)
      .set({ status: "SUCCEEDED", updatedAt: new Date() })
      .where(eq(refunds.id, id));

    await db
      .update(orders)
      .set({ paymentStatus: "REFUNDED", updatedAt: new Date() })
      .where(eq(orders.id, refund.orderId));

    await notify(db, {
      userId: refund.userId,
      type: "REFUND_PROCESSED",
      title: "Your refund has been processed",
      body: `₹${(refund.amount / 100).toFixed(2)} has been refunded for order ${refund.orderNumber ?? `#${refund.orderId}`}.`,
      context: { orderId: refund.orderId, orderNumber: refund.orderNumber },
      eventKey: notificationEventKey("REFUND_PROCESSED", refund.orderId, `${refund.refundNumber}:succeeded`),
    });

    return c.json(ok({ status: "SUCCEEDED", refundNumber: refund.refundNumber }));
  },
);

/* ------------------------------ platform payments settings ------------------------------ */

adminPaymentsRoute.get(
  "/settings",
  async (c) => {
    const settings: Record<string, unknown> = {};

    const paymentsEntries = await import("../lib/settings/registry").then((m) => m.listRegistry());
    // Filter for payments keys
    const paymentsKeys = paymentsEntries?.filter((e: any) => e.group === "payments");

    if (paymentsKeys) {
      for (const entry of paymentsKeys) {
        const value = await readPaymentsSetting(entry.key);
        settings[entry.key] = value;
      }
    }

    return c.json(ok({ settings }));
  },
);

adminPaymentsRoute.patch(
  "/settings",
  async (c) => {
    await requireStepUp(c);
    const body = await c.req.json<{ settings?: Record<string, unknown> }>();
    const updates = body.settings ?? {};

    const results: Record<string, { success: boolean; value?: unknown; error?: string }> = {};

    for (const [key, value] of Object.entries(updates)) {
      try {
        const entry = await import("../lib/settings/registry").then((m) => m.getRegistryEntry(key));
        if (!entry) {
          results[key] = { success: false, error: "Unknown setting" };
          continue;
        }

        const validated = entry.validate(value);
        await db
          .insert(platformSettings)
          .values({ key, value: JSON.stringify(validated), description: entry.description, updatedBy: c.get("user")?.id ?? null })
          .onDuplicateKeyUpdate({ set: { value: JSON.stringify(validated), updatedBy: c.get("user")?.id ?? null } });

        results[key] = { success: true, value: validated };
      } catch (err: any) {
        results[key] = { success: false, error: err.message };
      }
    }

    return c.json(ok({ results }));
  },
);

/* ------------------------------ payments method toggles ------------------------------ */

adminPaymentsRoute.patch(
  "/methods/:method/toggle",
  async (c) => {
    const method = c.req.param("method");
    const body = await c.req.json<{ enabled?: unknown }>();
    const enabled = body.enabled;

    if (typeof enabled !== "boolean") {
      throw new HttpError(400, "INVALID_PARAM", "enabled must be a boolean.");
    }

    const key = `payments.method${method.charAt(0).toUpperCase() + method.slice(1)}Enabled`;
    const entry = await import("../lib/settings/registry").then((m) => m.getRegistryEntry(key));
    if (!entry) {
      throw new HttpError(404, "UNKNOWN_METHOD", `Unknown payment method: ${method}`);
    }

    const value = await readPaymentsSetting(entry.key);
    const newValue = !value;

    try {
      const validated = entry.validate(newValue);
      const user = c.get("user")?.id ?? null;
      await db
        .insert(platformSettings)
        .values({ key, value: JSON.stringify(validated), description: entry.description, updatedBy: user })
        .onDuplicateKeyUpdate({ set: { value: JSON.stringify(validated), updatedBy: user } });
      return c.json(ok({ key, enabled: validated }));
    } catch (err: any) {
      throw new HttpError(400, "VALIDATION_ERROR", err.message);
    }
  },
);
