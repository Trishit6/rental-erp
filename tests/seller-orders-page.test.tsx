import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SellerOrdersPage } from "@/features/seller-orders";
import {
  SELLER_NEXT_STATES,
  SELLER_ORDER_STATUS_FILTERS,
  commonNextStates,
  type SellerOrderDetail,
  type SellerOrderSummary,
} from "@/features/seller-orders/types";
import { allowedTransitions } from "../server/lib/order-fulfillment";
import { SELLER_ORDER_STATUS_FILTERS as SERVER_STATUS_FILTERS } from "../server/lib/seller-order-queries";

/**
 * The seller order desk (PROMPT 21).
 *
 * Two kinds of assertion live here:
 *
 *  - **behaviour** — the page expands to the server's own actions, and a bulk
 *    action is held for its undo window before anything is sent;
 *  - **drift** — the client's transition table and status tabs are walked against
 *    the server's real ones, because a client that offers a step the server will
 *    refuse is a button that fails in production and passes here.
 */

const mocks = vi.hoisted(() => ({
  list: {
    data: {
      items: [] as SellerOrderSummary[],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
    },
    isLoading: false,
    isError: false,
  },
  detail: { data: null as SellerOrderDetail | null, isLoading: false, isError: false },
  fulfill: vi.fn(),
  cancel: vi.fn(),
  bulk: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to?: unknown; children?: ReactNode }) => (
    <a href={typeof to === "string" ? to : "#"} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/features/seller-orders/query", () => ({
  useSellerOrders: () => mocks.list,
  useSellerOrder: () => mocks.detail,
  useSetFulfillment: () => ({ mutate: mocks.fulfill, isPending: false }),
  useCancelSellerOrder: () => ({ mutate: mocks.cancel, isPending: false }),
  useBulkFulfillment: () => ({ mutate: mocks.bulk, isPending: false }),
}));

function orderSummary(overrides: Partial<SellerOrderSummary> = {}): SellerOrderSummary {
  return {
    id: 1,
    orderNumber: "RV-2026-0001",
    status: "CONFIRMED",
    fulfillmentStatus: "CONFIRMED",
    paymentStatus: "PAID",
    itemCount: 1,
    unitCount: 1,
    sellerSubtotal: 250000,
    currency: "INR",
    deliveryMethod: "DELIVERY",
    createdAt: "2026-05-01T10:00:00.000Z",
    customerName: "Priya",
    canCancel: true,
    ...overrides,
  };
}

function orderDetail(overrides: Partial<SellerOrderDetail> = {}): SellerOrderDetail {
  return {
    order: {
      ...orderSummary(),
      paymentProvider: "sandbox",
      paymentReference: "pay_1",
      placedAt: "2026-05-01T10:00:00.000Z",
    },
    items: [
      {
        id: 11,
        productId: 7,
        productSlug: "oak-chair",
        title: "Oak chair",
        imageUrl: null,
        condition: "GOOD",
        mode: "BUY",
        quantity: 1,
        unitPrice: 250000,
        rentalCharge: 0,
        securityDeposit: 0,
        lineTotal: 250000,
        fulfillmentStatus: "CONFIRMED",
        startDate: null,
        endDate: null,
        rentalDays: null,
      },
    ],
    delivery: {
      method: "DELIVERY",
      address: {
        name: "Priya",
        phone: "9990000000",
        line1: "1 Main St",
        line2: null,
        city: "Pune",
        state: "MH",
        postalCode: "411001",
        country: "India",
      },
    },
    customer: { name: "Priya", phone: "9990000000" },
    timeline: [],
    actions: { next: ["PROCESSING"], canCancel: true, canSetFulfillment: true },
    ...overrides,
  };
}

function listWith(items: SellerOrderSummary[]) {
  mocks.list = {
    data: {
      items,
      pagination: { page: 1, pageSize: 20, total: items.length, totalPages: 1 },
    },
    isLoading: false,
    isError: false,
  };
}

beforeEach(() => {
  mocks.list = {
    data: {
      items: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
    },
    isLoading: false,
    isError: false,
  };
  mocks.detail = { data: null, isLoading: false, isError: false };
  mocks.fulfill.mockReset();
  mocks.cancel.mockReset();
  mocks.bulk.mockReset();
});

describe("the seller order desk", () => {
  it("shows an empty state when the seller has no orders", () => {
    render(<SellerOrdersPage />);
    expect(screen.getByText("No orders yet")).toBeInTheDocument();
  });

  it("renders each order with its own subtotal, not the whole order's", () => {
    listWith([orderSummary(), orderSummary({ id: 2, orderNumber: "RV-2026-0002" })]);
    render(<SellerOrdersPage />);

    expect(screen.getByText("Order RV-2026-0001")).toBeInTheDocument();
    expect(screen.getByText("Order RV-2026-0002")).toBeInTheDocument();
    // `sellerSubtotal` is this seller's lines only.
    expect(screen.getAllByText("₹2,500")).toHaveLength(2);
  });

  it("scopes the bulk bar to rows that still have a step to take", () => {
    listWith([
      orderSummary(),
      orderSummary({ id: 2, orderNumber: "RV-2026-0002", fulfillmentStatus: "COMPLETED" }),
    ]);
    render(<SellerOrdersPage />);

    const selectable = screen.getByRole("checkbox", {
      name: "Select order RV-2026-0001 for a bulk action",
    });
    const done = screen.getByRole("checkbox", {
      name: "Select order RV-2026-0002 for a bulk action",
    });
    expect(selectable).toBeEnabled();
    // A completed order has nothing left to do, so it cannot join a batch.
    expect(done).toBeDisabled();
  });
});

describe("acting on one order", () => {
  it("offers exactly the steps the server's action list allows", async () => {
    listWith([orderSummary()]);
    mocks.detail = { data: orderDetail(), isLoading: false, isError: false };
    const user = userEvent.setup();
    render(<SellerOrdersPage />);

    await user.click(screen.getByRole("button", { name: /Details/i }));

    expect(screen.getByText("Oak chair")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Mark processing/i }));

    expect(mocks.fulfill).toHaveBeenCalledWith({
      reference: "RV-2026-0001",
      status: "PROCESSING",
    });
  });
});

describe("bulk fulfilment holds the write for its undo window", () => {
  it("commits the batch only after the window elapses", async () => {
    vi.useFakeTimers();
    try {
      listWith([orderSummary(), orderSummary({ id: 2, orderNumber: "RV-2026-0002" })]);
      render(<SellerOrdersPage />);

      fireEvent.click(
        screen.getByRole("checkbox", { name: "Select order RV-2026-0001 for a bulk action" }),
      );
      fireEvent.click(
        screen.getByRole("checkbox", { name: "Select order RV-2026-0002 for a bulk action" }),
      );

      // The bar offers the shared step; nothing is sent when it is chosen.
      const apply = screen.getByRole("button", { name: /Mark processing/i });
      fireEvent.click(apply);
      expect(mocks.bulk).not.toHaveBeenCalled();
      expect(screen.getByText(/Marking 2 orders processing/i)).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(6000);
      });

      expect(mocks.bulk).toHaveBeenCalledWith({
        references: ["RV-2026-0001", "RV-2026-0002"],
        status: "PROCESSING",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends nothing when the batch is undone", async () => {
    vi.useFakeTimers();
    try {
      listWith([orderSummary()]);
      render(<SellerOrdersPage />);

      fireEvent.click(
        screen.getByRole("checkbox", { name: "Select order RV-2026-0001 for a bulk action" }),
      );
      fireEvent.click(screen.getByRole("button", { name: /Mark processing/i }));
      fireEvent.click(screen.getByRole("button", { name: /Undo/i }));

      await act(async () => {
        vi.advanceTimersByTime(6000);
      });

      expect(mocks.bulk).not.toHaveBeenCalled();
      // The selection comes back, so the seller can choose a different step.
      expect(screen.getByText(/1 order selected/i)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the client mirrors the server's vocabulary", () => {
  it("keeps the transition table equal to the server's", () => {
    for (const [status, next] of Object.entries(SELLER_NEXT_STATES)) {
      expect(allowedTransitions("CONFIRMED", status).next, status).toEqual([...next]);
    }
  });

  it("keeps the status tabs equal to the server's", () => {
    expect([...SELLER_ORDER_STATUS_FILTERS]).toEqual([...SERVER_STATUS_FILTERS]);
  });

  it("offers only the intersection of a selection's steps", () => {
    // PROCESSING → READY_FOR_PICKUP | SHIPPED, SHIPPED → DELIVERED: nothing shared.
    expect(commonNextStates(["PROCESSING", "SHIPPED"])).toEqual([]);
    // Two fresh lines share every step.
    expect(commonNextStates(["CONFIRMED", "CONFIRMED"])).toEqual(["PROCESSING"]);
    expect(commonNextStates([])).toEqual([]);
  });
});
