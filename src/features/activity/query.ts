import { useQuery, type QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import { getActivity } from "./api";
import type { ActivityFilters } from "./types";

/**
 * The activity timeline's query.
 *
 * ## Cached hard, because it is derived
 *
 * Unlike the orders list it mirrors, this entry changes only when one of the underlying
 * facts changes — an order is placed, a rental is returned, a review is written. There
 * is no "something new might have happened" event here the way there is for a message,
 * so the page is stale after 60s and is not polled. Refetching an assembled timeline
 * every ten seconds would be a great deal of database work to re-derive an answer that
 * has not moved, which is the argument for deriving at all.
 */

/** How long the timeline stays fresh. */
export const ACTIVITY_STALE_MS = 60_000;

export function useActivity(filters: ActivityFilters = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.activityList(filters),
    queryFn: () => getActivity(filters),
    enabled,
    staleTime: ACTIVITY_STALE_MS,
    // The previous page is held while a new filter loads, so switching chips does not
    // blank the list — the rows are history, and history does not change because the
    // user is looking at a different slice of it.
    placeholderData: (previous) => previous,
  });
}

/**
 * Warm a page before the user asks for it.
 *
 * Takes a `QueryClient` rather than reaching for one internally, because this has to be
 * callable from an event handler (`onMouseEnter` on a pager button) where a hook could
 * not be. Same shape as `usePrefetchProductReviews` in the reviews feature.
 */
export function prefetchActivity(
  queryClient: QueryClient,
  filters: ActivityFilters,
): void {
  void queryClient.prefetchQuery({
    queryKey: queryKeys.activityList(filters),
    queryFn: () => getActivity(filters),
    staleTime: ACTIVITY_STALE_MS,
  });
}