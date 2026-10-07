import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import { useCartQuery } from "@/lib/query/cart";
import {
  getDashboardAdminStats,
  getDashboardFavorites,
  getDashboardOrders,
  getDashboardRentals,
  getRecommendedProducts,
} from "./api";

/**
 * Dashboard queries.
 *
 * ## Keying against the shared prefixes
 *
 * Every key below is built from the *same* factories the feature pages use
 * (`queryKeys.ordersList`, `queryKeys.rentalsList`, `queryKeys.favoritesList`,
 * `queryKeys.products`, `queryKeys.adminStats`). Two properties follow:
 *
 *  - invalidations land here automatically — placing an order invalidates the
 *    `orders` prefix, which is exactly the entry this dashboard reads;
 *  - a value already cached by a page (for instance the admin overview, reused
 *    from the admin workspace) is shared rather than fetched twice.
 *
 * ## Refetching
 *
 * The dashboard is a landing page, not a live feed: nothing here polls, and
 * `refetchOnWindowFocus` is off so returning to the tab does not re-fire five
 * requests to redraw five cards that already agree with the server. A mutation
 * elsewhere still refreshes the relevant section, because those invalidations
 * invalidate by prefix.
 */

/** User-specific figures barely drift — 60s of staleness is plenty for a landing page. */
const DASHBOARD_STALE_MS = 60_000;
/** Keep showing the previous data across a background refetch instead of flashing skeletons. */
const RETRY = 1;

export function useDashboardOrders() {
  return useQuery({
    queryKey: queryKeys.ordersList({ page: 1 }),
    queryFn: getDashboardOrders,
    staleTime: DASHBOARD_STALE_MS,
    retry: RETRY,
    refetchOnWindowFocus: false,
  });
}

export function useDashboardRentals() {
  return useQuery({
    queryKey: queryKeys.rentalsList({ bucket: "active", page: 1 }),
    queryFn: getDashboardRentals,
    staleTime: DASHBOARD_STALE_MS,
    retry: RETRY,
    refetchOnWindowFocus: false,
  });
}

export function useDashboardFavorites() {
  return useQuery({
    queryKey: queryKeys.favoritesList({ sort: "recent", page: 1, pageSize: 4 }),
    queryFn: getDashboardFavorites,
    staleTime: DASHBOARD_STALE_MS,
    retry: RETRY,
    refetchOnWindowFocus: false,
  });
}

export function useRecommendedProducts() {
  return useQuery({
    queryKey: queryKeys.products({ sort: "recommended", pageSize: 4 }),
    queryFn: getRecommendedProducts,
    staleTime: DASHBOARD_STALE_MS,
    retry: RETRY,
    refetchOnWindowFocus: false,
  });
}

/** Admin-only view. Shares the admin workspace's single stats entry. */
export function useDashboardAdminStats() {
  return useQuery({
    queryKey: queryKeys.adminStats,
    queryFn: getDashboardAdminStats,
    staleTime: DASHBOARD_STALE_MS,
    retry: RETRY,
    refetchOnWindowFocus: false,
  });
}

/** The real cart — one shared cache entry across the drawer, the page and this section. */
export const useDashboardCart = useCartQuery;