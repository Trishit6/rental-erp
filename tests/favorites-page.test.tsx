import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FavoritesPage } from "@/features/favorites";
import * as favoritesQuery from "@/features/favorites/query";
import { useFavoriteIds, useFavoriteToggle } from "@/lib/query/favorites";
import { makeFavoritePage, makeFavoriteProduct } from "./support/favorite-fixtures";
import type { FavoriteFilters } from "@/features/favorites/types";

const mocks = vi.hoisted(() => ({
  search: {} as Record<string, unknown>,
  navigate: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to?: string; children?: ReactNode }) => <a href={to}>{children}</a>,
  useSearch: () => mocks.search,
  useNavigate: () => mocks.navigate,
  useLocation: () => ({ href: "/favorites" }),
  useParams: () => ({}),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

vi.mock("@/features/favorites/query", () => ({
  useFavorites: vi.fn(),
  usePrefetchFavoritesPage: vi.fn(() => vi.fn()),
  usePrefetchProduct: vi.fn(() => vi.fn()),
}));

vi.mock("@/lib/query/favorites", () => ({
  useFavoriteIds: vi.fn(),
  useFavoriteToggle: vi.fn(),
  useFavoriteMutation: vi.fn(() => ({ mutate: vi.fn() })),
  useClearFavorites: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ user: { id: 1 }, loading: false, refresh: vi.fn() }),
}));

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderPage() {
  return render(<FavoritesPage />, { wrapper });
}

/** Configure the page's server state without a network or a real query client. */
function setList(value: Record<string, unknown>) {
  vi.mocked(favoritesQuery.useFavorites).mockReturnValue(value as never);
}

function settled(items: unknown[], pagination: Record<string, number> = {}) {
  return {
    data: { items, pagination: { page: 1, pageSize: 12, total: items.length, totalPages: 1, ...pagination } },
    isPending: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  };
}

const LAST_FILTERS = () => vi.mocked(favoritesQuery.useFavorites).mock.calls.at(-1)![0] as FavoriteFilters;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.search = {};
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(useFavoriteIds).mockReturnValue({ ids: new Set([1, 2]), isLoading: false, isGuest: false });
  vi.mocked(useFavoriteToggle).mockReturnValue({
    isFavorited: true,
    isPending: false,
    isDisabled: false,
    isGuest: false,
    toggle: vi.fn(),
    remove: vi.fn(),
  });
  setList(settled([makeFavoriteProduct(), makeFavoriteProduct({ id: 2, slug: "canon-r6", title: "Canon EOS R6" })]));
});

describe("FavoritesPage", () => {
  it("heads the page with the count the API reported", () => {
    renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Your favorites" })).toBeInTheDocument();
    expect(screen.getByTestId("favorites-subtitle")).toHaveTextContent("2 saved items");
  });

  it("never hardcodes the count", () => {
    vi.mocked(useFavoriteIds).mockReturnValue({
      ids: new Set([1, 2, 3, 4, 5]),
      isLoading: false,
      isGuest: false,
    });

    renderPage();

    expect(screen.getByTestId("favorites-subtitle")).toHaveTextContent("5 saved items");
  });

  it("distinguishes an empty wishlist from a list of zero results", () => {
    // A genuinely empty wishlist: the API reports no items and no saved ids.
    vi.mocked(useFavoriteIds).mockReturnValue({
      ids: new Set<number>(),
      isLoading: false,
      isGuest: false,
    });
    setList(settled([]));

    renderPage();

    expect(screen.getByText("Your favorites are empty")).toBeInTheDocument();
    expect(screen.getByTestId("favorites-subtitle")).toHaveTextContent("Nothing saved yet");
    expect(screen.getByRole("link", { name: "Explore products" })).toHaveAttribute(
      "href",
      "/browse",
    );
  });

  it("offers to widen the search when a filter matched nothing", () => {
    mocks.search = { listingType: "rent" };
    setList(settled([]));

    renderPage();

    expect(screen.getByText("No saved items match")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
  });

  it("renders a card per saved product, with the details that matter", () => {
    renderPage();

    expect(screen.getByText("Sony WH-1000XM5")).toBeInTheDocument();
    expect(screen.getByText("Canon EOS R6")).toBeInTheDocument();
    // Listing type, both prices and real availability.
    expect(screen.getAllByText("Rent + buy")).toHaveLength(2);
    expect(screen.getAllByText("₹499")).toHaveLength(2);
    expect(screen.getAllByText(/Buy ₹29,900/)).toHaveLength(2);
    expect(screen.getByTestId("availability-1")).toHaveTextContent("Available");
  });

  it("keeps an unavailable item saved, but says so", () => {
    setList(settled([makeFavoriteProduct({ availableQuantity: 0 })]));

    renderPage();

    expect(screen.getByText("Sony WH-1000XM5")).toBeInTheDocument();
    expect(screen.getByTestId("availability-1")).toHaveTextContent("Out of stock");
  });

  it("shows a skeleton rather than an empty page while it first loads", () => {
    setList({ data: undefined, isPending: true, isFetching: true, isError: false, refetch: vi.fn() });

    renderPage();

    expect(screen.getByRole("status", { name: "Loading your favorites" })).toBeInTheDocument();
    expect(screen.queryByText("Your favorites are empty")).not.toBeInTheDocument();
  });

  it("keeps the current results on screen during a background refetch", () => {
    setList({
      data: makeFavoritePage([makeFavoriteProduct()]),
      isPending: false,
      isFetching: true,
      isError: false,
      refetch: vi.fn(),
    });

    const { container } = renderPage();

    expect(screen.getByText("Sony WH-1000XM5")).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it("retries only the wishlist query when it fails", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    setList({ data: undefined, isPending: false, isFetching: false, isError: true, refetch });

    renderPage();

    expect(screen.getByText("We couldn't load your favorites")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Try again/ }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("FavoritesPage URL state", () => {
  it("reads its filters, sort and page from the URL", () => {
    mocks.search = { search: "tent", listingType: "rent", condition: "GOOD", sort: "price_asc", page: 2 };
    setList(settled([], { total: 40, totalPages: 4, page: 2 }));

    renderPage();

    expect(LAST_FILTERS()).toEqual({
      search: "tent",
      listingType: "rent",
      condition: "GOOD",
      availability: undefined,
      sort: "price_asc",
      page: 2,
      pageSize: 12,
    });
  });

  it("defaults to the newest-first ordering and the first page", () => {
    renderPage();

    expect(LAST_FILTERS()).toMatchObject({ sort: "recent", page: 1, pageSize: 12 });
  });

  it("writes a chosen sort back to the URL and resets to page 1", async () => {
    const user = userEvent.setup();
    mocks.search = { page: 3 };
    renderPage();

    await user.selectOptions(screen.getByLabelText("Sort"), "price_desc");

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/favorites",
      search: expect.objectContaining({ sort: "price_desc", page: undefined }),
    });
  });

  it("writes a chosen listing type back to the URL", async () => {
    const user = userEvent.setup();
    renderPage();

    // Scoped to the toolbar's quick switch — the filter panel has its own chips.
    const toolbar = within(screen.getByRole("group", { name: "Filter by listing type" }));
    await user.click(toolbar.getByRole("button", { name: "Rent" }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/favorites",
      search: expect.objectContaining({ listingType: "rent", page: undefined }),
    });
  });

  it("clears filters without forgetting the search term", async () => {
    const user = userEvent.setup();
    mocks.search = { listingType: "rent", condition: "GOOD", search: "tent" };
    renderPage();

    await user.click(screen.getByRole("button", { name: "Clear all" }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/favorites",
      search: expect.objectContaining({
        listingType: undefined,
        condition: undefined,
        sort: undefined,
        search: "tent",
      }),
    });
  });

  it("commits a typed search to the URL", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Search saved products"), "tent");

    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          search: expect.objectContaining({ search: "tent" }),
        }),
      ),
    );
  });

  it("reports the narrower result count against the whole wishlist", () => {
    // Five saved in total, two of which match the active filter.
    vi.mocked(useFavoriteIds).mockReturnValue({
      ids: new Set([1, 2, 3, 4, 5]),
      isLoading: false,
      isGuest: false,
    });
    mocks.search = { listingType: "rent" };
    setList(settled([makeFavoriteProduct()], { total: 2, totalPages: 1 }));

    renderPage();

    expect(screen.getByText("Showing 2 of 5")).toBeInTheDocument();
  });
});

describe("FavoritesPage pagination", () => {
  it("hides the pager when everything fits on one page", () => {
    renderPage();

    expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument();
  });

  it("pages through a large wishlist", async () => {
    const user = userEvent.setup();
    mocks.search = { page: 1 };
    setList(settled([makeFavoriteProduct()], { total: 40, totalPages: 4, page: 1 }));

    renderPage();

    const pager = screen.getByRole("navigation", { name: "Pagination" });
    expect(pager).toBeInTheDocument();

    await user.click(within(pager).getByRole("button", { name: "Page 2" }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/favorites",
      search: expect.objectContaining({ page: 2 }),
    });
  });

  it("only asks the API for the page being viewed", () => {
    mocks.search = { page: 3 };
    setList(settled([], { total: 40, totalPages: 4, page: 3 }));

    renderPage();

    expect(LAST_FILTERS()).toMatchObject({ page: 3 });
  });
});
