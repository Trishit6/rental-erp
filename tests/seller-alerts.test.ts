import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LOW_STOCK_THRESHOLD,
  RETURNING_SOON_DAYS,
  daysUntil,
  isLowStock,
  isReturningSoon,
} from "../server/lib/seller-alerts";
import { stripComments } from "./support/source-scanning";

/**
 * Seller alerts (PROMPT 21).
 *
 * The threshold predicates are the whole feature — an off-by-one here is a
 * listing that sells out silently, or a rental nobody knows is overdue — so they
 * are pinned at the boundary without a database. The scoping assertion reads the
 * query source, because "only this seller's stock" is a property of the WHERE
 * clause and cannot be observed from a pure helper.
 */

const ROOT = join(__dirname, "..");
const DAY_MS = 24 * 60 * 60 * 1000;

describe("the low-stock line", () => {
  it("flags a listing at or below the threshold, and empty most of all", () => {
    expect(isLowStock(0)).toBe(true);
    expect(isLowStock(LOW_STOCK_THRESHOLD)).toBe(true);
    expect(isLowStock(LOW_STOCK_THRESHOLD + 1)).toBe(false);
  });

  it("accepts an explicit threshold, so the boundary is one definition", () => {
    expect(isLowStock(5, 5)).toBe(true);
    expect(isLowStock(6, 5)).toBe(false);
  });

  it("keeps the threshold a small positive number", () => {
    expect(LOW_STOCK_THRESHOLD).toBeGreaterThan(0);
    expect(LOW_STOCK_THRESHOLD).toBeLessThanOrEqual(5);
  });
});

describe("the returning-soon window", () => {
  const now = new Date("2026-05-01T09:00:00.000Z");
  const plus = (days: number) => new Date(now.getTime() + days * DAY_MS);

  it("counts whole days up, so 'due tomorrow' reads as 1", () => {
    expect(daysUntil(plus(1), now)).toBe(1);
    expect(daysUntil(plus(3), now)).toBe(3);
  });

  it("goes negative once the date has passed — overdue is urgent, not invisible", () => {
    expect(daysUntil(plus(-2), now)).toBeLessThan(0);
    expect(isReturningSoon(plus(-2), now)).toBe(true);
  });

  it("includes the last day of the window and excludes the day after", () => {
    expect(isReturningSoon(plus(RETURNING_SOON_DAYS), now)).toBe(true);
    expect(isReturningSoon(plus(RETURNING_SOON_DAYS + 1), now)).toBe(false);
  });
});

describe("alerts are scoped to the caller's own rows", () => {
  const source = readFileSync(join(ROOT, "server/lib/seller-alerts.ts"), "utf8");
  const code = stripComments(source);

  it("reads the file it means to be checking", () => {
    expect(code).toContain("export async function getSellerAlerts");
  });

  it("puts the seller in the WHERE clause of both queries, not a filter afterwards", () => {
    // A seller's stock levels and inbound rentals are theirs alone; hiding them
    // in the UI would still ship them over the wire.
    expect(code).toContain("eq(products.sellerId, sellerId)");
    expect(code).toContain("eq(rentals.ownerId, sellerId)");
  });
});
