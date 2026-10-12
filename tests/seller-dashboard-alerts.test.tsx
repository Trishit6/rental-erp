import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { SellerAlertsCard } from "@/features/seller-dashboard/components/AlertsCard";
import type { SellerAlerts } from "@/features/seller-dashboard/types";

/**
 * The dashboard alerts card (PROMPT 21).
 *
 * The card is the one place a seller learns about stock running out and rentals
 * coming back, so two things matter: it stays silent when there is nothing to
 * say, and an overdue rental is unmistakable rather than folded into "due".
 */

const mocks = vi.hoisted(() => ({
  alerts: { data: null as SellerAlerts | null, isLoading: false, isError: false },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to?: unknown; children?: ReactNode }) => (
    <a href={typeof to === "string" ? to : "#"} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/features/seller-dashboard/query", () => ({
  useSellerAlerts: () => mocks.alerts,
}));

function alerts(overrides: Partial<SellerAlerts> = {}): SellerAlerts {
  return { lowStock: [], returningSoon: [], ...overrides };
}

describe("the seller alerts card", () => {
  it("renders nothing when there is nothing to report", () => {
    mocks.alerts = { data: alerts(), isLoading: false, isError: false };
    const { container } = render(<SellerAlertsCard />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Needs your attention")).not.toBeInTheDocument();
  });

  it("names the remaining units of a low listing, and calls out empty", () => {
    mocks.alerts = {
      data: alerts({
        lowStock: [
          {
            id: 1,
            title: "Oak chair",
            slug: "oak-chair",
            imageUrl: null,
            availableQuantity: 2,
            quantity: 10,
            status: "PUBLISHED",
          },
          {
            id: 2,
            title: "Brass lamp",
            slug: "brass-lamp",
            imageUrl: null,
            availableQuantity: 0,
            quantity: 4,
            status: "OUT_OF_STOCK",
          },
        ],
      }),
      isLoading: false,
      isError: false,
    };
    render(<SellerAlertsCard />);

    expect(screen.getByText("Oak chair")).toBeInTheDocument();
    expect(screen.getByText("2 of 10 left")).toBeInTheDocument();
    expect(screen.getByText("Out of stock")).toBeInTheDocument();
  });

  it("makes an overdue rental explicit, not just 'due'", () => {
    mocks.alerts = {
      data: alerts({
        returningSoon: [
          {
            id: 9,
            productId: 3,
            title: "Camping tent",
            slug: "camping-tent",
            imageUrl: null,
            renterName: "Aarav",
            status: "OVERDUE",
            endDate: "2026-04-29T09:00:00.000Z",
            daysUntilDue: -2,
          },
        ],
      }),
      isLoading: false,
      isError: false,
    };
    render(<SellerAlertsCard />);

    expect(screen.getByText("2 days overdue")).toBeInTheDocument();
  });
});
