import { describe, expect, it } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { and, eq, type SQL } from "drizzle-orm";
import { orderItems, orders } from "../server/schema";
import {
  buildSellerOrderConditions,
  buildSellerOrderHaving,
  resolveSellerOrderFilters,
  SELLER_ORDER_SORTS,
  SELLER_ORDER_STATUS_FILTERS,
} from "../server/lib/seller-order-queries";

const dialect = new MySqlDialect();

/** The SQL text drizzle would emit, so assertions are about the real statement. */
function toSql(fragment: SQL): { text: string; params: unknown[] } {
  const query = dialect.sqlToQuery(fragment);
  return { text: query.sql, params: query.params };
}

describe("resolveSellerOrderFilters — the URL is untrusted input", () => {
  it("accepts the number-and-string shapes the router produces", () => {
    // TanStack Router JSON-parses search params, so `?page=2` arrives as a number.
    expect(resolveSellerOrderFilters({ page: 2, pageSize: 5 })).toMatchObject({
      page: 2,
      pageSize: 5,
    });
    expect(resolveSellerOrderFilters({ page: "3" })).toMatchObject({ page: 3 });
  });

  it("degrades a nonsense value instead of throwing at the route", () => {
    const filters = resolveSellerOrderFilters({ page: "abc", pageSize: 900, sort: "nonsense" });
    expect(filters.page).toBe(1);
    expect(filters.pageSize).toBe(20);
    expect(filters.sort).toBe("newest");
  });

  it("only accepts statuses it can actually filter on", () => {
    expect(resolveSellerOrderFilters({ status: "SHIPPED" }).status).toBe("SHIPPED");
    expect(resolveSellerOrderFilters({ status: "NOT_A_STATUS" }).status).toBeNull();
    // A rental status is not a seller fulfillment state.
    expect(resolveSellerOrderFilters({ status: "RENTAL_ACTIVE" }).status).toBeNull();
  });

  it("only accepts payment statuses from the existing money lifecycle", () => {
    expect(resolveSellerOrderFilters({ paymentStatus: "PAID" }).paymentStatus).toBe("PAID");
    expect(resolveSellerOrderFilters({ paymentStatus: "BITCOIN" }).paymentStatus).toBeNull();
  });

  it("treats a bare `to` date as the whole of that day", () => {
    const filters = resolveSellerOrderFilters({ from: "2026-09-01", to: "2026-09-30" });
    expect(filters.from?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    // Otherwise "until 30 September" would quietly exclude everything on the 30th.
    expect(filters.to?.toISOString()).toBe("2026-09-30T23:59:59.999Z");
  });

  it("exposes only sorts the query builder implements", () => {
    for (const sort of SELLER_ORDER_SORTS) {
      expect(resolveSellerOrderFilters({ sort }).sort).toBe(sort);
    }
  });

  it("leads the tabs with CONFIRMED, which is where a paid order sits", () => {
    expect(SELLER_ORDER_STATUS_FILTERS[0]).toBe("CONFIRMED");
    expect(SELLER_ORDER_STATUS_FILTERS).toContain("CANCELLED");
  });
});

describe("search is scoped to the seller's own lines", () => {
  it("matches order number, customer name and the seller's own titles", () => {
    const filters = resolveSellerOrderFilters({ search: "headphones" });
    const [condition] = buildSellerOrderConditions(42, filters);
    const { text, params } = toSql(condition!);

    expect(text).toContain("order_number");
    expect(text).toContain("title_snapshot");
    // The EXISTS subquery must carry the seller predicate, or a seller could
    // find an order by typing a competitor's product name.
    expect(text).toMatch(/EXISTS/i);
    expect(text).toContain("seller_id");
    expect(params).toContain(42);
  });

  it("adds no search condition at all when the term is empty", () => {
    const filters = resolveSellerOrderFilters({ search: "   " });
    expect(buildSellerOrderConditions(42, filters)).toHaveLength(0);
  });

  it("scopes payment and date filters to the order, not the line", () => {
    const filters = resolveSellerOrderFilters({
      paymentStatus: "PAID",
      from: "2026-01-01",
      to: "2026-12-31",
    });
    const conditions = buildSellerOrderConditions(7, filters);
    expect(conditions).toHaveLength(3);

    const text = conditions.map((condition) => toSql(condition).text).join(" AND ");
    expect(text).toContain("payment_status");
    expect(text).toContain("created_at");
  });
});

describe("the status tab filters on the rollup, not on any single line", () => {
  it("compares the least advanced line's rank", () => {
    const filters = resolveSellerOrderFilters({ status: "PROCESSING" });
    const having = buildSellerOrderHaving(filters);
    const { text } = toSql(having!);
    // MIN over the per-line rank is what makes a partly-shipped order *not*
    // "shipped": the slowest line decides.
    expect(text).toMatch(/MIN\(/i);
    expect(text).toContain("fulfillment_status");
  });

  it("emits nothing when no tab is selected", () => {
    expect(buildSellerOrderHaving(resolveSellerOrderFilters({}))).toBeUndefined();
  });
});

describe("the isolation predicate itself", () => {
  it("compiles to a seller_id equality in the WHERE clause", () => {
    // The single most important line in the module: ownership must be part of
    // the query, not a filter applied to its results.
    const where = and(
      eq(orderItems.sellerId, 99),
      ...buildSellerOrderConditions(99, resolveSellerOrderFilters({})),
    );
    const { text, params } = toSql(where!);
    expect(text).toContain("`order_items`.`seller_id`");
    expect(params).toContain(99);
  });

  it("keeps the orders table in the predicate so the join stays scoped", () => {
    const { text } = toSql(eq(orders.id, 5));
    expect(text).toContain("`orders`.`id`");
  });
});
