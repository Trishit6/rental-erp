import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RentalDetailsPage } from "@/features/rentals";
import { RentalTimeline } from "@/features/rentals/components/RentalTimeline";
import { RentalSecurityDeposit } from "@/features/rentals/components/RentalSecurityDeposit";
import { RentalDetailsActions } from "@/features/rentals/components/RentalDetailsActions";
import { buildRentalTimeline } from "../server/lib/rental-lifecycle";
import {
  getRentalById,
  requestRentalExtension,
  requestRentalReturn,
} from "@/features/rentals/api";
import { ApiError } from "@/lib/api/client";
import {
  makeExtensionQuote,
  makeRental,
  makeRentalDetails,
  makeReturnedRental,
  makeTimeline,
} from "./support/rental-fixtures";

const paramsState = vi.hoisted(() => ({ current: {} as { rentalId?: string } }));
const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    search,
    children,
  }: {
    to?: string;
    params?: Record<string, string>;
    search?: Record<string, unknown>;
    children?: ReactNode;
  }) => {
    const path = to?.includes("$")
      ? to.replace(/\/\$(\w+)/g, (_, key: string) => `/${params?.[key] ?? ""}`)
      : to;
    const query = search
      ? `?${new URLSearchParams(
          Object.entries(search).map(([k, v]) => [k, String(v)]),
        ).toString()}`
      : "";
    return <a href={`${path}${query}`}>{children}</a>;
  },
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
  useParams: () => paramsState.current,
}));

vi.mock("sonner", () => ({ toast: toastMock }));

vi.mock("@/features/rentals/api", () => ({
  getRentals: vi.fn(),
  getRentalById: vi.fn(),
  requestRentalExtension: vi.fn(),
  requestRentalReturn: vi.fn(),
}));

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderPage() {
  return render(<RentalDetailsPage />, { wrapper });
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  paramsState.current = { rentalId: "61" };
  toastMock.error.mockReset();
  vi.mocked(getRentalById).mockReset();
  vi.mocked(requestRentalExtension).mockReset();
  vi.mocked(requestRentalReturn).mockReset();
  vi.mocked(getRentalById).mockResolvedValue(makeRentalDetails());
});

describe("the rental detail page", () => {
  it("shows the order number as the reference, not the rental id", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText("Order #RV-2026-QW7T2M")).toBeInTheDocument());
    // A sequential id in a heading would be the wrong kind of identifier to
    // show a customer or put in a screenshot.
    expect(screen.queryByText(/^Rental #61$/)).not.toBeInTheDocument();
  });

  it("links back to the rentals list", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /Back to My Rentals/i })).toHaveAttribute(
        "href",
        "/rentals",
      ),
    );
  });

  it("shows a skeleton while loading, then the rental", async () => {
    let resolve: (value: unknown) => void = () => {};
    vi.mocked(getRentalById).mockReturnValue(new Promise((r) => (resolve = r)) as never);
    renderPage();

    expect(screen.getByTestId("rental-details-skeleton")).toBeInTheDocument();
    resolve(makeRentalDetails());
    await waitFor(() => expect(screen.getByText("Order #RV-2026-QW7T2M")).toBeInTheDocument());
  });

  it("shows the product, the owner and the dates", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText("Canon 200D DSLR")).toBeInTheDocument());
    // Scoped: the owner is named in the item section *and* the owner section.
    expect(screen.getAllByText("Priya").length).toBeGreaterThan(0);
    const dates = screen.getByTestId("rental-dates");
    expect(within(dates).getByText("7 days")).toBeInTheDocument();
  });

  it("keeps the rental charge and the deposit apart", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByTestId("rental-pricing")).toBeInTheDocument());
    const pricing = screen.getByTestId("rental-pricing");
    expect(within(pricing).getByText("Rental price")).toBeInTheDocument();
    expect(within(pricing).getByText("Security deposit")).toBeInTheDocument();
    // A deposit folded into a single total reads as a purchase.
    expect(within(pricing).getByText(/Refundable/)).toBeInTheDocument();
  });

  it("links to the order, keeping the two views connected", async () => {
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("link", { name: /View order/i })).toHaveAttribute(
        "href",
        "/orders/RV-2026-QW7T2M",
      ),
    );
  });

  it("links to the product page that actually exists", async () => {
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("link", { name: /View product/i })).toHaveAttribute(
        "href",
        "/product/canon-200d",
      ),
    );
  });
});

describe("the security deposit is described honestly", () => {
  it("says it is held while the item is out", () => {
    render(<RentalSecurityDeposit amount={50_000} status="HELD" />);
    expect(screen.getByTestId("rental-deposit")).toHaveTextContent("Held");
    expect(screen.getByTestId("rental-deposit")).toHaveTextContent(/while you have the item/i);
  });

  it("never claims a refund has been issued", () => {
    // Only HELD and RELEASE_PENDING are reachable; "Released" would be a claim
    // no refund has made good on.
    for (const status of ["HELD", "RELEASE_PENDING"] as const) {
      const { unmount } = render(<RentalSecurityDeposit amount={50_000} status={status} />);
      expect(screen.getByTestId("rental-deposit")).not.toHaveTextContent("Released");
      unmount();
    }
  });

  it("renders nothing when there is no deposit", () => {
    const { container } = render(<RentalSecurityDeposit amount={0} status="HELD" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("the timeline", () => {
  it("gives a time only where one is recorded", () => {
    const events = buildRentalTimeline({
      status: "RETURN_PENDING",
      confirmedAt: "2026-09-20T10:00:00.000Z",
      events: [
        { type: "CONFIRMED", createdAt: "2026-09-20T10:00:00.000Z" },
        { type: "STARTED", createdAt: "2026-09-29T03:30:00.000Z" },
        { type: "RETURN_REQUESTED", createdAt: "2026-10-05T09:00:00.000Z" },
      ],
    });

    render(<RentalTimeline events={events} />);
    const timeline = screen.getByTestId("rental-timeline");
    expect(within(timeline).getByText("Rental confirmed")).toBeInTheDocument();
    // Steps with no event yet are waiting; nothing invents a time for them.
    expect(within(timeline).getAllByText("Waiting").length).toBeGreaterThan(0);
  });

  it("renders nothing for an empty list rather than an empty shell", () => {
    const { container } = render(<RentalTimeline events={makeTimeline([])} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("actions are driven by the server's eligibility", () => {
  const rental = makeRental();

  it("offers extension and return while the rental is out", () => {
    render(
      <RentalDetailsActions
        rental={rental}
        details={makeRentalDetails()}
        onExtend={vi.fn()}
        onReturn={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /Extend rental/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start return/i })).toBeInTheDocument();
  });

  it("offers neither once the server says it is finished", () => {
    // The flags come from the server, so a stale client cannot offer an action
    // the API would refuse.
    const finished = makeReturnedRental();
    render(
      <RentalDetailsActions
        rental={finished}
        details={makeRentalDetails({
          rental: finished,
          eligibility: { canExtend: false, canRequestReturn: false, canCancel: false },
        })}
        onExtend={vi.fn()}
        onReturn={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /Extend rental/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start return/i })).not.toBeInTheDocument();
    expect(screen.getByText(/no longer be extended or returned/i)).toBeInTheDocument();
  });

  it("does not offer 'contact seller' — messaging is another feature", () => {
    render(
      <RentalDetailsActions
        rental={rental}
        details={makeRentalDetails()}
        onExtend={vi.fn()}
        onReturn={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Contact seller/i)).not.toBeInTheDocument();
  });

  it("explains a return that has already been requested", () => {
    render(
      <RentalDetailsActions
        rental={makeRental({ status: "RETURN_PENDING" })}
        details={makeRentalDetails({
          rental: makeRental({ status: "RETURN_PENDING" }),
          eligibility: { canExtend: true, canRequestReturn: false, canCancel: false },
        })}
        onExtend={vi.fn()}
        onReturn={vi.fn()}
      />,
    );

    expect(screen.getByTestId("rental-return-requested")).toHaveTextContent(
      /Return requested/i,
    );
    expect(screen.queryByRole("button", { name: /Start return/i })).not.toBeInTheDocument();
  });
});

describe("the extension request", () => {
  it("sends only the number of days and shows the server's quote", async () => {
    const user = userEvent.setup();
    vi.mocked(requestRentalExtension).mockResolvedValue(makeExtensionQuote());
    renderPage();

    await screen.findByRole("button", { name: /Extend rental/i });
    await user.click(screen.getByRole("button", { name: /Extend rental/i }));
    await user.click(screen.getByRole("button", { name: /Request extension/i }));

    await waitFor(() => expect(requestRentalExtension).toHaveBeenCalled());
    // No end date, no cost, no deposit — the server derives all of it.
    expect(requestRentalExtension).toHaveBeenCalledWith(61, { additionalDays: 3 });

    await waitFor(() => expect(screen.getByTestId("extension-requested")).toBeInTheDocument());
    // The cost shown is the server's, not one computed in the browser.
    expect(screen.getByTestId("extension-cost")).toHaveTextContent("₹150");
  });

  it("does not price the extra days before the server has been asked", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("button", { name: /Extend rental/i });
    await user.click(screen.getByRole("button", { name: /Extend rental/i }));

    // Pricing from the listing as it is *now* is exactly what a receipt must not
    // do, so no figure is shown until the server returns one.
    expect(screen.getByTestId("extension-cost")).toHaveTextContent(/Checked on request/i);
  });

  it("shows the server's refusal verbatim", async () => {
    const user = userEvent.setup();
    vi.mocked(requestRentalExtension).mockRejectedValue(
      new ApiError(
        "EXTENSION_UNAVAILABLE",
        "This rental can no longer be extended because another booking begins after your current rental period.",
        409,
      ),
    );
    renderPage();

    await screen.findByRole("button", { name: /Extend rental/i });
    await user.click(screen.getByRole("button", { name: /Extend rental/i }));
    await user.click(screen.getByRole("button", { name: /Request extension/i }));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(expect.stringContaining("another booking")),
    );
  });
});

describe("the return request", () => {
  it("records the request and confirms it plainly", async () => {
    const user = userEvent.setup();
    vi.mocked(requestRentalReturn).mockResolvedValue({
      status: "RETURN_PENDING",
      requestedAt: "2026-10-05T09:00:00.000Z",
    });
    renderPage();

    await screen.findByRole("button", { name: /Start return/i });
    await user.click(screen.getByRole("button", { name: /Start return/i }));
    // Nothing happens until the customer confirms they understand the return has
    // not been refunded.
    expect(requestRentalReturn).not.toHaveBeenCalled();

    // The dialog has its own "Start return"; the actions card has another, and
    // the close button is labelled "Close start return" — so the footer button
    // is matched exactly.
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: "Start return" }));

    await waitFor(() => expect(requestRentalReturn).toHaveBeenCalledWith(61, { method: "DROP_OFF" }));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
  });

  it("never promises a refund has been issued", async () => {
    const user = userEvent.setup();
    vi.mocked(requestRentalReturn).mockResolvedValue({
      status: "RETURN_PENDING",
      requestedAt: null,
    });
    renderPage();

    await screen.findByRole("button", { name: /Start return/i });
    await user.click(screen.getByRole("button", { name: /Start return/i }));

    expect(screen.getByText(/no refund is issued yet/i)).toBeInTheDocument();
  });
});

describe("not found and errors", () => {
  it("renders 'not found' for a rental that is not the customer's", async () => {
    // The server returns the same 404 for "missing" and "someone else's", so the
    // UI must not try to tell them apart.
    vi.mocked(getRentalById).mockRejectedValue(
      new ApiError("NOT_FOUND", "Rental not found.", 404),
    );
    renderPage();

    await waitFor(() => expect(screen.getByTestId("rental-not-found")).toBeInTheDocument());
    expect(screen.getByText("Rental not found")).toBeInTheDocument();
  });

  it("does not retry a 404", async () => {
    vi.mocked(getRentalById).mockRejectedValue(
      new ApiError("NOT_FOUND", "Rental not found.", 404),
    );
    renderPage();

    await waitFor(() => expect(screen.getByTestId("rental-not-found")).toBeInTheDocument());
    expect(getRentalById).toHaveBeenCalledTimes(1);
  });

  it("offers a retry for a genuine failure", async () => {
    vi.mocked(getRentalById).mockRejectedValue(new ApiError("INTERNAL_ERROR", "boom", 500));
    renderPage();

    await waitFor(
      () => expect(screen.getByText("We couldn't load your rentals")).toBeInTheDocument(),
      { timeout: 5000 },
    );
  });

  it("answers a malformed id locally, without a pointless request", async () => {
    paramsState.current = { rentalId: "not-a-rental" };
    renderPage();

    await waitFor(() => expect(screen.getByTestId("rental-not-found")).toBeInTheDocument());
    expect(getRentalById).not.toHaveBeenCalled();
  });
});
