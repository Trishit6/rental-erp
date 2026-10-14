import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SELLER_FULFILLMENT_STATES } from "../server/lib/order-fulfillment";
import {
  ORDER_STATUS_BODY,
  ORDER_STATUS_NOTIFICATION,
  orderStatusLabel,
} from "../server/lib/order-notifications";
import { stripComments } from "./support/source-scanning";

/**
 * Bulk fulfilment and the customer notification (PROMPT 21).
 *
 * The live writes need a database; what is pinned here is the shape the code must
 * keep for the write to be safe: the batch is validated **before** it opens a
 * transaction (atomic, no half-applied list), it is scoped to the caller's own
 * lines, and it tells the customer in the same words the admin path uses.
 */

const ROOT = join(__dirname, "..");

describe("the bulk endpoint is atomic and seller-scoped", () => {
  const source = readFileSync(join(ROOT, "server/routes/seller-orders.ts"), "utf8");
  const code = stripComments(source);

  it("reads the file it means to be checking", () => {
    // Anchored on the path, not on `sellerOrdersRoute.patch(` — the registration may be
    // wrapped by the rate-limit `guarded(...)` helper, which changes the call shape but
    // not which endpoint this is.
    expect(code).toContain('"/bulk-fulfillment"');
  });

  it("derives the seller from the session", () => {
    expect(code).toContain("const user = requireSeller(c)");
  });

  it("validates every line before it writes any of them", () => {
    // Scope to the bulk handler: the single-line endpoint above it has its own
    // validation and transaction, and matching those would prove nothing.
    const bulk = code.slice(code.indexOf('"/bulk-fulfillment"'));
    const validateAt = bulk.indexOf("assertFulfillmentTransition(detail.order.status");
    const writeAt = bulk.indexOf("await db.transaction");
    expect(validateAt).toBeGreaterThan(-1);
    expect(writeAt).toBeGreaterThan(-1);
    // The transition check is in the resolve loop, above the transaction. A batch
    // that validated inside the write would commit its first rows before refusing
    // its last.
    expect(validateAt).toBeLessThan(writeAt);
  });

  it("scopes every line it touches to the caller", () => {
    expect(code).toContain("eq(orderItems.sellerId, user.id)");
  });

  it("de-duplicates references so one order is never written twice", () => {
    expect(code).toContain("new Set(input.references)");
  });

  it("notifies the customer, discriminated by seller", () => {
    expect(code).toContain("notifyOrderProgress");
    expect(code).toContain("discriminator: user.id");
  });
});

describe("the shared notification map", () => {
  it("announces every step a seller can set", () => {
    for (const status of SELLER_FULFILLMENT_STATES) {
      expect(ORDER_STATUS_NOTIFICATION[status], status).toBeTruthy();
      expect(ORDER_STATUS_BODY[status], status).toBeTruthy();
    }
  });

  it("leaves the order's own money and cancellation events to their own paths", () => {
    // Announced where they originate (payment, cancellation), not by a status move.
    expect(ORDER_STATUS_NOTIFICATION.PENDING_PAYMENT).toBeUndefined();
    expect(ORDER_STATUS_NOTIFICATION.CANCELLED).toBeUndefined();
  });

  it("renders a status as prose, not an enum", () => {
    expect(orderStatusLabel("READY_FOR_PICKUP")).toBe("ready for pickup");
    expect(orderStatusLabel("COMPLETED")).toBe("completed");
  });
});
