import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CategoryFilters } from "@/features/categories/components/CategoryFilters";
import { CategoryProducts } from "@/features/categories/components/CategoryProducts";
import { CategoryProductsSkeleton } from "@/features/categories/components/CategoryProductsSkeleton";
import { MobileCategorySheet } from "@/features/categories/components/MobileCategorySheet";
import { makeCategoryProduct, makeSubcategory } from "./support/category-fixtures";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to?: string; children?: ReactNode }) => <a href={to}>{children}</a>,
  useNavigate: () => vi.fn(),
  // The shared ProductCard's heart resolves the sign-in redirect from here.
  useLocation: () => ({ href: "/categories/electronics" }),
}));

// The shared ProductCard reads the session (for its save button) and the cache.
vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ user: null, loading: false, refresh: vi.fn() }),
}));

function renderWithQuery(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const productsProps = {
  page: 1,
  totalPages: 1,
  onPageChange: vi.fn(),
  emptyState: <p>No products found</p>,
  errorState: <button type="button">Try again</button>,
};

describe("CategoryProducts", () => {
  it("renders a card per listing returned by the API", () => {
    renderWithQuery(
      <CategoryProducts
        {...productsProps}
        products={[
          makeCategoryProduct(),
          makeCategoryProduct({ id: 102, slug: "canon-r6", title: "Canon EOS R6" }),
        ]}
      />,
    );

    expect(screen.getByText("Sony WH-1000XM5")).toBeInTheDocument();
    expect(screen.getByText("Canon EOS R6")).toBeInTheDocument();
  });

  it("shows skeletons instead of cards while the first page loads", () => {
    renderWithQuery(<CategoryProducts {...productsProps} products={[]} isLoading />);
    expect(screen.queryByText("No products found")).not.toBeInTheDocument();
  });

  it("renders the empty state when the category has no matching products", () => {
    renderWithQuery(<CategoryProducts {...productsProps} products={[]} />);
    expect(screen.getByText("No products found")).toBeInTheDocument();
  });

  it("renders the error state without unmounting the page", () => {
    renderWithQuery(<CategoryProducts {...productsProps} products={[]} isError />);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("marks a background refetch as busy instead of flashing skeletons", () => {
    const { container } = renderWithQuery(
      <CategoryProducts
        {...productsProps}
        products={[makeCategoryProduct()]}
        isRefreshing
      />,
    );

    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.getByText("Sony WH-1000XM5")).toBeInTheDocument();
  });

  it("paginates server-side results and pages on request", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    renderWithQuery(
      <CategoryProducts
        {...productsProps}
        products={[makeCategoryProduct()]}
        page={2}
        totalPages={3}
        onPageChange={onPageChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Page 3" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("hides pagination when everything fits on one page", () => {
    renderWithQuery(
      <CategoryProducts {...productsProps} products={[makeCategoryProduct()]} totalPages={1} />,
    );
    expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument();
  });

  it("prefetches the product under the pointer", async () => {
    const user = userEvent.setup();
    const onPrefetchProduct = vi.fn();
    renderWithQuery(
      <CategoryProducts
        {...productsProps}
        products={[makeCategoryProduct({ slug: "sony-wh-1000xm5" })]}
        onPrefetchProduct={onPrefetchProduct}
      />,
    );

    await user.hover(screen.getByText("Sony WH-1000XM5"));
    expect(onPrefetchProduct).toHaveBeenCalledWith("sony-wh-1000xm5");
  });
});

describe("CategoryFilters", () => {
  it("offers a subcategory group alongside the shared filter groups", () => {
    render(
      <CategoryFilters
        search={{}}
        activeCount={0}
        onClearAll={vi.fn()}
        onChange={vi.fn()}
        subcategories={[makeSubcategory()]}
      />,
    );

    expect(screen.getByText("Subcategory")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cameras/ })).toBeInTheDocument();
    // The shared groups are the same ones Browse shows.
    expect(screen.getByText("Listing type")).toBeInTheDocument();
    expect(screen.getByText("Condition")).toBeInTheDocument();
    expect(screen.getByText("Availability")).toBeInTheDocument();
  });

  it("reports a subcategory choice to the page", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <CategoryFilters
        search={{}}
        activeCount={0}
        onClearAll={vi.fn()}
        onChange={onChange}
        subcategories={[makeSubcategory()]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Cameras/ }));
    expect(onChange).toHaveBeenCalledWith({ subcategory: "cameras" });
  });

  it("hides the Subcategory group for a category with no children", () => {
    render(
      <CategoryFilters
        search={{}}
        activeCount={0}
        onClearAll={vi.fn()}
        onChange={vi.fn()}
        subcategories={[]}
      />,
    );

    expect(screen.queryByText("Subcategory")).not.toBeInTheDocument();
    expect(screen.getByText("Listing type")).toBeInTheDocument();
  });

  it("shows the active-filter count on an immediate clear action", () => {
    render(
      <CategoryFilters
        search={{ mode: "rent" }}
        activeCount={2}
        onClearAll={vi.fn()}
        onChange={vi.fn()}
        subcategories={[]}
      />,
    );

    expect(screen.getByRole("button", { name: /Clear all \(2\)/ })).toBeInTheDocument();
  });
});

describe("MobileCategorySheet", () => {
  it("exposes a labelled floating filter trigger with its active count", () => {
    render(
      <MobileCategorySheet
        search={{ subcategory: "cameras", mode: "rent" }}
        subcategories={[makeSubcategory()]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Filters, 2 active" })).toBeInTheDocument();
  });

  it("opens a sheet that applies the whole draft at once", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MobileCategorySheet
        search={{}}
        subcategories={[makeSubcategory()]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Filters" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();

    // Choosing inside the sheet does not touch the URL until Apply.
    await user.click(screen.getByRole("button", { name: /Cameras/ }));
    expect(onChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Apply filters/ }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ subcategory: "cameras" }),
    );
  });
});

describe("CategoryProductsSkeleton", () => {
  it("reserves the page layout while the category loads", () => {
    const { container } = render(<CategoryProductsSkeleton />);
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });
});
