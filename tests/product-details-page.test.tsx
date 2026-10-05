import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@/lib/api/client";
import { ProductPage } from "@/features/product-details";
import * as query from "@/features/product-details/query";
import { useFavoriteToggle } from "@/lib/query/favorites";
import { makeProduct } from "./support/product-fixtures";

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to?: string; children?: ReactNode }) => <a href={to}>{children}</a>,
  useParams: () => ({ slug: "sony-wh-1000xm5" }),
  useLocation: () => ({ href: "/product/sony-wh-1000xm5" }),
  useNavigate: () => navigateMock,
  // The review section keeps its filters in the URL. This page test is about the
  // page, not the section, so the search is simply empty.
  useSearch: () => ({}),
}));

vi.mock("@/features/product-details/query", () => ({
  useProductDetail: vi.fn(),
  useProductAvailability: vi.fn(),
  useRelatedProducts: vi.fn(),
  useCachedProductPreview: vi.fn(),
  useProductActions: vi.fn(),
}));

// The review section is its own feature with its own tests; the page only has to
// mount it in the right place. `importOriginal` keeps the real `RatingStars`, which
// the header renders from the product row — stubbing it would hide a regression in
// the one rating the page shows above the fold.
vi.mock("@/features/reviews", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/reviews")>()),
  ReviewSection: ({ productIdOrSlug }: { productIdOrSlug: string }) => (
    <section data-testid="review-section">{productIdOrSlug}</section>
  ),
}));

// Favourites live in the shared layer now, so the page test mocks them there.
vi.mock("@/lib/query/favorites", () => ({ useFavoriteToggle: vi.fn() }));

// Messaging is a separate feature whose button the seller card renders. It answers two
// questions from the session (`useMessageSellerGate`) and owns a mutation, so it is
// mocked at the feature's query seam rather than by standing up an `AuthProvider` and a
// `QueryClient` for a button this page does not test. Answering "guest" keeps the real
// branch under test: the signed-out case renders a link, not a dialog.
vi.mock("@/features/messages/query", () => ({
  useMessageSellerGate: () => ({ isGuest: true, isOwnListing: false }),
  useStartConversation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

/** Configure the page's server state without a network or a real query client. */
function setDetail(value: Record<string, unknown>) {
  vi.mocked(query.useProductDetail).mockReturnValue(value as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  setDetail({ data: undefined, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() });
  vi.mocked(query.useProductAvailability).mockReturnValue({
    data: undefined,
    isFetching: false,
  } as never);
  vi.mocked(query.useRelatedProducts).mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
  } as never);
  vi.mocked(query.useCachedProductPreview).mockReturnValue(null as never);
  vi.mocked(useFavoriteToggle).mockReturnValue({
    isFavorited: false,
    isPending: false,
    isDisabled: false,
    isGuest: false,
    toggle: vi.fn(),
    remove: vi.fn(),
  } as never);
  vi.mocked(query.useProductActions).mockReturnValue({
    run: vi.fn(),
    pendingActionId: null,
  } as never);
});

describe("ProductPage", () => {
  it("shows a layout-shaped skeleton while the detail loads", () => {
    setDetail({ data: undefined, isLoading: true, isError: false, isFetching: true, refetch: vi.fn() });
    const { container } = render(<ProductPage />);
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it("keeps the visitor on the page and refetches when the load fails", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    setDetail({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError("SERVER_ERROR", "boom", 500),
      refetch,
    });

    render(<ProductPage />);
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("treats a missing product as not-found rather than an error", () => {
    setDetail({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError("NOT_FOUND", "Product not found.", 404),
      refetch: vi.fn(),
    });

    render(<ProductPage />);
    expect(screen.getByText("Product not found")).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });

  it("renders the product and switches between the supported modes", async () => {
    const user = userEvent.setup();
    setDetail({
      data: makeProduct(),
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });

    render(<ProductPage />);

    expect(screen.getByRole("heading", { name: "Sony WH-1000XM5" })).toBeInTheDocument();

    const modeGroup = screen.getByRole("radiogroup", { name: "How would you like this?" });
    expect(within(modeGroup).getAllByRole("radio")).toHaveLength(3);

    // A rent-and-buy listing opens on rent, with a duration to choose.
    expect(screen.getByRole("button", { name: "Add rental to cart" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Rental duration" })).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Buy" }));
    expect(screen.getByRole("button", { name: "Add to cart" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add rental to cart" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Rental duration" })).not.toBeInTheDocument();
  });

  it("offers no mode choice for a sale-only listing", () => {
    setDetail({
      data: makeProduct({ listingType: "SALE", rentalPricePerDay: null, securityDeposit: null }),
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });

    render(<ProductPage />);
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Add to cart" })).toBeInTheDocument();
    expect(screen.queryByText("Rental duration")).not.toBeInTheDocument();
  });

  it("blocks ordering when the listing is out of stock", () => {
    setDetail({
      data: makeProduct({ availableQuantity: 0 }),
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });

    render(<ProductPage />);
    expect(screen.getAllByText("Currently unavailable").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Add rental to cart" })).not.toBeInTheDocument();
  });
});
