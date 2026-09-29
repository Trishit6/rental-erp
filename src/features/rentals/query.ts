import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import {
  getRentalById,
  getRentals,
  requestRentalExtension,
  requestRentalReturn,
} from "./api";
import type { RentalsSearch } from "./components/schema";
import type { RentalExtensionRequest, RentalReturnRequest } from "./types";

/**
 * Rental queries and mutations.
 *
 * Caching choices:
 *
 *  - The list is keyed by the whole filter object, so each tab and search is its
 *    own entry and switching back is instant rather than a refetch.
 *  - `keepPreviousData` holds the current list while the next page loads, so
 *    paging does not flash a skeleton over content the customer is reading.
 *  - Detail entries are kept for the session: a rental's dates and status barely
 *    change, and the countdown is computed locally rather than by polling.
 *
 * There is **no polling**. A rental's state changes on real events (it starts,
 * the return is requested), and those are all mutations in this app that
 * invalidate the cache. A one-second poll would be a request per second for
 * information that cannot have changed that fast.
 */

const LIST_STALE_MS = 60_000;
const DETAIL_STALE_MS = 60_000;
const RENTAL_GC_MS = 30 * 60_000;

export function rentalsListQueryOptions(search: RentalsSearch) {
  return {
    queryKey: queryKeys.rentalsList(search),
    queryFn: () => getRentals(search),
    staleTime: LIST_STALE_MS,
    gcTime: RENTAL_GC_MS,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  };
}

export function useRentals(search: RentalsSearch) {
  return useQuery(rentalsListQueryOptions(search));
}

export function rentalDetailQueryOptions(rentalId: string | number) {
  return {
    queryKey: queryKeys.rental(rentalId),
    queryFn: () => getRentalById(rentalId),
    staleTime: DETAIL_STALE_MS,
    gcTime: RENTAL_GC_MS,
    // A rental that is not yours is a final answer, not a blip: retrying only
    // delays the "not found" screen.
    retry: (failureCount: number, error: unknown) => {
      const status = (error as { status?: number } | null)?.status;
      if (status === 404 || status === 403 || status === 401) return false;
      return failureCount < 2;
    },
    refetchOnWindowFocus: false,
  };
}

export function useRental(rentalId: string | number | null) {
  return useQuery({
    ...rentalDetailQueryOptions(rentalId ?? ""),
    enabled: rentalId !== null,
  });
}

/** Warm a rental's cache so opening it from the list renders instantly. */
export function prefetchRental(queryClient: QueryClient, rentalId: string | number) {
  return queryClient.prefetchQuery(rentalDetailQueryOptions(rentalId));
}

export function useRequestRentalExtension(rentalId: string | number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RentalExtensionRequest) => requestRentalExtension(rentalId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.rentals });
      void queryClient.invalidateQueries({ queryKey: queryKeys.rental(rentalId) });
    },
  });
}

export function useRequestRentalReturn(rentalId: string | number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RentalReturnRequest) => requestRentalReturn(rentalId, input),
    onSuccess: () => {
      // The rental and its list row both changed, and the parent order's rental
      // summary with it — so all three are refreshed from the cache rather than
      // by reloading the page.
      void queryClient.invalidateQueries({ queryKey: queryKeys.rentals });
      void queryClient.invalidateQueries({ queryKey: queryKeys.rental(rentalId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.orderAll });
    },
  });
}
