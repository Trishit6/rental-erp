import "dotenv/config";
import { db } from "./db";
import { orders, rentals, transactions } from "./schema";
import { eq, inArray, sql } from "drizzle-orm";
import { planLegacyPaidMigration, type LegacyPaidOrder } from "./lib/legacy-order-status";

type DryRunResult = {
  totalLegacy: number;
  planned: Array<{
    orderId: number;
    orderNumber: string | null;
    from: string;
    to: string;
    promoteTransactionId: number | null;
  }>;
  unreachable: boolean;
};

async function loadLegacyOrders(): Promise<LegacyPaidOrder[]> {
  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      hasSucceededPayment: sql<boolean>`EXISTS (
        SELECT 1 FROM ${transactions} t
        WHERE t.order_id = ${orders.id}
          AND t.type = 'PAYMENT'
          AND t.status = 'SUCCEEDED'
      )`,
      allRentalsClosed: sql<boolean>`NOT EXISTS (
        SELECT 1 FROM ${rentals} r
        WHERE r.order_id = ${orders.id}
          AND r.status NOT IN ('RETURNED', 'COMPLETED', 'CANCELLED')
      )`,
      pendingPaymentTransactionId: sql<number | null>`(
        SELECT t.id FROM ${transactions} t
        WHERE t.order_id = ${orders.id}
          AND t.type = 'PAYMENT'
          AND t.status <> 'SUCCEEDED'
        ORDER BY t.created_at DESC
        LIMIT 1
      )`,
      hasRentals: sql<boolean>`EXISTS (
        SELECT 1 FROM ${rentals} r WHERE r.order_id = ${orders.id}
      )`,
    })
    .from(orders)
    .where(eq(orders.status, "PAID"));
  return rows as unknown as LegacyPaidOrder[];
}

async function dryRun(): Promise<DryRunResult> {
  try {
    const legacy = await loadLegacyOrders();
    const planned = planLegacyPaidMigration(legacy).map((p) => ({
      orderId: p.orderId,
      orderNumber: p.orderNumber,
      from: p.from,
      to: p.to,
      promoteTransactionId: p.promoteTransactionId,
    }));
    return { totalLegacy: legacy.length, planned, unreachable: false };
  } catch (err) {
    console.error("db:migrate:legacy-paid dry-run failed:", err);
    return { totalLegacy: 0, planned: [], unreachable: true };
  }
}

async function apply(): Promise<void> {
  const legacy = await loadLegacyOrders();
  const planned = planLegacyPaidMigration(legacy);
  if (planned.length === 0) {
    console.log("db:migrate:legacy-paid: nothing to migrate.");
    return;
  }
  await db.transaction(async (trx) => {
    const toPromote = planned.filter((p) => p.promoteTransactionId !== null);
    if (toPromote.length > 0) {
      await trx
        .update(transactions)
        .set({ status: "SUCCEEDED", updatedAt: new Date() })
        .where(
          inArray(
            transactions.id,
            toPromote.map((p) => p.promoteTransactionId as number),
          ),
        );
    }
    for (const p of planned) {
      await trx
        .update(orders)
        .set({
          status: p.to,
          paymentStatus: "PAID",
          updatedAt: new Date(),
        })
        .where(eq(orders.id, p.orderId));
    }
  });
  console.log(`db:migrate:legacy-paid: migrated ${planned.length} legacy PAID order(s).`);
}

async function main() {
  const arg = process.argv[2];
  if (arg === "--dry-run" || arg === "dry-run") {
    const res = await dryRun();
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.unreachable ? 1 : 0);
  }
  if (arg === "--apply" || arg === "apply") {
    await apply();
    process.exit(0);
  }
  console.log("Usage: tsx server/db-migrate-legacy-paid.ts [--dry-run|--apply]");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
