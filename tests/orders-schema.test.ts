import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  buildOrderTimeline,
  hasActiveFilters,
  parseOrderRouteParam,
  parseOrdersSearch,
  statusLabel,
  statusTone,
} from "@/features/orders/components/schema";
import { itemModeLabel, orderTypeLabel } from "@/features/orders/types";

describe("parsing the orders URL", () => {
  it("returns an empty object for no params", () => {
    expect(parseOrdersSearch({})).toEqual({});
    expect(parseOrdersSearch(undefined)).toEqual({});
  });

  it("accepts a page as a number or a numeric string", () => {
    // TanStack Router JSON-parses search params, so both shapes are real.
    expect(parseOrdersSearch({ page: 3 }).page).toBe(3);
    expect(parseOrdersSearch({ page: "3" }).page).toBe(3);
  });

  it("never throws and drops invalid values", () => {
    for (const input of [
      { page: "abc" },
      { page: -2 },
      { page: 0 },
      { status: "NOT_A_STATUS" },
      { type: "NOT_A_TYPE" },
      { sort: "sideways" },
      { from: "nonsense" },
      { to: "2026-99-99" },
    ]) {
      expect(() => parseOrdersSearch(input)).not.toThrow();
    }
    expect(parseOrdersSearch({ status: "NOT_A_STATUS" }).status).toBeUndefined();
    expect(parseOrdersSearch({ sort: "sideways" }).sort).toBeUndefined();
    expect(parseOrdersSearch({ from: "nonsense" }).from).toBeUndefined();
  });

  it("keeps only known statuses and sorts", () => {
    expect(parseOrdersSearch({ status: "DELIVERED" }).status).toBe("DELIVERED");
    // A rental filter is namespaced, so a bare rental status is not a filter value.
    expect(parseOrdersSearch({ status: "RENTAL_ACTIVE" }).status).toBe("RENTAL_ACTIVE");
    expect(parseOrdersSearch({ status: "ACTIVE" }).status).toBeUndefined();
    expect(parseOrdersSearch({ sort: "total_desc" }).sort).toBe("total_desc");
    expect(parseOrdersSearch({ type: "MIXED" }).type).toBe("MIXED");
  });

  it("trims a search and drops an empty one", () => {
    expect(parseOrdersSearch({ search: "  sofa  " }).search).toBe("sofa");
    expect(parseOrdersSearch({ search: "   " }).search).toBeUndefined();
  });

  it("bounds the search length", () => {
    expect(parseOrdersSearch({ search: "x".repeat(500) }).search).toHaveLength(120);
  });
});

describe("route param parsing", () => {
  it("accepts a public order number", () => {
    expect(parseOrderRouteParam("RV-2026-8F3K2A")).toBe("RV-2026-8F3K2A");
  });

  it("normalises the case of an order number", () => {
    // A customer typing a URL by hand should not be punished for lowercase.
    expect(parseOrderRouteParam("rv-2026-8f3k2a")).toBe("RV-2026-8F3K2A");
  });

  it("accepts a legacy numeric id so old links keep working", () => {
    expect(parseOrderRouteParam("42")).toBe("42");
    expect(parseOrderRouteParam(42)).toBe("42");
  });

  it("rejects anything that cannot identify an order", () => {
    for (const value of ["", "   ", "abc", "RV-2026-TOOSHORT", "0", "-1", null, undefined, {}]) {
      expect(parseOrderRouteParam(value)).toBeNull();
    }
  });
});

describe("filter presence", () => {
  it("knows when nothing is narrowing the list", () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ sort: "oldest", page: 2 })).toBe(false);
    expect(hasActiveFilters({ search: "sofa" })).toBe(true);
    expect(activeFilterCount({ search: "sofa", status: "DELIVERED" })).toBe(2);
  });
});

describe("status presentation", () => {
  it("labels known statuses", () => {
    expect(statusLabel("DELIVERED")).toBe("Delivered");
    // A badge reads "Rental · Active", not "Rental · Rental active".
    expect(statusLabel("ACTIVE")).toBe("Active");
    expect(statusLabel("READY_FOR_PICKUP")).toBe("Ready for pickup");
  });

  it("renders an unknown status as readable words, not blank", () => {
    // Statuses live in a varchar, so a future feature can write one this build
    // has never heard of. Blanking it would hide a real state from a customer.
    expect(statusLabel("OUT_FOR_DELIVERY")).toBe("Out For Delivery");
    expect(statusLabel("AWAITING_PICKUP")).toBe("Awaiting Pickup");
  });

  it("keeps cancelled and failed visually distinct from done", () => {
    expect(statusTone("DELIVERED")).toBe("success");
    expect(statusTone("CANCELLED")).toBe("danger");
    expect(statusTone("FAILED")).toBe("danger");
    expect(statusTone("PENDING_PAYMENT")).toBe("warning");
    expect(statusTone("SHIPPED")).toBe("info");
  });
});

describe("order labels", () => {
  it("calls a MIXED order Rent & Buy", () => {
    expect(orderTypeLabel("MIXED")).toBe("Rent & Buy");
    expect(orderTypeLabel("PURCHASE")).toBe("Purchase");
    expect(orderTypeLabel("RENTAL")).toBe("Rental");
  });

  it("labels an item's mode", () => {
    expect(itemModeLabel("BUY")).toBe("Buy");
    expect(itemModeLabel("RENT")).toBe("Rent");
  });
});

describe("building the timeline", () => {
  const order = {
    status: "CONFIRMED" as const,
    createdAt: "2026-09-29T05:50:00.000Z",
    deliveryMethod: "DELIVERY",
    paymentStatus: "PAID",
  };

  it("never invents a timestamp", () => {
    // The schema records the current status, not when each status was reached.
    // A step with no recorded time must render without one.
    const events = buildOrderTimeline({
      order,
      payment: { createdAt: "2026-09-29T05:51:00.000Z", status: "PAID" },
      rentals: [],
    });

    const placed = events.find((event) => event.key === "placed");
    const payment = events.find((event) => event.key === "payment");
    const confirmed = events.find((event) => event.key === "confirmed");

    expect(placed?.at).toBe(order.createdAt);
    expect(payment?.at).toBe("2026-09-29T05:51:00.000Z");
    expect(confirmed?.at).toBeNull();
    // Every fulfilment step is timestamp-free.
    for (const event of events.filter((e) => e.key !== "placed" && e.key !== "payment")) {
      expect(event.at).toBeNull();
    }
  });

  it("marks the current step and leaves later ones waiting", () => {
    const events = buildOrderTimeline({
      order,
      payment: { createdAt: "2026-09-29T05:51:00.000Z", status: "PAID" },
      rentals: [],
    });

    expect(events.find((e) => e.key === "payment")?.state).toBe("done");
    expect(events.find((e) => e.key === "confirmed")?.state).toBe("current");
    expect(events.find((e) => e.key === "shipped")?.state).toBe("pending");
  });

  it("uses pickup language for a pickup order", () => {
    const events = buildOrderTimeline({
      order: { ...order, deliveryMethod: "PICKUP" },
      payment: null,
      rentals: [],
    });
    expect(events.map((e) => e.key)).toContain("ready");
    expect(events.map((e) => e.key)).not.toContain("shipped");
  });

  it("stops at cancellation instead of showing a fulfilment ladder", () => {
    const events = buildOrderTimeline({
      order: { ...order, status: "CANCELLED" },
      payment: null,
      rentals: [],
    });
    expect(events.at(-1)?.key).toBe("cancelled");
    expect(events.map((e) => e.key)).not.toContain("shipped");
  });

  it("reports a failed payment without claiming confirmation", () => {
    const events = buildOrderTimeline({
      order: { ...order, paymentStatus: "FAILED" },
      payment: { createdAt: "2026-09-29T05:51:00.000Z", status: "FAILED" },
      rentals: [],
    });
    expect(events.find((e) => e.key === "payment-failed")?.state).toBe("failed");
    expect(events.find((e) => e.key === "payment")).toBeUndefined();
  });

  it("surfaces an active rental as its own verified step", () => {
    const events = buildOrderTimeline({
      order: { ...order, deliveryMethod: "PICKUP" },
      payment: null,
      rentals: [{ status: "ACTIVE" }],
    });
    expect(events.find((e) => e.key === "rental-active")?.state).toBe("done");
  });
});
