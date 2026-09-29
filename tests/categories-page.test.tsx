import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@/lib/api/client";
import { CategoriesPage, CategoryPage } from "@/features/categories";
import * as query from "@/features/categories/query";
import {
  makeCategory,
  makeCategoryDetail,
  makeCategoryProduct,
  makeSubcategory,
} from "./support/category-fixtures";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  params: { categorySlug: "electronics" } as Record<string, string>,
  search: {} as Record<string, unknown>,
}));

/* The router is mocked with a real anchor whose href is built from `params`, so the
   assertions check the URL a visitor would actually get. */
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
  }: {
    to?: string;
    params?: Record<string, string | number>;
    children?: ReactNode;
  }) => {
    let href = String(to ?? "");
    for (const [key, value] of Object.entries(params ?? {})) {
      href = href.replace(`$${key}`, String(value));
    }
    return <a href={href}>{children}</a>;
  },
  useNavigate: () => mocks.navigate,
  useParams: () => mocks.params,
  useSearch: () => mocks.search,
  // The shared ProductCard's heart resolves the sign-in redirect from here.
  useLocation: () => ({ href: "/categories/electronics" }),
}));

// The shared ProductCard reads the session (for its save button) and the cache.
vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ user: null, loading: false, refresh: vi.fn() }),
}));

vi.mock("@/features/categories/query", () => ({
  useCategories: vi.fn(),
  useFeaturedCategories: vi.fn(),
  useCategory: vi.fn(),
  useSubcategories: vi.fn(),
  useCategoryProducts: vi.fn(),
  usePrefetchCategory: vi.fn(() => vi.fn()),
  usePrefetchCategoryProduct: vi.fn(() => vi.fn()),
  usePrefetchCategoryProducts: vi.fn(() => vi.fn()),
}));

/** Configure the pages' server state without a network or a real query client. */
function setCategories(value: Record<string, unknown>) {
  vi.mocked(query.useCategories).mockReturnValue(value as never);
}

function setCategoryDetail(value: Record<string, unknown>) {
  vi.mocked(query.useCategory).mockReturnValue(value as never);
}

function setProducts(value: Record<string, unknown>) {
  vi.mocked(query.useCategoryProducts).mockReturnValue(value as never);
}

function pageOf(items: unknown[], total = items.length, totalPages = 1, page = 1) {
  return { items, pagination: { page, pageSize: 12, total, totalPages } };
}

/** The shared ProductCard needs a query cache; the pages themselves read mocked hooks. */
function renderPage(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.params = { categorySlug: "electronics" };
  mocks.search = {};

  setCategories({ data: [makeCategory()], isPending: false, isError: false, refetch: vi.fn() });
  // The featured rail is off by default so it never double-counts links in the
  // assertions about the all-categories grid; the featured test enables it.
  vi.mocked(query.useFeaturedCategories).mockReturnValue({
    data: [],
    isPending: false,
  } as never);
  setCategoryDetail({
    data: makeCategoryDetail(),
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
  vi.mocked(query.useSubcategories).mockReturnValue({
    data: [],
    isPending: false,
  } as never);
  setProducts({
    data: pageOf([makeCategoryProduct()], 248),
    isPending: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  });
});

describe("CategoriesPage", () => {
  it("renders the introduction and a card per top-level category", () => {
    setCategories({
      data: [
        makeCategory(),
        makeCategory({ id: 2, name: "Furniture", slug: "furniture", parentId: null }),
      ],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage(<CategoriesPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Explore by category" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Electronics/ })).toHaveAttribute(
      "href",
      "/categories/electronics",
    );
    expect(screen.getByRole("link", { name: /Furniture/ })).toHaveAttribute(
      "href",
      "/categories/furniture",
    );
  });

  it("keeps subcategories off the index — they belong to their parent's page", () => {
    setCategories({
      data: [makeCategory(), makeSubcategory()],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage(<CategoriesPage />);

    expect(screen.getByRole("link", { name: /Electronics/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Cameras/ })).not.toBeInTheDocument();
  });

  it("shows skeletons while the taxonomy loads", () => {
    setCategories({ data: undefined, isPending: true, isError: false, refetch: vi.fn() });

    const { container } = renderPage(<CategoriesPage />);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /Electronics/ })).not.toBeInTheDocument();
  });

  it("retries the category list without reloading the page", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    setCategories({ data: [], isPending: false, isError: true, refetch });

    renderPage(<CategoriesPage />);
    expect(screen.getByText("Unable to load categories")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("offers a way onward when the catalogue is simply empty", () => {
    setCategories({ data: [], isPending: false, isError: false, refetch: vi.fn() });

    renderPage(<CategoriesPage />);

    expect(screen.getByText("No categories yet")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Browse all products" }).length,
    ).toBeGreaterThan(0);
  });

  it("shows the backend's featured subset rather than a hardcoded list", () => {
    setCategories({
      data: [
        makeCategory(),
        makeCategory({ id: 2, name: "Tools", slug: "tools", isFeatured: false }),
      ],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    vi.mocked(query.useFeaturedCategories).mockReturnValue({
      data: [makeCategory()],
      isPending: false,
    } as never);

    renderPage(<CategoriesPage />);

    expect(screen.getByRole("heading", { name: "Featured categories" })).toBeInTheDocument();
    // Featured rail (Electronics) plus the all-categories grid (Electronics + Tools).
    expect(screen.getAllByRole("link", { name: /Electronics/ }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("link", { name: /Tools/ })).toHaveAttribute(
      "href",
      "/categories/tools",
    );
  });
});

describe("CategoryPage", () => {
  it("requests exactly the category in the route", async () => {
    renderPage(<CategoryPage />);

    expect(query.useCategory).toHaveBeenCalledWith("electronics");
    const filters = vi.mocked(query.useCategoryProducts).mock.calls[0]![0];
    expect(filters).toMatchObject({ category: "electronics", sort: "recommended", page: 1 });
  });

  it("scopes the request to a subcategory filter when one is chosen", () => {
    mocks.search = { subcategory: "cameras", page: 2 };

    renderPage(<CategoryPage />);

    const filters = vi.mocked(query.useCategoryProducts).mock.calls[0]![0];
    expect(filters).toMatchObject({ category: "cameras", page: 2 });
  });

  it("renders the header, the results and the product count", async () => {
    renderPage(<CategoryPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Electronics" })).toBeInTheDocument();
    expect(await screen.findByText("Sony WH-1000XM5")).toBeInTheDocument();
    expect(screen.getAllByText("248 products").length).toBeGreaterThan(0);
  });

  it("shows a layout skeleton while the category loads", () => {
    setCategoryDetail({
      data: undefined,
      isPending: true,
      isError: false,
      refetch: vi.fn(),
    });

    const { container } = renderPage(<CategoryPage />);
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it("shows a not-found state for an unknown or inactive category", () => {
    setCategoryDetail({
      data: undefined,
      isPending: false,
      isError: true,
      error: new ApiError("NOT_FOUND", "Category not found.", 404),
      refetch: vi.fn(),
    });

    renderPage(<CategoryPage />);

    expect(screen.getByText("Category not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Explore categories" })).toBeInTheDocument();
  });

  it("never asks the API about a slug that cannot exist", () => {
    mocks.params = { categorySlug: "!!! not-a-slug" };

    renderPage(<CategoryPage />);

    expect(screen.getByText("Category not found")).toBeInTheDocument();
    expect(vi.mocked(query.useCategoryProducts).mock.calls[0]![1]).toBe(false);
  });

  it("retries a transient failure without reloading the application", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    setCategoryDetail({
      data: undefined,
      isPending: false,
      isError: true,
      error: new ApiError("INTERNAL_ERROR", "boom", 500),
      refetch,
    });

    renderPage(<CategoryPage />);
    expect(screen.getByText("Unable to load this category")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("lists subcategories only when the category has children", () => {
    setCategoryDetail({
      data: makeCategoryDetail({ subcategoryCount: 2 }),
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    vi.mocked(query.useSubcategories).mockReturnValue({
      data: [makeSubcategory(), makeSubcategory({ id: 12, name: "Audio", slug: "audio" })],
      isPending: false,
    } as never);

    renderPage(<CategoryPage />);

    expect(screen.getByRole("heading", { name: "Subcategories" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Audio/ })).toBeInTheDocument();
  });

  it("resets to page 1 when a filter changes", async () => {
    const user = userEvent.setup();
    mocks.search = { sort: "recommended", page: 3 };

    renderPage(<CategoryPage />);
    await user.selectOptions(screen.getByLabelText("Sort results"), "newest");

    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { categorySlug: "electronics" },
        search: expect.objectContaining({ sort: "newest", page: undefined }),
      }),
    );
  });

  it("keeps the page number when only the page changes", async () => {
    const user = userEvent.setup();
    setProducts({
      data: pageOf([makeCategoryProduct()], 40, 4, 1),
      isPending: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage(<CategoryPage />);
    await user.click(screen.getByRole("button", { name: "Page 2" }));

    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith(
        expect.objectContaining({ search: expect.objectContaining({ page: 2 }) }),
      ),
    );
  });

  it("clears a subcategory filter without losing the search term", async () => {
    const user = userEvent.setup();
    mocks.search = { subcategory: "cameras", search: "lens" };

    renderPage(<CategoryPage />);
    await user.click(screen.getByRole("button", { name: /Remove filter: cameras/ }));

    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        search: expect.objectContaining({ subcategory: undefined, search: "lens" }),
      }),
    );
  });

  it("offers a way out when the category has no matching products", () => {
    setProducts({
      data: pageOf([], 0, 1, 1),
      isPending: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage(<CategoryPage />);

    expect(screen.getByText("No products found")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Browse all products" })[0]).toHaveAttribute(
      "href",
      "/browse",
    );
  });

  it("searches within the category rather than the whole catalogue", () => {
    renderPage(<CategoryPage />);
    expect(screen.getByLabelText("Search in Electronics")).toBeInTheDocument();
  });
});
