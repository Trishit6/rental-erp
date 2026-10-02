import { describe, expect, it } from "vitest";
import {
  ORDER_SORTS,
  ORDER_STATUSES,
  ORDER_STATUS_FILTERS,
  ORDER_TYPES,
  RENTAL_STATUSES,
  buildOrderListSort,
  isOrderStatusFilter,
  isRentalStatusFilter,
  ordersListQuerySchema,
  resolveOrderFilters,
  toRentalStatus,
} from "../server/lib/order-queries";

/**
 * The order list query contract.
 *
 * These params arrive from a URL a customer can type, so the important property
 * is that *nothing* throws and everything degrades to a usable list. A bad sort
 * should not 400 the page.
 */

describe("filter vocabulary", () => {
  it("exposes the order lifecycle and the rental states as one flat list", () => {
    for (const status of ORDER_STATUSES) expect(ORDER_STATUS_FILTERS).toContain(status);
    for (const status of RENTAL_STATUSES) {
      expect(ORDER_STATUS_FILTERS).toContain(`RENTAL_${status}`);
    }
  });

  it("namespaces the rental axis so a value cannot mean two things", () => {
    // `CONFIRMED` is both an order status and a rental status, and they are
    // different columns. Sharing the value would leave one chip unreachable.
    expect(ORDER_STATUS_FILTERS).toContain("CONFIRMED");
    expect(ORDER_STATUS_FILTERS).toContain("RENTAL_CONFIRMED");
    expect(new Set(ORDER_STATUS_FILTERS).size).toBe(ORDER_STATUS_FILTERS.length);
  });

  it("distinguishes an order status from a rental status", () => {
    expect(isRentalStatusFilter("RENTAL_ACTIVE")).toBe(true);
    expect(isRentalStatusFilter("RENTAL_CONFIRMED")).toBe(true);
    expect(isRentalStatusFilter("DELIVERED")).toBe(false);
    // The unprefixed rental status is not a valid *filter* value.
    expect(isRentalStatusFilter("ACTIVE")).toBe(false);
    expect(isOrderStatusFilter("DELIVERED")).toBe(true);
    expect(isOrderStatusFilter("RENTAL_ACTIVE")).toBe(true);
  });

  it("maps a namespaced filter back to the column value", () => {
    expect(toRentalStatus("RENTAL_ACTIVE")).toBe("ACTIVE");
    expect(toRentalStatus("RENTAL_RETURN_PENDING")).toBe("RETURN_PENDING");
  });

  it("rejects values outside the vocabulary", () => {
    expect(isOrderStatusFilter("OUT_FOR_DELIVERY")).toBe(false);
    expect(isOrderStatusFilter(null)).toBe(false);
    expect(isRentalStatusFilter("RENTAL_MELTING")).toBe(false);
  });
});

describe("resolving raw query params", () => {
  it("defaults to page 1, newest, no filters", () => {
    const filters = resolveOrderFilters({});
    expect(filters).toMatchObject({
      page: 1,
      pageSize: 20,
      search: "",
      status: null,
      type: null,
      sort: "newest",
      from: null,
      to: null,
    });
  });

  it("coerces numeric strings — query params arrive as text", () => {
    const filters = resolveOrderFilters({ page: "3", pageSize: "5" });
    expect(filters.page).toBe(3);
    expect(filters.pageSize).toBe(5);
  });

  it("never throws on nonsense, falling back to defaults", () => {
    for (const raw of [
      { page: "abc" },
      { page: "-4" },
      { pageSize: "9999" },
      { sort: "by_vibes" },
      { status: "NOT_A_STATUS" },
      { type: "NOT_A_TYPE" },
      { from: "not-a-date" },
      { to: "2026-13-45" },
    ]) {
      const filters = resolveOrderFilters(raw);
      expect(filters.page).toBeGreaterThanOrEqual(1);
      expect(ORDER_SORTS).toContain(filters.sort);
      expect(filters.status === null || ORDER_STATUS_FILTERS.includes(filters.status)).toBe(true);
    }
  });

  it("caps the page size so a hand-edited URL cannot ask for everything", () => {
    expect(resolveOrderFilters({ pageSize: "100000" }).pageSize).toBe(20);
    expect(resolveOrderFilters({ pageSize: "50" }).pageSize).toBe(50);
  });

  it("accepts a real status, type and sort", () => {
    const filters = resolveOrderFilters({
      status: "DELIVERED",
      type: "RENTAL",
      sort: "total_desc",
      search: "  headphones  ",
    });
    expect(filters.status).toBe("DELIVERED");
    expect(filters.type).toBe("RENTAL");
    expect(filters.sort).toBe("total_desc");
    // Trimmed, so a stray space does not become a literal wildcard search.
    expect(filters.search).toBe("headphones");
  });

  it("expands a bare `to` date to the end of that day", () => {
    // Otherwise "until 4 March" silently excludes everything ordered on the 4th.
    const { to } = resolveOrderFilters({ to: "2026-03-04" });
    expect(to?.toISOString()).toBe("2026-03-04T23:59:59.999Z");
  });

  it("anchors a bare `from` date to the start of that day", () => {
    const { from } = resolveOrderFilters({ from: "2026-03-04" });
    expect(from?.toISOString()).toBe("2026-03-04T00:00:00.000Z");
  });

  it("truncates an absurdly long search rather than passing it through", () => {
    const filters = resolveOrderFilters({ search: "x".repeat(500) });
    expect(filters.search.length).toBeLessThanOrEqual(120);
  });
});

describe("the zod mirror", () => {
  it("agrees with the resolver on what is valid", () => {
    // The hook validates its own request with this schema; the two must not
    // drift, or the browser would build a query the server rejects.
    expect(ordersListQuerySchema.safeParse({ page: "2", sort: "oldest" }).success).toBe(true);
    const parsed = ordersListQuerySchema.parse({ page: "not-a-number" });
    expect(parsed.page).toBe(1);
  });
});

describe("type vocabulary", () => {
  it("offers exactly the three order types the model can hold", () => {
    expect(ORDER_TYPES).toEqual(["PURCHASE", "RENTAL", "MIXED"]);
  });

  it("offers exactly the sort options the server implements", () => {
    // Every entry must have a real ORDER BY in `buildOrderListSort` — a sort
    // nothing can produce is a filter that can only ever return nothing.
    expect(ORDER_SORTS).toEqual([
      "newest",
      "oldest",
      "total_desc",
      "total_asc",
      "updated_desc",
    ]);
    for (const sort of ORDER_SORTS) {
      expect(buildOrderListSort(sort).length).toBeGreaterThan(0);
    }
  });
});
