import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { ArrowLeft, LayoutGrid } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { ActiveFilters } from "@/components/shared/product-filters/ActiveFilters";
import { SearchBar } from "@/components/shared/product-filters/SearchBar";
import { SortSelect } from "@/components/shared/product-filters/SortSelect";
import { Button } from "@/components/ui/button";
import { CategoriesBreadcrumbs, CategoryBreadcrumbs } from "./components/CategoryBreadcrumbs";
import { CategoryEmptyState } from "./components/CategoryEmptyState";
import { CategoryErrorState, CategoryNotFound } from "./components/CategoryErrorState";
import { CategoryFilters } from "./components/CategoryFilters";
import { CategoryGrid } from "./components/CategoryGrid";
import { CategoryHeader } from "./components/CategoryHeader";
import { CategoryProducts } from "./components/CategoryProducts";
import { CategoryProductsSkeleton } from "./components/CategoryProductsSkeleton";
import { FeaturedCategories } from "./components/FeaturedCategories";
import { MobileCategorySheet } from "./components/MobileCategorySheet";
import { SubcategoryList } from "./components/SubcategoryList";
import {
  categoryActiveFilterCount,
  categoryActiveFilters,
  CLEARED_CATEGORY_FILTERS,
  parseCategorySlug,
  toCategoryFilters,
} from "./components/schema";
import {
  useCategories,
  useCategory,
  useCategoryProducts,
  useFeaturedCategories,
  usePrefetchCategory,
  usePrefetchCategoryProduct,
  usePrefetchCategoryProducts,
  useSubcategories,
} from "./query";
import type { CategorySearch } from "./types";

/**
 * `/categories` — the catalogue's front door.
 *
 * Loads category information only: no products are fetched here, and the list comes
 * from the same cache entry Home and Browse already use. Hovering a card prefetches
 * that one category's detail (never its products), so the click feels instant
 * without spending a request on every category.
 */
export function CategoriesPage() {
  const { data: categories, isPending, isError, refetch } = useCategories();
  const featured = useFeaturedCategories();
  const prefetchCategory = usePrefetchCategory();

  // Only top-level categories become cards; children are shown on the parent page.
  const topLevel = useMemo(
    () => (categories ?? []).filter((category) => category.parentId === null),
    [categories],
  );

  return (
    <div className="page-wrap space-y-8 pb-24 pt-8 lg:pb-10">
      <div>
        <CategoriesBreadcrumbs />
        <header className="mt-5">
          <p className="eyebrow">Rent it, buy it, or pass it on</p>
          <h1 className="section-title mt-1 text-3xl sm:text-4xl">Explore by category</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Every category below holds listings you can rent for a weekend, buy outright, or give a
            second life to as pre-loved. Pick a direction and we will show you what neighbours are
            offering right now.
          </p>
        </header>
      </div>

      <FeaturedCategories
        categories={featured.data ?? []}
        isLoading={featured.isPending}
        onPrefetch={prefetchCategory}
      />

      <section className="space-y-4" aria-labelledby="all-categories-heading">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Everything on Revaro</p>
            <h2 id="all-categories-heading" className="section-title mt-1">
              All categories
            </h2>
          </div>
          <Button asChild variant="secondary" size="sm">
            <Link to="/browse">Browse all products</Link>
          </Button>
        </div>

        <CategoryGrid
          categories={topLevel}
          isLoading={isPending}
          onPrefetch={prefetchCategory}
          emptyState={
            isError ? (
              <CategoryErrorState
                title="Unable to load categories"
                description="We couldn't reach the catalogue. Check your connection and try again."
                onRetry={() => void refetch()}
              />
            ) : (
              <EmptyState
                icon={LayoutGrid}
                title="No categories yet"
                description="Nothing has been listed yet. Check back soon, or browse everything instead."
                action={
                  <Button asChild size="sm">
                    <Link to="/browse">Browse all products</Link>
                  </Button>
                }
              />
            )
          }
        />
      </section>
    </div>
  );
}

/**
 * `/categories/$categorySlug` — a category behaves like a Browse results page
 * scoped to one branch of the catalogue.
 *
 * The URL stays the single source of truth (the route's `validateSearch` is the
 * shared product-search parser), so filters, sort and page are shareable and
 * back/forward works. The category itself always comes from the route param — the
 * parser drops any `?category=` — and the backend re-verifies that it exists and is
 * active before returning anything.
 */
export function CategoryPage() {
  const { categorySlug } = useParams({ from: "/categories/$categorySlug" });
  const search = useSearch({ from: "/categories/$categorySlug" });
  const navigate = useNavigate();

  const slug = parseCategorySlug(categorySlug);
  const resultsRef = useRef<HTMLDivElement>(null);

  const categoryQuery = useCategory(slug ?? "");
  const category = categoryQuery.data;

  // Subcategories are only worth a request when the category actually has children.
  const subcategoriesQuery = useSubcategories(slug ?? "", !!category?.subcategoryCount);
  const subcategories = subcategoriesQuery.data ?? [];

  const filters = useMemo(() => toCategoryFilters(search, slug ?? ""), [search, slug]);
  // Hold the product request back until the category is known to exist: an unknown
  // or inactive slug must not fire a query that can only ever come back empty.
  const productsQuery = useCategoryProducts(filters, !!slug && !!category);

  const prefetchCategory = usePrefetchCategory();
  const prefetchProduct = usePrefetchCategoryProduct();
  const prefetchPage = usePrefetchCategoryProducts();

  const { items = [], pagination } = productsQuery.data ?? {};
  const totalPages = pagination?.totalPages ?? 1;
  const page = search.page ?? 1;
  const filterCount = categoryActiveFilterCount(search);
  const hasSearch = !!search.search;
  const isRefreshing = productsQuery.isFetching && !productsQuery.isPending;

  /** Filter/sort changes reset to page 1; `page` is navigation, not a filter. */
  function applyFilters(patch: Partial<CategorySearch>) {
    void navigate({
      to: "/categories/$categorySlug",
      params: { categorySlug },
      search: { ...search, ...patch, page: undefined },
    });
  }

  function goToPage(next: number) {
    void navigate({
      to: "/categories/$categorySlug",
      params: { categorySlug },
      search: { ...search, page: next },
    });
  }

  /** `replace` keeps typing out of history — back leaves the category, not every keystroke. */
  function setSearchTerm(term: string) {
    void navigate({
      to: "/categories/$categorySlug",
      params: { categorySlug },
      search: { ...search, search: term || undefined, page: undefined },
      replace: true,
    });
  }

  // A page change should not leave the visitor halfway down the previous page.
  const lastPageRef = useRef(page);
  useEffect(() => {
    if (lastPageRef.current === page) return;
    lastPageRef.current = page;
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [page]);

  // A malformed slug can never resolve — don't ask the API about it.
  if (!slug) {
    return (
      <CategoryPageShell>
        <CategoryNotFound />
      </CategoryPageShell>
    );
  }

  // Nothing cached yet: render the real layout so the page doesn't jump on arrival.
  if (categoryQuery.isPending) return <CategoryProductsSkeleton />;

  // A 404 is a permanent answer (unknown or deactivated category); anything else is
  // transient, so it gets a retry that refetches only this query.
  if (categoryQuery.isError) {
    const status = (categoryQuery.error as { status?: number } | undefined)?.status;
    return (
      <CategoryPageShell>
        {status === 404 ? (
          <CategoryNotFound />
        ) : (
          <CategoryErrorState onRetry={() => void categoryQuery.refetch()} />
        )}
      </CategoryPageShell>
    );
  }

  // Settled without an error and without a category — treat it as missing rather
  // than rendering a half-built page.
  if (!category) {
    return (
      <CategoryPageShell>
        <CategoryNotFound />
      </CategoryPageShell>
    );
  }

  return (
    <div className="page-wrap space-y-6 pb-24 pt-8 lg:pb-10">
      <div>
        <Link
          to="/categories"
          className="nav-link inline-flex items-center gap-1 text-sm font-semibold"
        >
          <ArrowLeft size={15} aria-hidden />
          All categories
        </Link>
        <div className="mt-4">
          <CategoryBreadcrumbs category={category} />
        </div>
      </div>

      <CategoryHeader
        category={category}
        total={pagination?.total}
        isLoading={productsQuery.isPending}
      />

      {category.subcategoryCount > 0 && (
        <SubcategoryList
          subcategories={subcategories}
          isLoading={subcategoriesQuery.isPending}
          onPrefetch={prefetchCategory}
        />
      )}

      <div className="raised-surface flex flex-col gap-3 rounded-3xl p-4 sm:flex-row sm:items-center">
        <SearchBar
          id="category-search"
          value={search.search ?? ""}
          onSearch={setSearchTerm}
          isSearching={productsQuery.isFetching && hasSearch}
          label={`Search in ${category.name}`}
          placeholder={`Search in ${category.name}`}
        />
        <SortSelect
          id="category-sort"
          value={search.sort}
          onChange={(sort) => applyFilters({ sort })}
        />
      </div>

      <ActiveFilters
        filters={categoryActiveFilters(search)}
        onChange={(patch) => applyFilters(patch)}
        onClearAll={() => applyFilters(CLEARED_CATEGORY_FILTERS)}
      />

      <div className="grid gap-6 lg:grid-cols-[268px_minmax(0,1fr)]">
        <CategoryFilters
          search={search}
          activeCount={filterCount}
          subcategories={subcategories}
          isLoadingSubcategories={subcategoriesQuery.isPending}
          onChange={(patch) => applyFilters(patch)}
          onClearAll={() => applyFilters(CLEARED_CATEGORY_FILTERS)}
        />

        <CategoryProducts
          products={items}
          isLoading={productsQuery.isPending}
          isRefreshing={isRefreshing}
          isError={productsQuery.isError}
          mode={search.mode}
          page={page}
          totalPages={totalPages}
          resultsRef={resultsRef}
          onPageChange={goToPage}
          onPrefetchProduct={prefetchProduct}
          onPrefetchPage={(next) =>
            prefetchPage(toCategoryFilters({ ...search, page: next }, slug))
          }
          emptyState={
            <CategoryEmptyState
              hasFilters={filterCount > 0}
              hasSearch={hasSearch}
              onClearFilters={() => applyFilters(CLEARED_CATEGORY_FILTERS)}
              onClearSearch={() => setSearchTerm("")}
            />
          }
          errorState={
            <CategoryErrorState
              title="Unable to load these products"
              description="We couldn't fetch listings for this category. Your filters are still here — try again."
              onRetry={() => void productsQuery.refetch()}
            />
          }
        />
      </div>

      <MobileCategorySheet
        search={search}
        subcategories={subcategories}
        isLoadingSubcategories={subcategoriesQuery.isPending}
        onChange={(patch) => applyFilters(patch)}
      />
    </div>
  );
}

/** Minimal shell for the not-found / error states of the detail route. */
function CategoryPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="page-wrap space-y-6 pb-24 pt-8 lg:pb-10">
      <CategoriesBreadcrumbs />
      <div className="pt-6">{children}</div>
    </div>
  );
}
