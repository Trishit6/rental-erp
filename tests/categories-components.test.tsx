import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CategoryCard } from "@/features/categories/components/CategoryCard";
import { CategoryGrid } from "@/features/categories/components/CategoryGrid";
import { CategoryHeader } from "@/features/categories/components/CategoryHeader";
import { CategoryIcon } from "@/features/categories/components/CategoryIcon";
import {
  CategoriesBreadcrumbs,
  CategoryBreadcrumbs,
} from "@/features/categories/components/CategoryBreadcrumbs";
import {
  CategoryErrorState,
  CategoryNotFound,
} from "@/features/categories/components/CategoryErrorState";
import { CategoryEmptyState } from "@/features/categories/components/CategoryEmptyState";
import { FeaturedCategories } from "@/features/categories/components/FeaturedCategories";
import { SubcategoryList } from "@/features/categories/components/SubcategoryList";
import {
  makeCategory,
  makeCategoryDetail,
  makeSubcategory,
} from "./support/category-fixtures";

/* The router is mocked with a real anchor whose href is built from `params`, so the
   assertions check the URL a visitor would actually get. */
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to?: string;
    params?: Record<string, string | number>;
    children?: ReactNode;
  } & Record<string, unknown>) => {
    let href = String(to ?? "");
    for (const [key, value] of Object.entries(params ?? {})) {
      href = href.replace(`$${key}`, String(value));
    }
    // Handlers such as onMouseEnter/onFocus are forwarded, so prefetch behaviour
    // is exercised rather than merely rendered.
    return (
      <a href={href} {...(rest as Record<string, unknown>)}>
        {children}
      </a>
    );
  },
}));

describe("CategoryIcon", () => {
  it("renders a glyph for a whitelisted backend identifier", () => {
    const { container } = render(<CategoryIcon icon="camera" name="Cameras" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("falls back to a name mapping when no identifier is stored", () => {
    const { container } = render(<CategoryIcon icon={null} name="Furniture" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("never renders an unknown identifier as a component", () => {
    // A hostile value can only ever reach the generic fallback.
    for (const hostile of ["../../etc/passwd", "Process", "window", ""]) {
      const { container } = render(<CategoryIcon icon={hostile} name="Unknown" />);
      expect(container.querySelector("svg")).toBeInTheDocument();
    }
  });

  it("is decorative unless it is given a label", () => {
    const { container, rerender } = render(<CategoryIcon icon="sofa" name="Furniture" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

    rerender(<CategoryIcon icon="sofa" name="Furniture" label="Furniture" />);
    expect(screen.getByRole("img", { name: "Furniture" })).toBeInTheDocument();
  });
});

describe("CategoryCard", () => {
  it("links to the category page and reports the API's product count", () => {
    render(<CategoryCard category={makeCategory()} />);

    expect(screen.getByRole("link")).toHaveAttribute("href", "/categories/electronics");
    expect(screen.getByText("248 products")).toBeInTheDocument();
    expect(screen.getByText("Electronics")).toBeInTheDocument();
  });

  it("shows the category description when the API provides one", () => {
    render(<CategoryCard category={makeCategory({ description: "Laptops and audio" })} />);
    expect(screen.getByText("Laptops and audio")).toBeInTheDocument();
  });

  it("never invents a count for a category the API reports as empty", () => {
    render(<CategoryCard category={makeCategory({ productCount: 0 })} />);
    expect(screen.queryByText(/0 products/)).not.toBeInTheDocument();
    expect(screen.getByText("Explore")).toBeInTheDocument();
  });

  it("uses a singular label for a single product", () => {
    render(<CategoryCard category={makeCategory({ productCount: 1 })} />);
    expect(screen.getByText("1 product")).toBeInTheDocument();
  });

  it("renders a real image when the category has one", () => {
    render(<CategoryCard category={makeCategory()} />);
    expect(screen.getByRole("presentation")).toBeInTheDocument();
  });

  it("falls back to its icon when the category has no image", () => {
    const { container } = render(
      <CategoryCard category={makeCategory({ imageUrl: null, icon: "camera" })} />,
    );
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("prefetches the one category under the pointer, on hover and on focus", async () => {
    const user = userEvent.setup();
    const onPrefetch = vi.fn();
    render(<CategoryCard category={makeCategory({ slug: "home" })} onPrefetch={onPrefetch} />);

    await user.hover(screen.getByRole("link"));
    expect(onPrefetch).toHaveBeenCalledWith("home");

    screen.getByRole("link").focus();
    expect(onPrefetch).toHaveBeenCalledTimes(2);
  });

  it("renders a compact tile for subcategories", () => {
    render(<CategoryCard category={makeSubcategory()} variant="tile" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/categories/cameras");
    expect(screen.getByText("Cameras")).toBeInTheDocument();
  });
});

describe("CategoryGrid", () => {
  it("renders a card per category", () => {
    render(
      <CategoryGrid
        categories={[
          makeCategory(),
          makeCategory({ id: 2, name: "Furniture", slug: "furniture" }),
        ]}
      />,
    );
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("shows skeletons instead of cards while loading", () => {
    render(<CategoryGrid categories={[]} isLoading />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("hands over to the empty state when the API returns nothing", () => {
    render(
      <CategoryGrid
        categories={[]}
        emptyState={<p>Nothing to explore yet</p>}
      />,
    );
    expect(screen.getByText("Nothing to explore yet")).toBeInTheDocument();
  });
});

describe("CategoryHeader", () => {
  it("shows the name, description and the counts the API returned", () => {
    render(
      <CategoryHeader
        category={makeCategoryDetail({ subcategoryCount: 4 })}
        total={248}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Electronics" })).toBeInTheDocument();
    expect(screen.getByText(/Laptops, phones, cameras/)).toBeInTheDocument();
    expect(screen.getByText("248 products")).toBeInTheDocument();
    expect(screen.getByText("4 subcategories")).toBeInTheDocument();
  });

  it("hides the subcategory count for a leaf category", () => {
    render(<CategoryHeader category={makeCategoryDetail({ subcategoryCount: 0 })} total={0} />);
    expect(screen.queryByText(/subcategor/)).not.toBeInTheDocument();
  });

  it("uses a singular label for one product and a busy state while loading", () => {
    const { rerender } = render(<CategoryHeader category={makeCategoryDetail()} total={1} />);
    expect(screen.getByText("1 product")).toBeInTheDocument();

    rerender(<CategoryHeader category={makeCategoryDetail()} total={1} isLoading />);
    expect(screen.getByText(/Finding good things/)).toBeInTheDocument();
  });
});

describe("CategoryBreadcrumbs", () => {
  it("links home and back to the category index", () => {
    render(<CategoryBreadcrumbs category={makeCategoryDetail()} />);

    expect(screen.getByRole("link", { name: /Home/ })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Categories" })).toHaveAttribute(
      "href",
      "/categories",
    );
  });

  it("walks the tree for a nested category and marks the current page", () => {
    render(
      <CategoryBreadcrumbs
        category={makeCategoryDetail({
          id: 11,
          name: "Cameras",
          slug: "cameras",
          parent: makeCategory(),
        })}
      />,
    );

    expect(screen.getByRole("link", { name: "Electronics" })).toHaveAttribute(
      "href",
      "/categories/electronics",
    );
    expect(screen.getByText("Cameras")).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Cameras" })).not.toBeInTheDocument();
  });

  it("renders an accessible breadcrumb list", () => {
    render(<CategoryBreadcrumbs category={makeCategoryDetail()} />);
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
  });

  it("renders a two-step trail on the categories index", () => {
    render(<CategoriesBreadcrumbs />);
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).getByRole("link", { name: /Home/ })).toBeInTheDocument();
    expect(within(nav).getByText("Categories")).toHaveAttribute("aria-current", "page");
  });
});

describe("SubcategoryList", () => {
  it("renders nothing for a leaf category", () => {
    const { container } = render(<SubcategoryList subcategories={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists each child with a link to its own page", () => {
    render(
      <SubcategoryList
        subcategories={[
          makeSubcategory(),
          makeSubcategory({ id: 12, name: "Audio", slug: "audio" }),
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Subcategories" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Cameras/ })).toHaveAttribute(
      "href",
      "/categories/cameras",
    );
    expect(screen.getByRole("link", { name: /Audio/ })).toHaveAttribute(
      "href",
      "/categories/audio",
    );
  });
});

describe("FeaturedCategories", () => {
  it("renders nothing when no category is featured", () => {
    const { container } = render(<FeaturedCategories categories={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("links each featured category and offers the full index", () => {
    render(<FeaturedCategories categories={[makeCategory()]} />);

    expect(screen.getByRole("link", { name: /Electronics/ })).toHaveAttribute(
      "href",
      "/categories/electronics",
    );
    expect(screen.getByRole("link", { name: /All categories/ })).toHaveAttribute(
      "href",
      "/categories",
    );
  });

  it("prefetches the hovered category", async () => {
    const user = userEvent.setup();
    const onPrefetch = vi.fn();
    render(<FeaturedCategories categories={[makeCategory()]} onPrefetch={onPrefetch} />);

    await user.hover(screen.getByRole("link", { name: /Electronics/ }));
    expect(onPrefetch).toHaveBeenCalledWith("electronics");
  });
});

describe("category states", () => {
  it("offers both clear actions and a way out when nothing matched", async () => {
    const user = userEvent.setup();
    const onClearFilters = vi.fn();
    const onClearSearch = vi.fn();

    render(
      <CategoryEmptyState
        hasFilters
        hasSearch
        onClearFilters={onClearFilters}
        onClearSearch={onClearSearch}
      />,
    );

    expect(screen.getByText("No products found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse all products" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
    expect(onClearSearch).toHaveBeenCalledTimes(1);
  });

  it("hides the clear actions when they would do nothing", () => {
    render(
      <CategoryEmptyState
        hasFilters={false}
        hasSearch={false}
        onClearFilters={vi.fn()}
        onClearSearch={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
  });

  it("retries only the failed query", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<CategoryErrorState onRetry={onRetry} />);

    expect(screen.getByText("Unable to load this category")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("sends a missing category somewhere useful instead of offering a retry", () => {
    render(<CategoryNotFound />);

    expect(screen.getByText("Category not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Explore categories" })).toHaveAttribute(
      "href",
      "/categories",
    );
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});
