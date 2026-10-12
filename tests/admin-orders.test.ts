import { describe, expect, it } from "vitest";
import {
  ADMIN_ORDER_TRANSITIONS,
  adminOrderNextStatuses,
  isAdminOrderTransition,
  splitBySeller,
  type AdminOrderItem,
} from "../server/lib/order-admin";
import {
  ADMIN_RENTAL_TRANSITIONS,
  adminRentalNextStatuses,
  isAdminRentalTransition,
} from "../server/lib/rental-admin";
import {
  STUCK_THRESHOLDS_MS,
  daysOverdue,
  isOrderStuck,
  isRentalOverdue,
  orderSlaState,
} from "../server/lib/order-health";
import { orderEventKey } from "../server/lib/order-events";
import { createDisputeNumber, createRefundNumber } from "../server/lib/reference-numbers";
import { CUSTOMER_CANCELLABLE_FROM } from "../server/lib/order-cancellation";
import { ORDER_STATUSES } from "../server/lib/order-queries";

/**
 * PROMPT 27 — the admin order, rental and health desks, at the level that can be
 * tested without a database.
 *
 * The interesting claims here are the *state machines* and the *derived health
 * rules*, because those are the parts that decide whether an operator can make a
 * move that contradicts what the customer and seller already believe. A transition
 * table that quietly permits `COMPLETED → PROCESSING` is the bug this file exists
 * to catch.
 */

describe("the admin order state machine", () => {
  it("has a transition entry for every known status", () => {
    for (const status of ORDER_STATUSES) {
      expect(ADMIN_ORDER_TRANSITIONS[status]).toBeDefined();
    }
  });

  it("treats COMPLETED and CANCELLED as terminal", () => {
    expect(adminOrderNextStatuses("COMPLETED")).toEqual([]);
    expect(adminOrderNextStatuses("CANCELLED")).toEqual([]);
  });

  it("refuses a no-op and a backwards move", () => {
    expect(isAdminOrderTransition("CONFIRMED", "CONFIRMED")).toBe(false);
    expect(isAdminOrderTransition("SHIPPED", "PROCESSING")).toBe(false);
    expect(isAdminOrderTransition("COMPLETED", "DELIVERED")).toBe(false);
  });

  it("allows the ordinary forward steps", () => {
    expect(isAdminOrderTransition("CONFIRMED", "PROCESSING")).toBe(true);
    expect(isAdminOrderTransition("SHIPPED", "DELIVERED")).toBe(true);
    expect(isAdminOrderTransition("DELIVERED", "COMPLETED")).toBe(true);
  });

  it("allows a pickup to be collected without a shipping step", () => {
    expect(isAdminOrderTransition("READY_FOR_PICKUP", "DELIVERED")).toBe(true);
  });

  it("agrees with the customer cancellation guard about what is cancellable", () => {
    // The admin action reuses `CUSTOMER_CANCELLABLE_FROM`; a status the customer
    // may cancel must be one the admin may cancel through the ordinary table.
    for (const status of CUSTOMER_CANCELLABLE_FROM) {
      expect(adminOrderNextStatuses(status)).toContain("CANCELLED");
    }
  });

  it("answers [] for an unknown status rather than throwing", () => {
    expect(adminOrderNextStatuses("WAT")).toEqual([]);
  });
});

describe("splitBySeller", () => {
  const line = (over: Partial<AdminOrderItem>): AdminOrderItem => ({
    id: 1,
    productId: 1,
    sellerId: 1,
    sellerName: "Seller A",
    mode: "BUY",
    quantity: 1,
    unitPrice: 1000,
    rentalCharge: 0,
    securityDeposit: 0,
    lineTotal: 1000,
    titleSnapshot: "Thing",
    slugSnapshot: "thing",
    fulfillmentStatus: null,
    cancellationReason: null,
    startDate: null,
    endDate: null,
    ...over,
  });

  it("groups lines per seller, separating goods from deposit", () => {
    const split = splitBySeller([
      line({ id: 1, sellerId: 1, sellerName: "A", lineTotal: 1000, securityDeposit: 500 }),
      line({ id: 2, sellerId: 1, sellerName: "A", lineTotal: 2000, securityDeposit: 0 }),
      line({ id: 3, sellerId: 2, sellerName: "B", lineTotal: 3000, securityDeposit: 3000 }),
    ]);

    const a = split.find((entry) => entry.sellerId === 1);
    const b = split.find((entry) => entry.sellerId === 2);
    expect(a).toEqual({
      sellerId: 1,
      sellerName: "A",
      lines: 2,
      goods: 2500,
      deposit: 500,
      total: 3000,
    });
    expect(b).toEqual({
      sellerId: 2,
      sellerName: "B",
      lines: 1,
      goods: 0,
      deposit: 3000,
      total: 3000,
    });
  });

  it("orders the split by descending total", () => {
    const split = splitBySeller([
      line({ sellerId: 1, sellerName: "A", lineTotal: 500, securityDeposit: 0 }),
      line({ sellerId: 2, sellerName: "B", lineTotal: 900, securityDeposit: 0 }),
    ]);
    expect(split.map((entry) => entry.sellerId)).toEqual([2, 1]);
  });

  it("returns nothing for no lines", () => {
    expect(splitBySeller([])).toEqual([]);
  });
});

describe("the admin rental state machine", () => {
  it("treats COMPLETED and CANCELLED as terminal", () => {
    expect(ADMIN_RENTAL_TRANSITIONS.COMPLETED).toEqual([]);
    expect(ADMIN_RENTAL_TRANSITIONS.CANCELLED).toEqual([]);
  });

  it("does not let a confirmed rental jump straight to completed", () => {
    expect(isAdminRentalTransition("CONFIRMED", "COMPLETED")).toBe(false);
    expect(isAdminRentalTransition("CONFIRMED", "ACTIVE")).toBe(true);
  });

  it("lets an in-hand rental be returned", () => {
    expect(isAdminRentalTransition("ACTIVE", "RETURNED")).toBe(true);
    expect(isAdminRentalTransition("OVERDUE", "RETURNED")).toBe(true);
    expect(isAdminRentalTransition("RETURN_PENDING", "RETURNED")).toBe(true);
  });

  it("refuses a no-op", () => {
    expect(isAdminRentalTransition("ACTIVE", "ACTIVE")).toBe(false);
  });

  it("agrees that the return step precedes completion", () => {
    expect(adminRentalNextStatuses("RETURNED")).toContain("COMPLETED");
    expect(adminRentalNextStatuses("COMPLETED")).not.toContain("RETURNED");
  });
});

describe("order SLA", () => {
  const at = (minutesAgo: number, now: Date) => new Date(now.getTime() - minutesAgo * 60_000);
  const now = new Date("2026-06-01T12:00:00.000Z");

  it("flags an order that overran its status budget", () => {
    const order = {
      status: "PENDING_PAYMENT",
      updatedAt: at(31, now),
      createdAt: at(31, now),
    };
    const sla = orderSlaState(order, now);
    expect(sla.stuck).toBe(true);
    expect(sla.thresholdMs).toBe(STUCK_THRESHOLDS_MS.PENDING_PAYMENT);
  });

  it("does not flag an order still inside its budget", () => {
    const order = { status: "PENDING_PAYMENT", updatedAt: at(29, now), createdAt: at(29, now) };
    expect(isOrderStuck(order, now)).toBe(false);
  });

  it("measures from the last move, not creation", () => {
    // Created a month ago, moved a minute ago: not stuck.
    const order = {
      status: "PROCESSING",
      createdAt: new Date(now.getTime() - 30 * 24 * 60 * 60_000),
      updatedAt: at(1, now),
    };
    expect(isOrderStuck(order, now)).toBe(false);
  });

  it("never flags a terminal status", () => {
    const order = { status: "COMPLETED", updatedAt: at(60 * 24, now), createdAt: at(60 * 24, now) };
    expect(orderSlaState(order, now).thresholdMs).toBeNull();
    expect(isOrderStuck(order, now)).toBe(false);
  });

  it("treats a future updatedAt (clock skew) as fresh, never negative", () => {
    const order = {
      status: "CONFIRMED",
      updatedAt: new Date(now.getTime() + 60_000),
      createdAt: new Date(now.getTime() + 60_000),
    };
    const sla = orderSlaState(order, now);
    expect(sla.ageMs).toBe(0);
    expect(sla.stuck).toBe(false);
  });
});

describe("overdue returns", () => {
  const now = new Date("2026-06-10T00:00:00.000Z");

  it("flags an in-hand rental past its return date", () => {
    expect(
      isRentalOverdue({ status: "ACTIVE", endDate: new Date("2026-06-09T00:00:00.000Z") }, now),
    ).toBe(true);
  });

  it("does not flag a rental still within its window", () => {
    expect(
      isRentalOverdue({ status: "ACTIVE", endDate: new Date("2026-06-11T00:00:00.000Z") }, now),
    ).toBe(false);
  });

  it("never flags a closed rental whose date has passed", () => {
    expect(
      isRentalOverdue({ status: "RETURNED", endDate: new Date("2026-06-01T00:00:00.000Z") }, now),
    ).toBe(false);
  });

  it("honours a stored OVERDUE status even without a past date", () => {
    expect(
      isRentalOverdue({ status: "OVERDUE", endDate: new Date("2026-06-11T00:00:00.000Z") }, now),
    ).toBe(true);
  });

  it("counts whole days overdue, floored at zero", () => {
    expect(daysOverdue({ endDate: new Date("2026-06-07T12:00:00.000Z") }, now)).toBe(2);
    expect(daysOverdue({ endDate: new Date("2026-06-11T00:00:00.000Z") }, now)).toBe(0);
  });
});

describe("order event keys", () => {
  it("is stable for the same occurrence", () => {
    expect(orderEventKey("REFUND", 5, "RV-RF-ABC")).toBe(orderEventKey("REFUND", 5, "RV-RF-ABC"));
  });

  it("says nothing for an empty discriminator, so it cannot create a second key", () => {
    expect(orderEventKey("STATUS_CHANGED", 5)).toBe("STATUS_CHANGED:5");
    expect(orderEventKey("STATUS_CHANGED", 5, "")).toBe("STATUS_CHANGED:5");
    expect(orderEventKey("STATUS_CHANGED", 5, null)).toBe("STATUS_CHANGED:5");
  });

  it("bounds the key to the column width", () => {
    expect(orderEventKey("X".repeat(500), 1).length).toBe(190);
  });
});

describe("reference numbers", () => {
  it("uses the unambiguous alphabet and the right prefix", () => {
    expect(createRefundNumber()).toMatch(/^RV-RF-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    expect(createDisputeNumber()).toMatch(/^RV-DSP-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
  });

  it("does not repeat across a run", () => {
    const numbers = new Set(Array.from({ length: 200 }, () => createRefundNumber()));
    expect(numbers.size).toBe(200);
  });
});
