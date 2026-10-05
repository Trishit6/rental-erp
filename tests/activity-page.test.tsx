import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ActivityPage, parseActivityFilters, toActivityUrlSearch } from "@/features/activity";
import * as activityQuery from "@/features/activity/query";
import type { ActivityItem, ActivityPage as ActivityPageData } from "@/features/activity/types";

/**
 * `/profile/activity` — the derived timeline.
 *
 * The page's honesty is the thing under test. Because the timeline is assembled from real
 * rows rather than recorded events, the filter chips are the kinds *this person actually
 * has* — so a test that a chip row can be empty, and that only the server's
 * `availableKinds` are rendered, is a test that the page is not quietly offering nine
 * filters that mostly return nothing.
 */

const mocks = vi.hoisted(() => ({
  search: {} as Record<string, unknown>,
  navigate: vi.fn(),
  prefetch: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to?: string; children?: ReactNode }) => <a href={to}>{children}</a>,
  useSearch: () => mocks.search,
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/features/activity/query", () => ({
  useActivity: vi.fn(),
  prefetchActivity: (...args: unknown[]) => mocks.prefetch(...args),
}));

function item(overrides: Partial<ActivityItem> = {}): ActivityItem {
  return {
    id: "ORDER_PLACED:42",
    kind: "ORDER_PLACED",
    title: "Order RV-2026-8F3K2A placed",
    description: null,
    link: "/orders/RV-2026-8F3K2A",
    at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function setActivity(page: Partial<ActivityPageData> = {}, extra: Record<string, unknown> = {}) {
  vi.mocked(activityQuery.useActivity).mockReturnValue({
    data: {
      items: [],
      page: 1,
      pageSize: 20,
      totalPages: 1,
      total: 0,
      availableKinds: [],
      ...page,
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...extra,
  } as never);
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ActivityPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.search = {};
  setActivity();
});

describe("the timeline's states", () => {
  it("says nothing has happened yet on an empty unfiltered timeline", () => {
    renderPage();

    expect(screen.getByText("No activity yet")).toBeDefined();
    expect(screen.queryByText("Clear filter")).toBeNull();
  });

  it("offers a way out of an empty filtered view", async () => {
    mocks.search = { kind: "PRODUCT_SOLD" };
    renderPage();

    expect(screen.getByText("Nothing in this category yet")).toBeDefined();

    await userEvent.click(screen.getByRole("button", { name: "Clear filter" }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/profile/activity",
      search: {},
      replace: true,
    });
  });

  it("shows a skeleton while loading and not an empty timeline", () => {
    setActivity({}, { data: undefined, isLoading: true });
    renderPage();

    expect(screen.queryByText("No activity yet")).toBeNull();
  });

  it("offers a retry when the timeline fails to load", async () => {
    const refetch = vi.fn();
    setActivity({}, { data: undefined, isError: true, refetch });
    renderPage();

    expect(screen.getByText("Couldn't load your activity")).toBeDefined();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalled();
  });
});

describe("the filter chips are the person's own history", () => {
  it("renders only the kinds the server says are present", () => {
    setActivity({
      items: [item()],
      total: 1,
      availableKinds: ["ORDER_PLACED", "RENTAL_BOOKED"],
    });
    renderPage();

    expect(screen.getByRole("button", { name: "Order placed" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Rental booked" })).toBeDefined();
    // A kind this person has no history of must not appear: the whole point of deriving.
    expect(screen.queryByRole("button", { name: "Item sold" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Review written" })).toBeNull();
  });

  it("hides the chip row entirely when there is nothing to filter by", () => {
    // One kind is not a filter, it is a restatement — so the row is suppressed rather than
    // rendering a single chip that does nothing.
    setActivity({ items: [item()], total: 1, availableKinds: ["ORDER_PLACED"] });
    renderPage();

    expect(screen.queryByRole("button", { name: "Everything" })).toBeNull();
  });

  it("filters by the clicked kind", async () => {
    setActivity({
      items: [item()],
      total: 1,
      availableKinds: ["ORDER_PLACED", "RENTAL_BOOKED"],
    });
    renderPage();

    await userEvent.click(screen.getByRole("button", { name: "Rental booked" }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/profile/activity",
      search: { kind: "RENTAL_BOOKED" },
      replace: true,
    });
  });

  it("clears an active kind when its own chip is clicked again", async () => {
    mocks.search = { kind: "RENTAL_BOOKED" };
    setActivity({
      items: [item({ kind: "RENTAL_BOOKED" })],
      total: 1,
      availableKinds: ["ORDER_PLACED", "RENTAL_BOOKED"],
    });
    renderPage();

    await userEvent.click(screen.getByRole("button", { name: "Rental booked" }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/profile/activity",
      search: {},
      replace: true,
    });
  });
});

describe("one timeline entry", () => {
  it("links an entry that has a destination", () => {
    setActivity({ items: [item()], total: 1 });
    renderPage();

    expect(screen.getByRole("link", { name: /Order RV-2026-8F3K2A placed/ })).toBeDefined();
  });

  it("renders an entry whose entity is gone as plain text", () => {
    setActivity({ items: [item({ link: null, title: "Item sold — a delisted camera" })], total: 1 });
    renderPage();

    expect(screen.getByText("Item sold — a delisted camera")).toBeDefined();
    expect(screen.queryByRole("link", { name: /delisted camera/ })).toBeNull();
  });
});

describe("parseActivityFilters", () => {
  it("defaults a missing or nonsensical page to 1", () => {
    // The URL is hand-editable, so `?page=abc` must degrade rather than reach the server.
    for (const page of [undefined, "abc", "0", "-2", "1.5"]) {
      expect(parseActivityFilters({ page }).page).toBe(1);
    }
    expect(parseActivityFilters({ page: "3" }).page).toBe(3);
  });

  it("drops a kind outside the vocabulary", () => {
    expect(parseActivityFilters({ kind: "ORDER_PLACED" }).kind).toBe("ORDER_PLACED");
    expect(parseActivityFilters({ kind: "NOT_A_KIND" }).kind).toBeNull();
    expect(parseActivityFilters({ kind: "<script>" }).kind).toBeNull();
    expect(parseActivityFilters({}).kind).toBeNull();
  });

  it("writes only the non-default params to the URL", () => {
    expect(toActivityUrlSearch({ page: 1, kind: null })).toEqual({});
    expect(toActivityUrlSearch({ page: 2, kind: null })).toEqual({ page: 2 });
    expect(toActivityUrlSearch({ page: 1, kind: "PRODUCT_SOLD" })).toEqual({
      kind: "PRODUCT_SOLD",
    });
  });
});
