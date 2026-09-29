import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { useClearFavorites, useFavoriteIds, useFavoriteMutation } from "@/lib/query/favorites";
import { cn } from "@/lib/utils/cn";
import { FavoritesErrorState } from "./components/FavoritesErrorState";
import { FavoritesFilters } from "./components/FavoritesFilters";
import { FavoritesGrid } from "./components/FavoritesGrid";
import { FavoritesHeader } from "./components/FavoritesHeader";
import { FavoritesToolbar } from "./components/FavoritesToolbar";
import { MobileFavoritesToolbar } from "./components/MobileFavoritesToolbar";
import { RemoveFavoriteDialog } from "./components/RemoveFavoriteDialog";
import { useFavorites, usePrefetchFavoritesPage, usePrefetchProduct } from "./query";
import {
  activeFavoriteFilterCount,
  activeFavoriteFilters,
  CLEARED_FAVORITE_FILTERS,
  FAVORITE_PAGE_SIZE,
  toFavoriteFilters,
} from "./components/schema";
import type { FavoriteSearch } from "./types";

/**
 * The wishlist.
 *
 * The URL is the single source of truth, exactly as it is on Browse: the search
 * term, every filter, the sort order and the page all live in search params, so
 * refresh, back/forward and a shared link reproduce the same view. Filtering,
 * sorting and paging all happen in the database — the browser never receives the
 * whole wishlist just to narrow it locally.
 *
 * The page owns no favourite logic: state and mutations come from
 * `lib/query/favorites`, and each card's heart is the shared `FavoriteButton`
 * used by Home, Browse and Product Details.
 */
export function FavoritesPage() {
  const search = useSearch({ from: "/favorites" });
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  const resultsRef = useRef<HTMLDivElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);

  const filters = toFavoriteFilters(search, FAVORITE_PAGE_SIZE);
  const { data, isPending, isFetching, isError, refetch } = useFavorites(filters);
  const { ids, isLoading: idsLoading } = useFavoriteIds();
  const favoriteMutation = useFavoriteMutation();
  const clearFavorites = useClearFavorites();
  const prefetchPage = usePrefetchFavoritesPage();
  const prefetchProduct = usePrefetchProduct();

  const { items = [], pagination } = data ?? {};
  const total = pagination?.total;
  const totalPages = pagination?.totalPages ?? 1;
  const page = search.page ?? 1;
  const filterCount = activeFavoriteFilterCount(search);
  const hasSearch = !!search.search;
  const isFiltered = filterCount > 0 || hasSearch;
  const isRefreshing = isFetching && !isPending;

  /** Filter and sort changes reset to page 1; `page` is navigation, not a filter. */
  function applyFilters(patch: Partial<FavoriteSearch>) {
    void navigate({ to: "/favorites", search: { ...search, ...patch, page: undefined } });
  }

  function goToPage(next: number) {
    void navigate({ to: "/favorites", search: { ...search, page: next } });
  }

  /** `replace` keeps typing out of the history stack — back leaves the page. */
  function setSearchTerm(term: string) {
    void navigate({
      to: "/favorites",
      search: { ...search, search: term || undefined, page: undefined },
      replace: true,
    });
  }

  /**
   * A removal can shrink the list past the current page. Snap back to the last
   * real page instead of showing an empty grid for a page that no longer exists.
   */
  useEffect(() => {
    if (isPending || !total) return;
    if (page > totalPages) {
      void navigate({ to: "/favorites", search: { ...search, page: totalPages } });
    }
  }, [isPending, navigate, page, search, total, totalPages]);

  // A page change should not leave the user halfway down the previous page.
  const lastPageRef = useRef(page);
  useEffect(() => {
    if (lastPageRef.current === page) return;
    lastPageRef.current = page;
    resultsRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  }, [page, reduceMotion]);

  /**
   * The removal is already optimistic, so this only offers a way back — through
   * the same central mutation, so Undo can never behave differently from the
   * original action.
   */
  function handleRemoved(info: { productId: number; slug?: string; title: string }) {
    toast("Removed from favorites", {
      description: info.title,
      action: {
        label: "Undo",
        onClick: () => {
          favoriteMutation.mutate({
            productId: info.productId,
            favorited: true,
            slug: info.slug,
          });
        },
      },
    });
  }

  return (
    <div className="page-wrap space-y-6 pb-28 pt-8 lg:pb-24">
      <FavoritesHeader
        total={idsLoading ? undefined : ids.size}
        isLoading={isPending || idsLoading}
        showing={isFiltered ? total : undefined}
      />

      {isError ? (
        <FavoritesErrorState onRetry={() => void refetch()} />
      ) : (
        <>
          <FavoritesToolbar
            search={search}
            filters={activeFavoriteFilters(search)}
            onChange={applyFilters}
            onSearch={setSearchTerm}
            onClearAll={() => applyFilters(CLEARED_FAVORITE_FILTERS)}
            isSearching={isFetching && hasSearch}
          />

          <div className="grid gap-6 lg:grid-cols-[268px_minmax(0,1fr)]">
            <aside aria-label="Filters" className="hidden lg:block">
              <div className="raised-surface sticky top-24 space-y-5 rounded-3xl p-5">
                <FavoritesFilters
                  search={search}
                  activeCount={filterCount}
                  onChange={applyFilters}
                  onClearAll={() => applyFilters(CLEARED_FAVORITE_FILTERS)}
                />

                {total !== undefined && total > 0 && (
                  <>
                    <div className="neumo-divider" />
                    <button
                      type="button"
                      onClick={() => setClearOpen(true)}
                      className="flex w-full items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-bold text-muted-foreground transition hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                      <Trash2 size={14} aria-hidden />
                      Clear all favorites
                    </button>
                  </>
                )}
              </div>
            </aside>

            <div ref={resultsRef} className="scroll-mt-24 space-y-5">
              <div
                className={cn("transition-opacity duration-200", isRefreshing && "opacity-60")}
                aria-busy={isRefreshing}
              >
                <FavoritesGrid
                  products={items}
                  isLoading={isPending}
                  isFiltered={isFiltered}
                  onRemoved={handleRemoved}
                  onPrefetch={prefetchProduct}
                  onClearFilters={() => applyFilters(CLEARED_FAVORITE_FILTERS)}
                  onClearSearch={() => setSearchTerm("")}
                />
              </div>

              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={goToPage}
                onPrefetch={(next) => prefetchPage(toFavoriteFilters({ ...search, page: next }))}
              />
            </div>
          </div>
        </>
      )}

      <MobileFavoritesToolbar
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        search={search}
        activeCount={filterCount}
        isSearching={isFetching && hasSearch}
        onSearch={setSearchTerm}
        onChange={applyFilters}
        onClearAll={() => applyFilters(CLEARED_FAVORITE_FILTERS)}
      />

      <RemoveFavoriteDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        count={total}
        isPending={clearFavorites.isPending}
        onConfirm={() => {
          clearFavorites.mutate(undefined, {
            onSuccess: (cleared) => toast.success(`Cleared ${cleared} saved items`),
          });
          setClearOpen(false);
        }}
      />

      <BackToTop />
    </div>
  );
}

/** Appears only once the user is deep enough into the list for it to help. */
function BackToTop() {
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 480);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: 10 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed bottom-24 right-5 z-30 hidden lg:block"
        >
          <Button
            variant="secondary"
            size="icon"
            aria-label="Back to top"
            onClick={() => window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" })}
          >
            <ArrowUp size={16} aria-hidden />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
