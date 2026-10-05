/**
 * The tables `server/seed.ts` clears, children before parents.
 *
 * ## Why this list exists at all
 *
 * `pnpm db:seed` wipes the database with `TRUNCATE TABLE`, run with
 * `FOREIGN_KEY_CHECKS = 0` — and **TRUNCATE does not cascade even with the checks
 * off**. A table that is not named here survives the wipe with its rows still
 * pointing at rows that no longer exist.
 *
 * The failure surfaces much later and much more confusingly than the cause. The
 * surviving table holds ids that the next run's `AUTO_INCREMENT` hands out again,
 * so the next seed's own inserts collide on a unique index (`review_helpful_votes`
 * aborted on `(review_id, user_id)`) — after the slow bulk work has already run.
 * The error names a unique key in a table the failure is not really about.
 *
 * ## Why it is a module and not an inline array
 *
 * It lives here, side-effect free, so a test can import it. `server/seed.ts` runs
 * its seeder at import time, so nothing may import it — and a list nobody can check
 * is a list nobody will remember to update. `tests/seed-truncate.test.ts` compares
 * this list against every table in `server/schema.ts`, so adding a table without
 * adding it here fails in a second rather than twenty minutes in.
 *
 * Order is children-first purely for clarity: with the checks off MariaDB does not
 * require it.
 */
export const TRUNCATED_TABLES = [
  "transactions",
  // Before `payouts`, and both before `users` — the wallet's own money. A ledger row
  // left behind keeps its `seller_id` pointing at a user the TRUNCATE below has
  // already removed, and the next run's auto-increment hands that id to somebody
  // else: the seller who then opens `/dashboard/wallet` sees another seller's
  // balance, which is the exact failure this list exists to prevent.
  "wallet_transactions",
  "seller_payout_methods",
  "payouts",
  "notification_preferences",
  "notifications",
  "messages",
  "conversation_participants",
  "conversations",
  // Before `reviews` and `users`. A vote row left behind points at a review and a
  // user that the two TRUNCATEs below have already removed, and the next history
  // run re-uses those auto-increment ids.
  "review_helpful_votes",
  "reviews",
  // Before `rentals`: leaving rental_events behind keeps rows pointing at rentals
  // that no longer exist, and their `(rental_id, type)` unique index then rejects
  // the next run's timeline.
  "rental_events",
  "rentals",
  "order_items",
  "orders",
  "cart_items",
  "carts",
  "favorites",
  "product_tags",
  "product_images",
  "products",
  "reports",
  // Before `users`. An audit row is the only record of what an administrator did, so
  // leaving it behind would point `admin_id` at an id the next run hands to a different
  // person — a surviving row would then read as *their* action. `admin_id` is
  // `onDelete: "restrict"` precisely so it cannot be deleted by accident; the wipe has
  // to name it.
  "admin_audit_log",
  "seller_profiles",
  "addresses",
  "sessions",
  "categories",
  "users",
] as const;

export type TruncatedTable = (typeof TRUNCATED_TABLES)[number];
