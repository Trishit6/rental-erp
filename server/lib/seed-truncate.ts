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
  // --- Admin, security, support and growth. Children before parents, always. ---
  // Before `ticket_messages`: an attachment that outlives its message points at
  // a row the next seed will never recreate.
  "ticket_attachments",
  // Before `support_tickets` and `users`.
  "ticket_messages",
  // Before `users` and `orders`.
  "support_tickets",
  // Before `coupons`, `users` and `orders`: a redemption without its coupon or
  // its order is the counter on a coupon nobody can find.
  "coupon_redemptions",
  // Before `orders`, `order_items`, `transactions` and `users`.
  "refunds",
  // Before `orders` and `users`.
  "disputes",
  // Before `users` and `roles`. A surviving grant would hand the next run's
  // administrator a role no row describes.
  "user_roles",
  // Before `roles` and `permissions`.
  "role_permissions",
  // Before `users`.
  "mfa_recovery_codes",
  // Before `users`.
  "user_mfa",
  // Before `users`.
  "login_attempts",
  // Before `users`.
  "security_events",
  // Before `users`.
  "cms_banners",
  // Before `users`.
  "cms_blocks",
  // Before `categories` and `users`.
  "commission_rules",
  // Before `users`.
  "seller_verifications",
  // Before `categories` and `users`.
  "coupons",
  // Before `users`.
  "feature_flags",
  // Before `users`.
  "app_config",
  // Before `users`.
  "export_jobs",
  // Parents of the two junctions above — named last among the RBAC tables.
  "roles",
  "permissions",

  // --- Foundation ---
  // No foreign keys at all — provider webhook receipts, dropped first because
  // nothing else depends on them and nothing they record survives a reseed.
  "payment_webhook_events",
  // Before `orders` and `users`: an order event records *who* moved an order, so
  // a survivor points `actor_id` at an id the next run hands to someone else and
  // the timeline reads as their action.
  "order_events",
  // Before `orders`, `products` and `users`. Holds are meaningless after a reseed
  // — and a survivor would keep dead stock pinned, so the next run's inventory
  // would disagree with what the catalogue actually has.
  "stock_reservations",
  // Before `users`. Replay keys outlive the request they guard; leaving them
  // behind makes a legitimate retry look like a duplicate submission against a
  // request that no longer exists.
  "idempotency_keys",
  // Before `users`. Recent searches belong to the person who made them.
  "search_history",
  // Before `users`. `updated_by` is `set null` on delete, but TRUNCATE does not
  // run delete rules — the column would keep a stale administrator id.
  "platform_settings",
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
