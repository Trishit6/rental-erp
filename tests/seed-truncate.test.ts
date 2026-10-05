import { getTableName, is, Table } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "../server/schema";
import { TRUNCATED_TABLES } from "../server/lib/seed-truncate";

/**
 * `pnpm db:seed` wipes the database with `TRUNCATE TABLE` under
 * `FOREIGN_KEY_CHECKS = 0`, which does **not** cascade. Every table therefore has to
 * be named by hand.
 *
 * The failure mode for a forgotten table is nasty enough to be worth a test: the
 * orphans survive, the next run's `AUTO_INCREMENT` hands the same ids out again, and
 * the seed aborts on a unique index (`review_helpful_votes` on `(review_id, user_id)`)
 * — long after the slow bulk work, and naming a table that has nothing to do with
 * the real problem.
 *
 * `server/seed.ts` cannot be imported to check this: it runs its seeder at import
 * time, and a test that imported it would wipe the developer's database. The list
 * therefore lives in `server/lib/seed-truncate.ts`, which has no side effects.
 *
 * The expected set is read from the schema *objects* rather than by parsing
 * `schema.ts` as text: a regex that quietly stopped matching would make every
 * assertion below pass while checking nothing.
 */
const schemaTables = Object.entries(schema)
  .filter((entry): entry is [string, Table] => is(entry[1], Table))
  .map(([, table]) => getTableName(table));

describe("the demo seed truncates every table", () => {
  it("finds the schema tables at all", () => {
    expect(schemaTables.length).toBeGreaterThan(20);
  });

  it("clears every table in the schema", () => {
    const listed = new Set<string>(TRUNCATED_TABLES);
    expect(schemaTables.filter((table) => !listed.has(table))).toEqual([]);
  });

  it("names no table that is not in the schema", () => {
    // The other direction: a typo, or a table that was since renamed, would abort
    // the seed with a much less obvious error.
    const known = new Set(schemaTables);
    expect(TRUNCATED_TABLES.filter((table) => !known.has(table))).toEqual([]);
  });

  it("clears each table exactly once", () => {
    expect(new Set(TRUNCATED_TABLES).size).toBe(TRUNCATED_TABLES.length);
  });

  it("clears children before the parents they point at", () => {
    // With the FK checks off MariaDB does not care about the order, but reading the
    // list top to bottom should still describe a sensible teardown — and a table
    // inserted in the wrong place is usually a sign the relationships were misread.
    const order = new Map<string, number>(TRUNCATED_TABLES.map((table, i) => [table, i]));

    const childrenFirst: [string, string][] = [
      ["review_helpful_votes", "reviews"],
      ["review_helpful_votes", "users"],
      ["reviews", "users"],
      ["rental_events", "rentals"],
      ["rentals", "orders"],
      ["order_items", "orders"],
      // The wallet. `wallet_transactions` points at `payouts`, `orders`, `rentals`
      // and `order_items` as well as `users`, so it has to lead them all; the
      // payout methods point at a payout, so they come after nothing that matters
      // but before `users`.
      ["wallet_transactions", "payouts"],
      ["wallet_transactions", "orders"],
      ["wallet_transactions", "rentals"],
      ["wallet_transactions", "users"],
      ["seller_payout_methods", "users"],
      ["payouts", "users"],
      ["cart_items", "carts"],
      ["messages", "conversations"],
      ["conversation_participants", "conversations"],
      ["product_images", "products"],
      ["product_tags", "products"],
      ["favorites", "users"],
      // Messaging. `messages` points at both the conversation and its sender, so it
      // has to lead the participants too, not just the conversation.
      ["messages", "users"],
      ["conversation_participants", "users"],
      ["notifications", "users"],
      // One preferences row per user, so it dies with them.
      ["notification_preferences", "users"],
      // The audit log records who did what; a surviving row would attribute this run's
      // history to whoever the next run gives that id.
      ["admin_audit_log", "users"],
    ];

    for (const [child, parent] of childrenFirst) {
      expect(order.get(child)).toBeLessThan(order.get(parent) as number);
    }
  });
});
