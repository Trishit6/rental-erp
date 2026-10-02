import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowLeft, SlidersHorizontal } from "lucide-react";
import { Pagination } from "@/components/shared/pagination";
import { FloatingSlotContent } from "@/lib/floating/rail";
import { DESKTOP_QUERY, useMediaQuery } from "@/lib/utils/use-media-query";
import { ActiveFilters } from "@/components/shared/product-filters/ActiveFilters";
import { CategoryFilter } from "@/components/shared/product-filters/CategoryFilter";
import { FilterPanel } from "@/components/shared/product-filters/FilterPanel";
import { MobileFilterSheet } from "@/components/shared/product-filters/MobileFilterSheet";
import { SearchBar } from "@/components/shared/product-filters/SearchBar";
import { SortSelect } from "@/components/shared/product-filters/SortSelect";
import {
  activeProductFilterCount,
  activeProductFilters,
  CLEARED_PRODUCT_FILTERS,
  PRODUCT_PAGE_SIZE,
  toProductFilters,
} from "@/lib/product-search/schema";
import { cn } from "@/lib/utils/cn";
import { BrowseEmptyState } from "./components/BrowseEmptyState";
import { BrowseErrorState } from "./components/BrowseErrorState";
import { BrowseHeader } from "./components/BrowseHeader";
import { ProductGrid } from "./components/ProductGrid";
import {
  useBrowseCategories,
  useBrowseProducts,
  usePrefetchBrowsePage,
  usePrefetchProduct,
} from "./query";
import type { BrowseSearch } from "./types";

/**
 * Browse & product discovery.
 *
 * The URL is the single source of truth: every filter, the sort order and the
 * page live in search params, so refresh, back/forward and shared links all
 * reproduce the same view. `parseProductSearch` (the route's validateSearch)
 * turns those params into typed state and can never throw.
 *
 * Clearing: "Clear all" drops every filter (and the sort) but keeps the typed
 * search term — the search field has its own clear button. The empty state
 * offers both, since nothing matched.
 *
 * The filter UI and search schema are shared with the category pages
 * (`components/shared/product-filters`, `lib/product-search`); this page only owns
 * what is genuinely browse-specific.
 */
export function BrowsePage() {
  const search = useSearch({ from: "/browse" });
  const navigate = useNavigate();

  const resultsRef = useRef<HTMLDivElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // The pill is mobile-only, so it must not occupy a rail slot on desktop,
  // where it would still push its neighbours down despite being `lg:hidden`.
  const isMobileOnly = !useMediaQuery(DESKTOP_QUERY);

  const filters = toProductFilters(search, PRODUCT_PAGE_SIZE);
  const { data, isPending, isFetching, isError, refetch } = useBrowseProducts(filters);
  const { data: categories, isPending: categoriesLoading } = useBrowseCategories();
  const prefetchPage = usePrefetchBrowsePage();
  const prefetchProduct = usePrefetchProduct();

  const { items = [], pagination } = data ?? {};
  const totalPages = pagination?.totalPages ?? 1;
  const page = search.page ?? 1;
  const filterCount = activeProductFilterCount(search);
  const hasSearch = !!search.search;
  const activeCategory = categories?.find((category) => category.slug === search.category);
  const isRefreshing = isFetching && !isPending;

  /** Filter/sort changes reset to page 1; `page` is navigation, not a filter. */
  function applyFilters(patch: Partial<BrowseSearch>) {
    void navigate({ to: "/browse", search: { ...search, ...patch, page: undefined } });
  }

  function goToPage(next: number) {
    void navigate({ to: "/browse", search: { ...search, page: next } });
  }

  /** `replace` keeps typing out of history — back leaves browse, not every keystroke. */
  function setSearchTerm(term: string) {
    void navigate({
      to: "/browse",
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

  /** Category chips are the browse-specific filter group on this page. */
  const categoryGroup = ({
    search: current,
    onChange,
  }: {
    search: BrowseSearch;
    onChange: (patch: Partial<BrowseSearch>) => void;
  }) => (
    <CategoryFilter
      categories={categories}
      isLoading={categoriesLoading}
      value={current.category}
      onChange={(category) => onChange({ category })}
    />
  );

  return (
    <div className="page-wrap space-y-6 pb-24 pt-8 lg:pb-10">
      <div>
        <Link to="/" className="nav-link inline-flex items-center gap-1 text-sm font-semibold">
          <ArrowLeft size={15} />
          Back home
        </Link>
        <div className="mt-5">
          <BrowseHeader
            total={pagination?.total}
            isLoading={isPending}
            categoryName={activeCategory?.name}
          />
        </div>
      </div>

      <div className="raised-surface flex flex-col gap-3 rounded-3xl p-4 sm:flex-row sm:items-center">
        <SearchBar
          value={search.search ?? ""}
          onSearch={setSearchTerm}
          isSearching={isFetching && hasSearch}
        />
        <SortSelect value={search.sort} onChange={(sort) => applyFilters({ sort })} />
      </div>

      <ActiveFilters
        filters={activeProductFilters(search)}
        onChange={(patch) => applyFilters(patch)}
        onClearAll={() => applyFilters(CLEARED_PRODUCT_FILTERS)}
      />

      <div className="grid gap-6 lg:grid-cols-[268px_minmax(0,1fr)]">
        <FilterPanel
          search={search}
          activeCount={filterCount}
          idPrefix="browse"
          leadGroup={categoryGroup}
          onChange={(patch) => applyFilters(patch)}
          onClearAll={() => applyFilters(CLEARED_PRODUCT_FILTERS)}
        />

        <div ref={resultsRef} className="scroll-mt-24 space-y-5">
          {isError ? (
            <BrowseErrorState onRetry={() => void refetch()} />
          ) : (
            <>
              <div
                className={cn("transition-opacity duration-200", isRefreshing && "opacity-60")}
                aria-busy={isRefreshing}
              >
                <ProductGrid
                  products={items}
                  isLoading={isPending}
                  mode={search.mode}
                  onPrefetch={prefetchProduct}
                  emptyState={
                    <BrowseEmptyState
                      hasFilters={filterCount > 0}
                      hasSearch={hasSearch}
                      onClearFilters={() => applyFilters(CLEARED_PRODUCT_FILTERS)}
                      onClearSearch={() => setSearchTerm("")}
                    />
                  }
                />
              </div>

              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={goToPage}
                onPrefetch={(next) => prefetchPage(toProductFilters({ ...search, page: next }))}
              />
            </>
          )}
        </div>
      </div>

      <MobileFilterSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        search={search}
        activeCount={activeProductFilterCount}
        leadGroup={categoryGroup}
        onApply={(next) => {
          setSheetOpen(false);
          applyFilters({ ...CLEARED_PRODUCT_FILTERS, ...next });
        }}
      />

      {/* Mobile filter entry point — floating, with an active-filter count badge.
          It claims the `filters` slot of the shared rail rather than pinning
          itself to the corner, which is where the cart and the assistant live. */}
      <FloatingSlotContent slot="filters" active={isMobileOnly}>
        <motion.button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label={`Filters${filterCount > 0 ? `, ${filterCount} active` : ""}`}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.96 }}
          transition={{ duration: 0.2 }}
          className="floating-dock flex items-center gap-2 rounded-full px-4 py-3 text-sm font-bold text-foreground lg:hidden"
        >
          <SlidersHorizontal size={16} aria-hidden className="text-primary" />
          Filters
          {filterCount > 0 && (
            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {filterCount}
            </span>
          )}
        </motion.button>
      </FloatingSlotContent>
    </div>
  );
}
