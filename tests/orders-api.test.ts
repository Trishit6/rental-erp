import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api/client";
import { getOrderByRef, getOrders } from "@/features/orders/api";
import {
  makeOrderDetails,
  makeOrderListResponse,
  makeOrderSummary,
} from "./support/order-fixtures";

vi.mock("@/lib/api/client", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

beforeEach(() => {
  vi.mocked(api.get).mockReset();
});

describe("reading the order list", () => {
  it("sends no params at all when nothing is filtered", () => {
    vi.mocked(api.get).mockResolvedValue({ data: [], pagination: undefined } as never);

    void getOrders();

    expect(api.get).toHaveBeenCalledWith("/orders");
  });

  it("sends only the filters that are set", () => {
    vi.mocked(api.get).mockResolvedValue({ data: [], pagination: undefined } as never);

    void getOrders({ status: "DELIVERED", type: "RENTAL", page: 2 });

    const [path] = vi.mocked(api.get).mock.calls[0];
    expect(path).toContain("status=DELIVERED");
    expect(path).toContain("type=RENTAL");
    expect(path).toContain("page=2");
    // Sort was not chosen, so it must not be sent as a default.
    expect(path).not.toContain("sort=");
  });

  it("carries a search term through", () => {
    vi.mocked(api.get).mockResolvedValue({ data: [], pagination: undefined } as never);

    void getOrders({ search: "headphones" });

    expect(vi.mocked(api.get).mock.calls[0][0]).toContain("search=headphones");
  });

  it("never sends a user id — the server derives the owner from the session", () => {
    // The absence of this field is the IDOR defence. There is no way to request
    // someone else's orders even by editing the request.
    vi.mocked(api.get).mockResolvedValue({ data: [], pagination: undefined } as never);

    void getOrders({ search: "x", page: 1, status: "DELIVERED" } as never);

    const [path] = vi.mocked(api.get).mock.calls[0];
    expect(path).not.toContain("userId");
    expect(path).not.toContain("user_id");
  });

  it("reads the server's pagination envelope", () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [makeOrderSummary()],
      pagination: { page: 2, pageSize: 10, total: 37, totalPages: 4 },
    } as never);

    return getOrders({ page: 2 }).then((result) => {
      expect(result.total).toBe(37);
      expect(result.totalPages).toBe(4);
      expect(result.page).toBe(2);
      expect(result.orders).toHaveLength(1);
    });
  });

  it("degrades safely when the server sends no pagination block", () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [makeOrderSummary()],
      pagination: undefined,
    } as never);

    return getOrders().then((result) => {
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });
  });

  it("fetches server-side rather than filtering a whole history in the browser", () => {
    // Each filter combination is its own request, so search covers the entire
    // order history and not just the current page.
    vi.mocked(api.get).mockResolvedValue({ data: [], pagination: undefined } as never);

    void getOrders({ search: "sofa", status: "DELIVERED", sort: "total_desc" });

    const [path] = vi.mocked(api.get).mock.calls[0];
    expect(path).toContain("/orders?");
    expect(path).toContain("sort=total_desc");
  });
});

describe("reading one order", () => {
  it("asks by the public order number, which is what the UI links with", () => {
    vi.mocked(api.get).mockResolvedValue({ data: makeOrderDetails() } as never);

    void getOrderByRef("RV-2026-8F3K2A");

    expect(api.get).toHaveBeenCalledWith("/orders/RV-2026-8F3K2A");
  });

  it("accepts a legacy numeric id", () => {
    vi.mocked(api.get).mockResolvedValue({ data: makeOrderDetails() } as never);

    void getOrderByRef(42);

    expect(api.get).toHaveBeenCalledWith("/orders/42");
  });

  it("escapes the reference rather than trusting it", () => {
    vi.mocked(api.get).mockResolvedValue({ data: makeOrderDetails() } as never);

    void getOrderByRef("RV-2026-8F3K2A/../admin");

    expect(api.get).toHaveBeenCalledWith("/orders/RV-2026-8F3K2A%2F..%2Fadmin");
  });

  it("returns the whole details payload the page needs", () => {
    vi.mocked(api.get).mockResolvedValue({ data: makeOrderDetails() } as never);

    return getOrderByRef("RV-2026-8F3K2A").then((detail) => {
      expect(detail.order.orderNumber).toBe("RV-2026-8F3K2A");
      expect(detail.items).toHaveLength(1);
      expect(detail.sellers).toHaveLength(1);
      expect(detail.payment?.paymentMethod).toBe("UPI");
    });
  });

  it("passes an error through untouched so the page can branch on the status", async () => {
    const notFound = Object.assign(new Error("Order not found."), { status: 404 });
    vi.mocked(api.get).mockRejectedValue(notFound);

    await expect(getOrderByRef("RV-2026-8F3K2A")).rejects.toBe(notFound);
  });
});

describe("the list payload", () => {
  it("preserves the server's shape for a rental order", () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [makeOrderSummary()],
      pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    } as never);

    return getOrders().then(({ orders }) => {
      expect(orders[0].orderNumber).toBe("RV-2026-8F3K2A");
      expect(orders[0].itemCount).toBe(1);
      expect(orders[0].preview?.title).toBe("Sony Headphones");
      expect(orders[0].sellers[0].name).toBe("Priya");
    });
  });

  it("carries the rental markers a card needs to render", () => {
    const list = makeOrderListResponse([makeOrderSummary()]);
    expect(list.orders[0].rentalStatus).toBeNull();
  });
});
