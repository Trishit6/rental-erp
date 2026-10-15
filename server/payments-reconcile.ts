import { reconcilePendingPaymentIntents } from "./lib/payments/reconciliation";

async function main(): Promise<void> {
  const count = await reconcilePendingPaymentIntents();
  console.log(`Reconciliation complete: ${count} intent(s) finalised.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Reconciliation failed:", err);
  process.exit(1);
});