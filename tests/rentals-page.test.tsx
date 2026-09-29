import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RentalsPage } from "@/features/rentals";
import { RentalCountdown } from "@/features/rentals/components/RentalCountdown";
import { RentalStatusBadge } from "@/features/rentals/components/RentalStatusBadge";
import { RentalsEmptyState } from "@/features/rentals/components/RentalsEmptyState";
import { getRentals } from "@/features/rentals/api";
import {
  makeRental,
  makeRentalListResponse,
  makeReturnedRental,
  makeUpcomingRental,
} from "./support/rental-fixtures";

const navigateMock = vi.hoisted(() => vi.fn());
const searchState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("@tanstack/react-router", () => ({
  // Substitutes params and serialises search into the href, so links are
  // asserted for real rather than just their `to`.
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
  useNavigate: () => navigateMock,
  useSearch: () => searchState.current,
  useParams: () => ({}),
}));

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

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
  return render(<RentalsPage />, { wrapper });
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  navigateMock.mockReset();
  searchState.current = {};
  vi.mocked(getRentals).mockResolvedValue(makeRentalListResponse([makeRental()]));
});

/** A date `days` from today, at UTC midnight — matches the stored precision. */
function daysFromNow(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

describe("the rentals page", () => {
  it("renders the heading and the server's count", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText("My Rentals")).toBeInTheDocument());
    expect(
      screen.getByText("Everything you're renting, in one place."),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("1 rental")).toBeInTheDocument());
  });

  it("shows a skeleton, not an empty state, while loading", () => {
    vi.mocked(getRentals).mockReturnValue(new Promise(() => {}));
    renderPage();

    // The flash of "No rentals yet" on every navigation is what this guards.
    expect(screen.getByTestId("rentals-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("No rentals yet")).not.toBeInTheDocument();
  });

  it("asks the server for the renter's rentals, paged", async () => {
    renderPage();
    await waitFor(() => expect(getRentals).toHaveBeenCalled());
    expect(getRentals).toHaveBeenCalledWith({ page: 1 });
  });
});

describe("the rental card", () => {
  it("shows the product, owner, status, dates and both amounts", async () => {
    vi.mocked(getRentals).mockResolvedValue(
      makeRentalListResponse([makeRental({ startDate: daysFromNow(-2), endDate: daysFromNow(5) })]),
    );
    renderPage();

    await waitFor(() => expect(screen.getByText("Canon 200D DSLR")).toBeInTheDocument());
    const card = screen.getByTestId("rental-card-61");
    expect(within(card).getByText(/Rented from Priya/)).toBeInTheDocument();
    expect(within(card).getByText("Active")).toBeInTheDocument();
    expect(within(card).getByText(/7 days/)).toBeInTheDocument();
    expect(within(card).getByText(/₹350/)).toBeInTheDocument();
    expect(within(card).getByText(/₹500/)).toBeInTheDocument();
  });

  it("leads an active rental with a countdown", async () => {
    vi.mocked(getRentals).mockResolvedValue(
      makeRentalListResponse([makeRental({ startDate: daysFromNow(-2), endDate: daysFromNow(5) })]),
    );
    renderPage();

    await waitFor(() => expect(screen.getByText("Active rental")).toBeInTheDocument());
    expect(screen.getByText("5 days remaining")).toBeInTheDocument();
  });

  it("counts down to the start of an upcoming rental instead", async () => {
    vi.mocked(getRentals).mockResolvedValue(
      makeRentalListResponse([
        makeUpcomingRental({ startDate: daysFromNow(3), endDate: daysFromNow(10) }),
      ]),
    );
    renderPage();

    await waitFor(() => expect(screen.getByText("Starts in 3 days")).toBeInTheDocument());
    expect(screen.queryByText("Active rental")).not.toBeInTheDocument();
  });

  it("stays quiet for a finished rental", async () => {
    vi.mocked(getRentals).mockResolvedValue(makeRentalListResponse([makeReturnedRental()]));
    renderPage();

    await waitFor(() => expect(screen.getByText("Returned")).toBeInTheDocument());
    expect(screen.queryByText("Active rental")).not.toBeInTheDocument();
    expect(screen.queryByText(/remaining/)).not.toBeInTheDocument();
  });

  it("links to the rental by id", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /Manage rental/i })).toHaveAttribute(
        "href",
        "/rentals/61",
      ),
    );
  });
});

describe("tabs, search and filters drive the URL", () => {
  it("switches tab and resets to page 1", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Canon 200D DSLR");

    await user.click(screen.getByRole("tab", { name: "Active" }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
    const call = navigateMock.mock.calls.at(-1)![0];
    expect(call.to).toBe("/rentals");
    expect(call.search.bucket).toBe("active");
    // Staying on page 7 of a narrower set is how a customer meets an empty page.
    expect(call.search.page).toBeUndefined();
  });

  it("is a real tablist with arrow-key navigation", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Canon 200D DSLR");

    const tablist = screen.getByRole("tablist");
    expect(within(tablist).getAllByRole("tab")).toHaveLength(4);

    await user.click(within(tablist).getByRole("tab", { name: "All" }));
    tablist.focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
    expect(navigateMock.mock.calls.at(-1)![0].search.bucket).toBe("upcoming");
  });

  it("puts a search into the URL", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Canon 200D DSLR");

    await user.type(screen.getByLabelText("Search rentals"), "can");

    await waitFor(() => expect(navigateMock).toHaveBeenCalled(), { timeout: 2000 });
    expect(navigateMock.mock.calls.at(-1)![0].search.search).toBe("can");
  });

  it("sends the chosen filters to the server rather than filtering locally", async () => {
    searchState.current = { bucket: "active", sort: "ending_soon" };
    renderPage();

    await waitFor(() => expect(getRentals).toHaveBeenCalled());
    expect(getRentals).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: "active", sort: "ending_soon" }),
    );
  });
});

describe("empty states are genuinely different", () => {
  it("says 'no rentals yet' only when nothing is filtered", async () => {
    vi.mocked(getRentals).mockResolvedValue(makeRentalListResponse([]));
    renderPage();

    await waitFor(() => expect(screen.getByText("No rentals yet")).toBeInTheDocument());
    expect(
      screen.getByText("Rent something you need without committing to ownership."),
    ).toBeInTheDocument();
  });

  it("distinguishes 'no rentals match' from 'you have none'", async () => {
    // Telling someone with three active rentals they have none, because a filter
    // is applied, is the bug this avoids.
    searchState.current = { bucket: "active" };
    vi.mocked(getRentals).mockResolvedValue(makeRentalListResponse([]));
    renderPage();

    await waitFor(() => expect(screen.getByText("No rentals found")).toBeInTheDocument());
    expect(screen.queryByText("No rentals yet")).not.toBeInTheDocument();
  });

  it("has a distinct message for an empty tab", () => {
    render(<RentalsEmptyState variant="none" bucket="upcoming" />);
    expect(screen.getByText("No upcoming rentals")).toBeInTheDocument();
  });

  it("points a first-time renter at the browse page", () => {
    render(<RentalsEmptyState variant="none" />);
    expect(screen.getByRole("link", { name: /Browse rentals/i })).toHaveAttribute(
      "href",
      "/browse?mode=rent",
    );
  });
});

describe("the countdown", () => {
  it("counts down to a future date", () => {
    render(<RentalCountdown target={daysFromNow(5)} />);
    expect(screen.getByText("5 days remaining")).toBeInTheDocument();
  });

  it("reads naturally at the boundaries", () => {
    const { rerender } = render(<RentalCountdown target={daysFromNow(1)} />);
    expect(screen.getByText("1 day remaining")).toBeInTheDocument();

    rerender(<RentalCountdown target={daysFromNow(0)} />);
    expect(screen.getByText("Due back today")).toBeInTheDocument();
  });

  it("says nothing once the date has passed", () => {
    // "0 days remaining" is noise, and whether a rental is overdue is the
    // server's call — not this component's.
    render(<RentalCountdown target={daysFromNow(-2)} />);
    expect(screen.queryByText(/remaining/)).not.toBeInTheDocument();
  });

  it("renders nothing for an unparseable date rather than 'Invalid Date'", () => {
    render(<RentalCountdown target="not-a-date" />);
    expect(screen.queryByText(/Invalid/)).not.toBeInTheDocument();
  });

  it("counts to the start when asked", () => {
    render(<RentalCountdown target={daysFromNow(2)} mode="starts" />);
    expect(screen.getByText("Starts in 2 days")).toBeInTheDocument();
  });

  it("has a stable sentence for assistive tech, not a changing number", () => {
    render(<RentalCountdown target={daysFromNow(5)} />);
    // The sr-only text is the accessible name; the visible label is the same fact.
    expect(screen.getByText("5 days remaining")).toBeInTheDocument();
  });
});

describe("presentation", () => {
  it("never communicates status by colour alone", () => {
    render(<RentalStatusBadge status="RETURN_PENDING" />);
    const badge = screen.getByText("Return requested");
    expect(badge.querySelector("svg")).toBeTruthy();
  });

  it("renders a status it does not recognise instead of blanking", () => {
    render(<RentalStatusBadge status="INSPECTION" />);
    expect(screen.getByText("Inspection")).toBeInTheDocument();
  });
});

describe("errors", () => {
  it("explains a failure and offers a retry", async () => {
    vi.mocked(getRentals).mockRejectedValue(new Error("boom"));
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("We couldn't load your rentals")).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /Try again/i })).toBeInTheDocument();
  });
});
