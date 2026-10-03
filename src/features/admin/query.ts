import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import {
  fetchAdminOverview,
  fetchAdminProductFacets,
  fetchAdminProducts,
  setAdminProductStatus,
} from "./api";
import type { AdminProductFilters } from "./types";

/**
 * The catalogue's cache key.
 *
 * Built from `queryKeys.adminProducts` rather than spelled out, so this feature
 * cannot drift away from the prefix the rest of the app invalidates. Every distinct
 * filter/sort/page is a separate entry — sharing one would let a filtered page
 * overwrite the unfiltered first page and show stale rows after a filter change.
 */
export function adminProductListKey(filters: AdminProductFilters) {
  return [...queryKeys.adminProducts, "list", filters] as const;
}

export function useAdminOverview() {
  return useQuery({
    queryKey: queryKeys.adminStats,
    queryFn: fetchAdminOverview,
  });
}

export function useAdminProductFacets() {
  return useQuery({
    queryKey: queryKeys.adminProductFacets,
    queryFn: fetchAdminProductFacets,
    // The seller and category lists only change when someone onboards or a category
    // is renamed, so they outlive any filter change and are shared by every page.
    staleTime: 5 * 60_000,
  });
}

export function useAdminProducts(filters: AdminProductFilters) {
  return useQuery({
    queryKey: adminProductListKey(filters),
    queryFn: () => fetchAdminProducts(filters),
    // Keeps the previous page on screen while the next one loads, so paging and
    // sorting do not collapse the table into a skeleton and lose the reader's place.
    placeholderData: keepPreviousData,
  });
}

/**
 * Status changes for the catalogue.
 *
 * Invalidates by prefix rather than by exact key, because the row that changed may
 * be on any page of any filter combination — every one of those cached pages now
 * disagrees with the database. Narrow invalidation would leave the old status
 * visible in the cached pages the administrator then navigates back to.
 */
export function useSetAdminProductStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      setAdminProductStatus(id, status),
    onSuccess: (_result, { status }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminProducts });
      toast.success(`Listing set to ${status.toLowerCase().replace("_", " ")}.`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Couldn't update the listing.");
    },
  });
}

/* ---------------------- moderation (users, reports, reviews) ------------------ */

export type AdminStats = {
  users: number;
  products: number;
  orders: number;
  rentals: number;
  reviews: number;
  openReports: number;
  grossVolume: number;
};

export type AdminUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  verified: boolean;
};

export type AdminReport = {
  id: number;
  reason: string;
  details: string | null;
  status: string;
};

export function useAdminUsers(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.adminUsers,
    queryFn: async () => (await api.get<AdminUser[]>("/admin/users")).data,
    enabled,
  });
}

export function useAdminReports(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.adminReports,
    queryFn: async () => (await api.get<AdminReport[]>("/admin/reports")).data,
    enabled,
  });
}

export function useAdminActions() {
  const queryClient = useQueryClient();
  return {
    async suspendUser(id: number, suspend: boolean) {
      await api.patch(`/admin/users/${id}/${suspend ? "suspend" : "unsuspend"}`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers });
      toast.success(suspend ? "User suspended" : "User restored");
    },
    async resolveReport(id: number, status: string) {
      await api.patch(`/admin/reports/${id}`, { status });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminReports });
    },
  };
}
