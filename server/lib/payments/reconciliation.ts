import { and, eq, inArray, lte } from "drizzle-orm";
import { db } from "../../db";
import { transactions } from "../../schema";
import { readPaymentConfig } from "./index";
import { logger, redactError } from "../logger";

const STALE_AFTER_MS = 30 * 60 * 1000;
const EXPIRE_AFTER_MS = 24 * 60 * 60 * 1000;

let running = false;

export async function reconcilePendingPaymentIntents(): Promise<number> {
  if (running) return 0;
  running = true;
  let finalised = 0;
  try {
    if (readPaymentConfig().isDevelopmentMock) return 0;

    const cutoff = new Date(Date.now() - STALE_AFTER_MS);
    const stale = await db
      .select()
      .from(transactions)
      .where(
        and(
          inArray(transactions.status, ["PENDING", "PROCESSING"]),
          lte(transactions.updatedAt, cutoff),
        ),
      );

    for (const tx of stale) {
      if (!tx.providerTransactionId) continue;
      const updated = tx.updatedAt ? new Date(tx.updatedAt).getTime() : 0;
      const expired = Date.now() - updated > EXPIRE_AFTER_MS;
      if (expired && tx.orderId === null) {
        await db
          .update(transactions)
          .set({ status: "EXPIRED", failureReason: "Expired by reconciliation.", updatedAt: new Date() })
          .where(eq(transactions.id, tx.id));
        finalised += 1;
      }
    }

    logger.info("payments.reconciliation", { inspected: stale.length, finalised });
    return finalised;
  } catch (err) {
    logger.error("payments.reconciliation.failed", { error: redactError(err) });
    return 0;
  } finally {
    running = false;
  }
}