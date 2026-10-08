import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import {
  addAdminProductImage,
  bulkSetAdminProductStatus,
  deleteAdminProduct,
  fetchAdminAuditPage,
  fetchAdminCategories,
  fetchAdminFinance,
  fetchAdminHealth,
  fetchAdminOrdersPage,
  fetchAdminOverview,
  fetchAdminProductDetail,
  fetchAdminProductFacets,
  fetchAdminProductImageDetail,
  fetchAdminProducts,
  fetchAdminRentalsPage,
  fetchAdminReviewsPage,
  fetchAdminSellersPage,
  fetchAdminTransactionsPage,
  fetchAdminUsersPage,
  removeAdminProductImage,
  setAdminCategoryActive,
  setAdminOrderStatus,
  setAdminProductImagePrimary,
  setAdminProductStatus,
  setAdminReviewStatus,
  setAdminSellerVerified,
  setAdminUserSuspended,
  updateAdminProduct,
} from "./api";
import type {
  AdminAuditFilters,
  AdminBulkStatusInput,
  AdminOrderFilters,
  AdminProductEditInput,
  AdminRentalFilters,
  AdminReviewFilters,
  AdminSellerFilters,
  AdminTransactionFilters,
  AdminUserFilters,
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
 *
 * The public keys are invalidated too, and that is a correctness fix rather than
 * tidiness: `PAUSED` and `ARCHIVED` are both outside `PUBLIC_PRODUCT_STATUSES`, so
 * pausing a listing must remove it from Browse and from every category page. Only
 * refreshing the admin table left a paused listing sitting in the customer's cached
 * grid until a hard reload.
 */
export function useSetAdminProductStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      setAdminProductStatus(id, status),
    onSuccess: (_result, { status }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminProducts });
      void queryClient.invalidateQueries({ queryKey: queryKeys.productAll });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.categories });
      toast.success(`Listing set to ${status.toLowerCase().replace("_", " ")}.`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Couldn't update the listing.");
    },
  });
}

/**
 * The edit dialog's record.
 *
 * `enabled: id !== null` rather than a component that simply does not call the
 * hook: the dialog is mounted once and opened for different products, and a hook
 * that took `null` would need its callers to branch anyway. Fetching only for a
 * real id keeps the closed dialog from holding a request.
 */
export function useAdminProductDetail(id: number | null) {
  return useQuery({
    queryKey: [...queryKeys.adminProducts, "detail", id] as const,
    queryFn: () => fetchAdminProductDetail(id!),
    enabled: id !== null,
    // A listing's editable fields do not change under an open dialog, and this is a
    // moderation action — a background refetch mid-edit would swap the values
    // out from under the admin's cursor.
    staleTime: 30_000,
  });
}

/**
 * An administrator's correction to a listing.
 *
 * Invalidates the whole `adminProducts` prefix *and* the public product queries,
 * because an edit to a `PUBLISHED` listing changes what Browse, the category pages
 * and the product detail page return. Narrow invalidation would leave a corrected
 * price visible in the customer's cache until a hard refresh.
 *
 * The toast is written from the server's own verdict: `changed` names the fields
 * that moved, and an empty `changed` with `unchanged` reports nothing at all rather
 * than claiming a success that did not happen.
 */
export function useUpdateAdminProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: AdminProductEditInput }) =>
      updateAdminProduct(id, input),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminProducts });
      // A moderated listing's price/title/stock are cached in three other places:
      // the product-detail entry, the related-products query under the same
      // prefix, and every browse/category grid. `productAll` covers the first two
      // by prefix; `["products"]` is the literal grid prefix (`queryKeys.products`
      // is a *factory*, so it cannot be passed as a key).
      void queryClient.invalidateQueries({ queryKey: queryKeys.productAll });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.categories });
      if (result.unchanged || result.changed.length === 0) {
        toast("Nothing to change.");
        return;
      }
      toast.success(`Product updated — ${result.changed.length} field(s) saved.`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Couldn't update the product.");
    },
  });
}

/**
 * Remove a listing, or archive it when history forbids a delete.
 *
 * The outcome decides the toast *and* the invalidation: an archive only changes
 * the status, a delete removes the row, and either way the public queries have to
 * be told. The `reason` the server sends is shown in full — "archived instead of
 * deleted, because it appears on 3 order lines" is information the admin needs,
 * and paraphrasing it into a bare "Done" is how an archive gets mistaken for a
 * delete.
 */
export function useDeleteAdminProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number }) => deleteAdminProduct(id),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminProducts });
      void queryClient.invalidateQueries({ queryKey: queryKeys.productAll });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.categories });
      if (result.outcome === "archived") {
        toast.warning(result.reason);
      } else {
        toast.success("Product deleted successfully.");
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Unable to delete product.");
    },
  });
}

/**
 * One status across a selection.
 *
 * There is deliberately no bulk *delete*: deleting rows that may be referenced by
 * order history is not a reversible action, so it does not belong behind a
 * checkbox and a single click. Archiving is the same intent with an exit.
 */
export function useBulkAdminProductStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminBulkStatusInput) => bulkSetAdminProductStatus(input),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminProducts });
      void queryClient.invalidateQueries({ queryKey: queryKeys.productAll });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      const suffix =
        result.missing.length > 0
          ? ` ${result.missing.length} no longer existed and were skipped.`
          : "";
      toast.success(`${result.updated} product(s) set to ${result.status.toLowerCase()}.${suffix}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Couldn't update the selected products.");
    },
  });
}

/* ------------------------------- workspace lists ------------------------------ */

/**
 * One hook per admin section list, all following the same shape as the catalogue:
 * the filter object is the query key and (via its `*Path` builder) the request
 * string, and `keepPreviousData` holds the current rows on screen while the next
 * page loads — paging must not collapse a table the reader is mid-way through.
 *
 * Row types come from `api.ts` (which mirrors the server), so each shape is
 * declared once, next to the endpoint that produces it.
 */

export function useAdminOrders(filters: AdminOrderFilters) {
  return useQuery({
    queryKey: [...queryKeys.adminOrders, "list", filters] as const,
    queryFn: () => fetchAdminOrdersPage(filters),
    placeholderData: keepPreviousData,
  });
}

export function useAdminOrderStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => setAdminOrderStatus(id, status),
    onSuccess: (_result, { status }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminOrders });
      toast.success(`Order set to ${status.toLowerCase().replace(/_/g, " ")}.`);
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't update the order."),
  });
}

export function useAdminRentals(filters: AdminRentalFilters) {
  return useQuery({
    queryKey: [...queryKeys.adminRentals, "list", filters] as const,
    queryFn: () => fetchAdminRentalsPage(filters),
    placeholderData: keepPreviousData,
  });
}

export function useAdminWorkspaceUsers(filters: AdminUserFilters) {
  return useQuery({
    queryKey: [...queryKeys.adminUsers, "paged", filters] as const,
    queryFn: () => fetchAdminUsersPage(filters),
    placeholderData: keepPreviousData,
  });
}

export function useAdminUserSuspension() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, suspend }: { id: number; suspend: boolean }) =>
      setAdminUserSuspended(id, suspend),
    onSuccess: (_result, { suspend }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers });
      toast.success(suspend ? "Account suspended." : "Account restored.");
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't update the account."),
  });
}

export function useAdminSellersList(filters: AdminSellerFilters) {
  return useQuery({
    queryKey: [...queryKeys.adminSellers, "list", filters] as const,
    queryFn: () => fetchAdminSellersPage(filters),
    placeholderData: keepPreviousData,
  });
}

export function useAdminSellerVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, verified }: { id: number; verified: boolean }) =>
      setAdminSellerVerified(id, verified),
    onSuccess: (_result, { verified }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminSellers });
      toast.success(verified ? "Seller approved." : "Verification revoked.");
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't update the seller."),
  });
}

export function useAdminFinance() {
  return useQuery({
    queryKey: queryKeys.adminFinance,
    queryFn: fetchAdminFinance,
  });
}

export function useAdminTransactions(filters: AdminTransactionFilters) {
  return useQuery({
    queryKey: [...queryKeys.adminTransactions, "list", filters] as const,
    queryFn: () => fetchAdminTransactionsPage(filters),
    placeholderData: keepPreviousData,
  });
}

export function useAdminReviewsList(filters: AdminReviewFilters) {
  return useQuery({
    queryKey: [...queryKeys.adminReviews, "list", filters] as const,
    queryFn: () => fetchAdminReviewsPage(filters),
    placeholderData: keepPreviousData,
  });
}

export function useAdminReviewStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: "PUBLISHED" | "HIDDEN" }) =>
      setAdminReviewStatus(id, status),
    onSuccess: (_result, { status }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminReviews });
      toast.success(status === "HIDDEN" ? "Review hidden." : "Review restored.");
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't update the review."),
  });
}

export function useAdminCategories() {
  return useQuery({
    queryKey: queryKeys.adminCategories,
    queryFn: fetchAdminCategories,
    staleTime: 60_000,
  });
}

export function useAdminCategoryActiveMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      setAdminCategoryActive(id, isActive),
    onSuccess: (_result, { isActive }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminCategories });
      toast.success(isActive ? "Category restored." : "Category retired.");
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't update the category."),
  });
}

export function useAdminProductImages(page: number, pageSize: number) {
  return useQuery({
    queryKey: [...queryKeys.adminProductImages, "list", page, pageSize] as const,
    queryFn: () =>
      import("./api").then((m) =>
        m.fetchAdminPage<
          import("./api").AdminProductImageRow
        >(m.adminProductImagesPath(page, pageSize)),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useAdminProductImageDetail(productId: number | null) {
  return useQuery({
    queryKey: [...queryKeys.adminProductImages, "detail", productId] as const,
    queryFn: () => fetchAdminProductImageDetail(productId!),
    enabled: productId !== null,
  });
}

/**
 * The image drawer's three actions, sharing one invalidation rule: any successful
 * change to one product's images refreshes the section's list *and* that product's
 * detail entry, because a primary change rewrites the sort order of both.
 */
export function useAdminProductImageActions() {
  const queryClient = useQueryClient();
  const onError = (error: Error) => toast.error(error.message || "Image update failed.");

  const add = useMutation({
    mutationFn: (input: {
      productId: number;
      url: string;
      altText?: string;
      makePrimary?: boolean;
    }) => addAdminProductImage(input.productId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminProductImages });
      toast.success("Image attached.");
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (imageId: number) => removeAdminProductImage(imageId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminProductImages });
      toast.success("Image removed.");
    },
    onError,
  });
  const primary = useMutation({
    mutationFn: (imageId: number) => setAdminProductImagePrimary(imageId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminProductImages });
      toast.success("Primary image updated.");
    },
    onError,
  });

  return {
    addImage: add.mutateAsync,
    removeImage: remove.mutateAsync,
    setPrimary: primary.mutateAsync,
    isPending: add.isPending || remove.isPending || primary.isPending,
  };
}

export function useAdminAuditLog(filters: AdminAuditFilters) {
  return useQuery({
    queryKey: [...queryKeys.adminAuditLog, "list", filters] as const,
    queryFn: () => fetchAdminAuditPage(filters),
    placeholderData: keepPreviousData,
  });
}

/**
 * The `/api/health` probe behind the dashboard's system-status card.
 *
 * Short-lived on purpose: the card answers "is the application up right now", so a
 * stale success is as misleading as a stale failure. When the fetch fails the query
 * is an error and the card reports the component as unavailable — it never invents
 * a "connected" for a call that did not happen.
 */
export function useAdminHealth() {
  return useQuery({
    queryKey: queryKeys.adminHealth,
    queryFn: fetchAdminHealth,
    staleTime: 15_000,
    retry: 1,
  });
}

/**
 * The `q` the admin topbar search navigated here with.
 *
 * The topbar search is a routing handoff, not a result engine: it sends the term to
 * a module page as `?q=`, and this reads it back. Pages seed their filter state from
 * it once and keep it in sync while the param changes, so "search for `nikon`" from
 * the topbar lands on a catalogue already searching for `nikon`.
 *
 * `strict: false` keeps the read working on every admin module without each route
 * declaring a shared search schema — the routes only define `q` so navigation
 * type-checks, and this is the loose side of the same contract.
 */
export function useAdminModuleSearch(): string {
  const search = useSearch({ strict: false });
  const q = (search as { q?: unknown }).q;
  return typeof q === "string" ? q : "";
}

/**
 * A list page's filter state, seeded from the topbar search's `?q=` handoff.
 *
 * The page's filter object is still the single source of truth — this only wraps its
 * `useState` so the search box starts with the term the topbar carried, and follows
 * the param if it changes while the page is open (a second search from the topbar
 * lands on the same page with a new term). Changing the search resets to page 1,
 * because page 4 of the previous query is not a page of the new one.
 */
export function useAdminSearchFilters<T extends { search: string; page: number }>(empty: T) {
  const q = useAdminModuleSearch();
  const [seededQ, setSeededQ] = useState(q);
  const [filters, setFilters] = useState<T>(() => ({ ...empty, search: q }));

  // The topbar-search handoff: if `q` changes while this page is mounted (a second
  // search from the bar), re-seed the filter's search. This is React's documented
  // "adjust state when a prop changes" pattern — a render-phase update, not an
  // effect — because it converges in one render and costs no extra paint.
  if (q !== seededQ) {
    setSeededQ(q);
    setFilters((current) => ({ ...current, search: q, page: 1 }));
  }

  return [filters, setFilters] as const;
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

/**
 * The moderation queue's account list.
 *
 * This hits the *same* endpoint as `useAdminWorkspaceUsers` — the server's
 * `/admin/users` is paged and carries per-account order/rental counts, so the
 * moderation tab asks for the largest page it is allowed rather than pretending there
 * is a second, unpaged endpoint. `pageSize=60` is the schema's ceiling.
 *
 * The full searchable directory is `/admin/users`; this is the short "an account in
 * this queue needs a decision" list, which is why it is not paged here.
 */
export function useAdminUsers(enabled: boolean) {
  return useQuery({
    queryKey: [...queryKeys.adminUsers, "moderation"],
    queryFn: async () => (await api.get<AdminUser[]>("/admin/users?pageSize=60")).data,
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
