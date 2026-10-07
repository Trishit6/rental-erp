import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query/keys";
import {
  becomeSeller,
  fetchOwnSellerProfile,
  fetchPublicSeller,
  fetchSellerAnalytics,
  fetchSellerEarnings,
  fetchSellerStatus,
  fetchSellerSummary,
  fetchSellerTransactions,
  updateOwnSellerProfile,
} from "./api";
import type { AnalyticsParams, OnboardingPayload } from "./types";

/**
 * Seller workspace queries and mutations.
 *
 * ## What gets refreshed after an onboarding
 *
 * Onboarding is the one seller write that changes *authorization*, so it
 * invalidates more than its own key. In order:
 *
 *  1. `queryKeys.auth` (`["auth", "me"]`) — the session's `role` changed, and the nav, the guards
 *     and the "Become a seller" prompt all read it. Invalidating this last is
 *     what makes the redirect to the dashboard land on a dashboard that knows you
 *     are a seller rather than one that bounces you back to onboarding.
 *  2. `queryKeys.sellerOnboarding` — the status flag.
 *  3. The whole `queryKeys.sellerMe` prefix — summary, analytics and listings are
 *     all empty-then-populated for a brand-new seller.
 *
 * The public shopfront key (`queryKeys.seller(id)`) is deliberately **not**
 * touched: it is cached across sessions because it is public, and the seller who
 * just onboards was, seconds ago, a customer browsing somebody else's shopfront.
 */

/* ------------------------------- onboarding ------------------------------- */

/**
 * Whether the viewer is a seller, and what their shopfront says.
 *
 * Deliberately *not* gated behind `requireSeller` on the client, because the
 * question has to be answerable before onboarding — that is what lets
 * `/seller/become-a-seller` show the current profile rather than a blank form.
 * The server gates it on `requireUser` for the same reason.
 */
export function useSellerStatus() {
  return useQuery({
    queryKey: queryKeys.sellerOnboarding,
    queryFn: fetchSellerStatus,
    // The answer is true until the role changes, which happens through the
    // mutation below — so it is cached long and invalidated, never polled.
    staleTime: 5 * 60_000,
  });
}

export function useBecomeSeller() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: OnboardingPayload) => becomeSeller(payload),
    onSuccess: async () => {
      await Promise.all([
        // Last, deliberately: see the note above.
        queryClient.invalidateQueries({ queryKey: queryKeys.auth }),
        queryClient.invalidateQueries({ queryKey: queryKeys.sellerOnboarding }),
        queryClient.invalidateQueries({ queryKey: queryKeys.sellerMe }),
      ]);
      toast.success("You're a seller. Add your first listing whenever you're ready.");
    },
  });
}

/* --------------------------------- summary -------------------------------- */

export function useSellerSummary() {
  return useQuery({
    queryKey: queryKeys.sellerSummary,
    queryFn: fetchSellerSummary,
  });
}

/* -------------------------------- analytics ------------------------------- */

/**
 * `period` is part of the key, so switching from 30 days to 90 days is a
 * different cache entry rather than a refetch that overwrites the window the
 * seller was reading. `metric` is too: "top by earnings" and "top by rating" are
 * two different orderings of the same rows, and merging them would show one
 * under the other's heading.
 */
export function useSellerAnalytics(params: AnalyticsParams) {
  return useQuery({
    queryKey: queryKeys.sellerAnalytics(params as unknown as Record<string, unknown>),
    queryFn: () => fetchSellerAnalytics(params),
    placeholderData: (previous) => previous,
  });
}

/* -------------------------------- earnings -------------------------------- */

export function useSellerEarnings() {
  return useQuery({
    queryKey: queryKeys.earnings,
    queryFn: fetchSellerEarnings,
  });
}

export function useSellerTransactions() {
  return useQuery({
    queryKey: queryKeys.transactions,
    queryFn: fetchSellerTransactions,
  });
}

/* --------------------------------- profile -------------------------------- */

export function useOwnSellerProfile() {
  return useQuery({
    queryKey: queryKeys.sellerProfile,
    queryFn: fetchOwnSellerProfile,
  });
}

/**
 * Save the shopfront.
 *
 * The public key is invalidated on success because the bio is on the seller's
 * public page — leaving the stale copy in cache means the seller fixes a typo,
 * sees the confirmation, and still reads the old text on their own shopfront.
 */
export function useUpdateSellerProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      bio?: string | null;
      location?: string | null;
      responseRateHours?: number | null;
    }) => updateOwnSellerProfile(payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.sellerProfile }),
        queryClient.invalidateQueries({ queryKey: queryKeys.sellerOnboarding }),
        // The bio is on the public shopfront. Invalidating the public prefix is
        // what stops a seller fixing a typo, seeing the confirmation, and still
        // reading the old text on their own page.
        queryClient.invalidateQueries({ queryKey: queryKeys.sellerPublic }),
      ]);
      toast.success("Shopfront updated.");
    },
  });
}

/**
 * Somebody else's shopfront.
 *
 * Cached hard and **never** evicted: it is public data with no private content,
 * so it belongs to the same category as the product catalogue. The long
 * `staleTime` also means clicking through ten listings does not re-fetch ten
 * seller profiles.
 */
export function usePublicSeller(id: number) {
  return useQuery({
    queryKey: queryKeys.seller(id),
    queryFn: () => fetchPublicSeller(id),
    enabled: Number.isFinite(id) && id > 0,
    staleTime: 5 * 60_000,
  });
}
