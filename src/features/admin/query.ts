import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import {
  addAdminProductImage,
  bulkSetAdminProductStatus,
  createAdminRole,
  deleteAdminProduct,
  deleteAdminRole,
  fetchAdminAuditPage,
  fetchAdminCategories,
  fetchAdminFinance,
  fetchAdminHealth,
  fetchAdminMe,
  fetchAdminOrdersPage,
  fetchAdminOverview,
  fetchAdminPermissions,
  fetchAdminPage,
  adminProductImagesPath,
  fetchAdminProductDetail,
  fetchAdminProductFacets,
  fetchAdminProductImageDetail,
  fetchAdminProducts,
  fetchAdminRentalsPage,
  fetchAdminReviewsPage,
  fetchAdminRoles,
  fetchAdminSellersPage,
  fetchAdminTransactionsPage,
  fetchAdminUserRoles,
  fetchAdminUsersPage,
  removeAdminProductImage,
  setAdminCategoryActive,
  setAdminOrderStatus,
  setAdminProductImagePrimary,
  setAdminProductStatus,
  setAdminReviewStatus,
  setAdminSellerVerified,
  setAdminUserRoles,
  setAdminUserSuspended,
  updateAdminProduct,
  updateAdminRole,
} from "./api";
// PROMPT 26 additions: catalogue bulk moves, category CRUD and the CMS.
import {
  bulkDeleteAdminProducts,
  bulkMoveAdminProducts,
  createAdminBanner,
  createAdminCategory,
  deleteAdminBanner,
  deleteAdminBlock,
  deleteAdminCategory,
  fetchAdminBanners,
  fetchAdminBlock,
  fetchAdminBlocks,
  fetchAdminCmsCatalogue,
  fetchAdminCmsVersions,
  fetchAdminProductRelations,
  reorderAdminBanners,
  reorderAdminCategories,
  saveAdminBlock,
  setAdminBlockStatus,
  updateAdminBanner,
  updateAdminCategory,
} from "./api";
// PROMPT 27 additions: the order, rental and dispute desks, and order health.
import {
  addAdminOrderNote,
  cancelAdminOrder,
  confirmAdminRentalReturn,
  decideAdminDispute,
  decideAdminRentalExtension,
  fetchAdminDisputeDetail,
  fetchAdminDisputesPage,
  fetchAdminOrderDetail,
  fetchAdminOrderHealth,
  fetchAdminRentalDetail,
  forceAdminRentalStatus,
  overrideAdminOrderStatus,
  requestAdminOrderRefund,
  settleAdminRentalDeposit,
} from "./api";
// PROMPT 28 additions: refund decisions, transaction evidence and the finance reports.
import {
  decideAdminRefund,
  fetchAdminReconciliation,
  fetchAdminRefundDetail,
  fetchAdminRefundsPage,
  fetchAdminRevenue,
  fetchAdminTransactionDetail,
} from "./api";
// PROMPT 29 additions: the moderation queue, its decisions and the flag-word list.
import {
  bulkDecideAdminModeration,
  decideAdminModeration,
  fetchAdminFlagWords,
  fetchAdminModerationReportDetail,
  fetchAdminModerationReports,
  setAdminFlagWords,
} from "./api";
// PROMPT 30 additions: the support inbox.
import {
  fetchAdminSupportTicket,
  fetchAdminSupportTickets,
  replyAdminSupportTicket,
  updateAdminSupportTicket,
} from "./api";
// PROMPT 31 additions: the coupon desk.
import {
  createAdminCoupon,
  deleteAdminCoupon,
  fetchAdminCouponDetail,
  fetchAdminCoupons,
  setAdminCouponStatus,
  updateAdminCoupon,
} from "./api";
import type {
  AdminProductImageRow,
  AdminAuditFilters,
  AdminBulkStatusInput,
  AdminDisputeFilters,
  AdminModerationFilters,
  AdminOrderFilters,
  AdminProductEditInput,
  AdminRefundFilters,
  AdminRentalFilters,
  AdminReviewFilters,
  AdminRoleUpdateInput,
  AdminRoleWriteInput,
  AdminSellerFilters,
  AdminSupportFilters,
  AdminSupportTicketUpdate,
  AdminTransactionFilters,
  AdminUserFilters,
  AdminBannerWriteInput,
  AdminCategoryWriteInput,
  AdminCouponFilters,
  AdminCouponStatus,
  AdminCouponWriteInput,
  ModerationAction,
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

/**
 * The signed-in staff member's roles and permissions (PROMPT 22).
 *
 * Read once per staff session and cached for five minutes: grants change only when
 * an administrator edits them, and the role editor invalidates this key when it
 * does. The sidebar filters on it and the role editor's preview renders against it,
 * so it is deliberately separate from the `adminRbac` role listing (the caller's own
 * access is not a role table).
 */
export function useAdminAccess() {
  return useQuery({
    queryKey: queryKeys.adminMe,
    queryFn: fetchAdminMe,
    staleTime: 5 * 60_000,
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
    onSuccess: (_result, { id, status }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminOrders });
      // The open detail panel and the health panel both read this order, so both
      // have to hear about the move — otherwise the timeline below the buttons
      // describes a status the badge above them disagrees with.
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.adminOrders, "detail", id] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminOrderHealth });
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
    mutationFn: ({ id, suspend, reason }: { id: number; suspend: boolean; reason: string }) =>
      setAdminUserSuspended(id, suspend, reason),
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
    queryFn: () => fetchAdminPage<AdminProductImageRow>(adminProductImagesPath(page, pageSize)),
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
 * The role listing and permission vocabulary (PROMPT 22's role editor).
 *
 * Cached under `adminRbac`, which every grant/revoke mutation invalidates. The two
 * are fetched together because the editor renders the matrix from the vocabulary and
 * the checkmarks from the listing; a stale half of that pair draws the wrong picture.
 */
export function useAdminRoles(enabled = true) {
  return useQuery({
    queryKey: [...queryKeys.adminRbac, "roles"] as const,
    queryFn: fetchAdminRoles,
    enabled,
  });
}

export function useAdminPermissions(enabled = true) {
  return useQuery({
    queryKey: [...queryKeys.adminRbac, "permissions"] as const,
    queryFn: fetchAdminPermissions,
    // The vocabulary changes only when the server's catalogue changes (a deploy).
    staleTime: 30 * 60_000,
    enabled,
  });
}

export function useAdminUserRoles(userId: number | null) {
  return useQuery({
    queryKey: [...queryKeys.adminRbac, "user-roles", userId] as const,
    queryFn: () => fetchAdminUserRoles(userId as number),
    enabled: userId !== null,
  });
}

/**
 * Role editor mutations.
 *
 * Every one invalidates `adminRbac` (the role table changed) and `adminMe` (if the
 * caller's own grants were involved, the sidebar must re-filter). The server is
 * still the authority; this only keeps the screen honest without a manual reload.
 */
export function useAdminRoleMutations() {
  const queryClient = useQueryClient();

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.adminRbac });
    void queryClient.invalidateQueries({ queryKey: queryKeys.adminMe });
  }

  const create = useMutation({
    mutationFn: (input: AdminRoleWriteInput) => createAdminRole(input),
    onSuccess: (role) => {
      invalidate();
      toast.success(`Role ${role.name} created.`);
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't create the role."),
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: number; input: AdminRoleUpdateInput }) =>
      updateAdminRole(id, input),
    onSuccess: () => {
      invalidate();
      toast.success("Role updated.");
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't update the role."),
  });

  const remove = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => deleteAdminRole(id, reason),
    onSuccess: () => {
      invalidate();
      toast.success("Role deleted.");
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't delete the role."),
  });

  const setRoles = useMutation({
    mutationFn: ({
      userId,
      roles,
      reason,
    }: {
      userId: number;
      roles: string[];
      reason: string;
    }) => setAdminUserRoles(userId, roles, reason),
    onSuccess: (_result, { userId }) => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.adminRbac, "user-roles", userId] });
      toast.success("Roles updated.");
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't update the roles."),
  });

  return {
    create: create.mutateAsync,
    update: update.mutateAsync,
    remove: remove.mutateAsync,
    setRoles: setRoles.mutateAsync,
    isPending: create.isPending || update.isPending || remove.isPending || setRoles.isPending,
  };
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

export function useAdminActions() {
  const queryClient = useQueryClient();
  return {
    async suspendUser(id: number, suspend: boolean, reason: string) {
      await api.patch(`/admin/users/${id}/status`, {
        status: suspend ? "SUSPENDED" : "ACTIVE",
        reason,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers });
      toast.success(suspend ? "User suspended" : "User restored");
    },
  };
}

/* ------------------- PROMPT 26: catalogue bulk writes ------------------------ */

/** Move selected listings into one category. */
export function useBulkAdminProductCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, categoryId }: { ids: number[]; categoryId: number }) =>
      bulkMoveAdminProducts(ids, categoryId),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminProducts });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminProductFacets });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminCategories });
      void queryClient.invalidateQueries({ queryKey: queryKeys.categories });
      void queryClient.invalidateQueries({ queryKey: queryKeys.productAll });
      toast.success(`Moved ${result.updated} listing(s).`);
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't move the listings."),
  });
}

/**
 * Delete selected listings. The server archives any row that order history
 * protects, so the toast reports both numbers — "deleted" alone would imply
 * something was removed that still exists.
 */
export function useBulkDeleteAdminProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, reason }: { ids: number[]; reason: string }) =>
      bulkDeleteAdminProducts(ids, reason),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminProducts });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminProductFacets });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminCategories });
      void queryClient.invalidateQueries({ queryKey: queryKeys.productAll });
      const archived =
        result.archived > 0 ? ` ${result.archived} archived (order history kept).` : "";
      toast.success(`Deleted ${result.deleted} listing(s).${archived}`);
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't delete the listings."),
  });
}

export function useAdminProductRelations(id: number | null) {
  return useQuery({
    queryKey: [...queryKeys.adminProducts, "relations", id] as const,
    queryFn: () => fetchAdminProductRelations(id as number),
    enabled: id !== null,
    staleTime: 30_000,
  });
}

/* -------------------------- category CRUD ------------------------------------ */

export function useCreateAdminCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminCategoryWriteInput) => createAdminCategory(input),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminCategories });
      void queryClient.invalidateQueries({ queryKey: queryKeys.categories });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminProductFacets });
      toast.success(`Created "${created.name}".`);
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't create the category."),
  });
}

export function useUpdateAdminCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<AdminCategoryWriteInput> }) =>
      updateAdminCategory(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminCategories });
      void queryClient.invalidateQueries({ queryKey: queryKeys.categories });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminProductFacets });
      toast.success("Category updated.");
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't update the category."),
  });
}

export function useDeleteAdminCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason, reassignToId }: { id: number; reason: string; reassignToId?: number }) =>
      deleteAdminCategory(id, { reason, reassignToId }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminCategories });
      void queryClient.invalidateQueries({ queryKey: queryKeys.categories });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminProducts });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminProductFacets });
      const moved = result.reassigned > 0 ? ` Moved ${result.reassigned} listing(s).` : "";
      toast.success(`Category deleted.${moved}`);
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't delete the category."),
  });
}

export function useReorderAdminCategories() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => reorderAdminCategories(ids),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminCategories });
      void queryClient.invalidateQueries({ queryKey: queryKeys.categories });
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't reorder the categories."),
  });
}

/* -------------------------------- CMS ---------------------------------------- */

export function useAdminCmsCatalogue() {
  return useQuery({
    queryKey: [...queryKeys.adminCms, "catalogue"] as const,
    queryFn: fetchAdminCmsCatalogue,
    staleTime: 5 * 60_000,
  });
}

export function useAdminBanners() {
  return useQuery({
    queryKey: [...queryKeys.adminCms, "banners"] as const,
    queryFn: fetchAdminBanners,
    staleTime: 30_000,
  });
}

/** Every CMS write invalidates `["cms"]` so the storefront picks the change up. */
function invalidateCms(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.adminCms });
  void queryClient.invalidateQueries({ queryKey: queryKeys.cms });
}

export function useCreateAdminBanner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminBannerWriteInput) => createAdminBanner(input),
    onSuccess: () => {
      invalidateCms(queryClient);
      toast.success("Banner created.");
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't create the banner."),
  });
}

export function useUpdateAdminBanner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<AdminBannerWriteInput> }) =>
      updateAdminBanner(id, input),
    onSuccess: () => {
      invalidateCms(queryClient);
      toast.success("Banner updated.");
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't update the banner."),
  });
}

export function useDeleteAdminBanner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      deleteAdminBanner(id, reason),
    onSuccess: () => {
      invalidateCms(queryClient);
      toast.success("Banner deleted.");
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't delete the banner."),
  });
}

export function useReorderAdminBanners() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ placement, ids }: { placement: string; ids: number[] }) =>
      reorderAdminBanners(placement, ids),
    onSuccess: () => invalidateCms(queryClient),
    onError: (error: Error) => toast.error(error.message || "Couldn't reorder the banners."),
  });
}

export function useAdminBlocks() {
  return useQuery({
    queryKey: [...queryKeys.adminCms, "blocks"] as const,
    queryFn: fetchAdminBlocks,
    staleTime: 30_000,
  });
}

export function useAdminBlock(key: string | null) {
  return useQuery({
    queryKey: [...queryKeys.adminCms, "block", key] as const,
    queryFn: () => fetchAdminBlock(key as string),
    enabled: key !== null,
  });
}

export function useSaveAdminBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      key,
      content,
      status,
    }: {
      key: string;
      content: Record<string, unknown>;
      status?: "DRAFT" | "PUBLISHED";
    }) => saveAdminBlock(key, { content, status }),
    onSuccess: () => {
      invalidateCms(queryClient);
      toast.success("Block saved.");
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't save the block."),
  });
}

export function useSetAdminBlockStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, status }: { key: string; status: "DRAFT" | "PUBLISHED" }) =>
      setAdminBlockStatus(key, status),
    onSuccess: (_result, { status }) => {
      invalidateCms(queryClient);
      toast.success(status === "PUBLISHED" ? "Block published." : "Block unpublished.");
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't change the block status."),
  });
}

export function useDeleteAdminBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, reason }: { key: string; reason: string }) => deleteAdminBlock(key, reason),
    onSuccess: () => {
      invalidateCms(queryClient);
      toast.success("Block deleted.");
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't delete the block."),
  });
}

export function useAdminCmsVersions(
  entityType: "cms_block" | "cms_banner",
  id: number | null,
) {
  return useQuery({
    queryKey: [...queryKeys.adminCms, "versions", entityType, id] as const,
    queryFn: () => fetchAdminCmsVersions(entityType, id as number),
    enabled: id !== null,
  });
}

/* ---------------------- PROMPT 27: orders, rentals, disputes ------------------- */

export function adminOrderDetailKey(id: number) {
  return [...queryKeys.adminOrders, "detail", id] as const;
}

export function adminRentalDetailKey(id: number) {
  return [...queryKeys.adminRentals, "detail", id] as const;
}

export function adminDisputeDetailKey(id: number) {
  return [...queryKeys.adminDisputes, "detail", id] as const;
}

/**
 * The full order view. `staleTime` is short — the detail screen carries buttons
 * that change the record, so treating it as long-lived would let an action's own
 * result be masked by a stale read.
 */
export function useAdminOrderDetail(id: number | null) {
  return useQuery({
    queryKey: adminOrderDetailKey(id ?? 0),
    queryFn: () => fetchAdminOrderDetail(id as number),
    enabled: id !== null,
    staleTime: 0,
  });
}

/**
 * The order desk's write actions.
 *
 * Every one invalidates the order's own list prefix (a status change reorders the
 * table), the health panel (a stuck order stops being stuck once moved) and the
 * transaction list (a refund request adds a payment-shaped row). Grouping them into
 * one hook keeps that rule in a single place rather than repeated per button.
 */
export function useAdminOrderActions() {
  const queryClient = useQueryClient();

  function invalidateOrder(id: number) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.adminOrders });
    void queryClient.invalidateQueries({ queryKey: adminOrderDetailKey(id) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.adminOrderHealth });
    void queryClient.invalidateQueries({ queryKey: queryKeys.adminTransactions });
  }

  const onError = (error: Error) => toast.error(error.message || "Couldn't update the order.");

  const note = useMutation({
    mutationFn: ({ id, note: text }: { id: number; note: string }) =>
      addAdminOrderNote(id, text),
    onSuccess: (_result, { id }) => {
      invalidateOrder(id);
      toast.success("Note added to the timeline.");
    },
    onError,
  });

  const override = useMutation({
    mutationFn: ({ id, status, reason }: { id: number; status: string; reason: string }) =>
      overrideAdminOrderStatus(id, status, reason),
    onSuccess: (_result, { id }) => {
      invalidateOrder(id);
      toast.success("Order status overridden.");
    },
    onError,
  });

  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => cancelAdminOrder(id, reason),
    onSuccess: (_result, { id }) => {
      invalidateOrder(id);
      toast.success("Order cancelled.");
    },
    onError,
  });

  const refund = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: number;
      input: { amount: number; reason: string; orderItemId?: number | null };
    }) => requestAdminOrderRefund(id, input),
    onSuccess: (result, { id }) => {
      invalidateOrder(id);
      toast.success(
        result.duplicate
          ? `Refund ${result.refundNumber} was already requested.`
          : `Refund ${result.refundNumber} requested.`,
      );
    },
    onError,
  });

  return {
    addNote: note.mutateAsync,
    override: override.mutateAsync,
    cancel: cancel.mutateAsync,
    requestRefund: refund.mutateAsync,
    isPending: note.isPending || override.isPending || cancel.isPending || refund.isPending,
  };
}

export function useAdminOrderHealth() {
  return useQuery({
    queryKey: queryKeys.adminOrderHealth,
    queryFn: fetchAdminOrderHealth,
    // Operational, like the health probe: a stale "nothing is stuck" is exactly the
    // reassurance that hides the problem.
    staleTime: 20_000,
  });
}

export function useAdminRentalDetail(id: number | null) {
  return useQuery({
    queryKey: adminRentalDetailKey(id ?? 0),
    queryFn: () => fetchAdminRentalDetail(id as number),
    enabled: id !== null,
    staleTime: 0,
  });
}

export function useAdminRentalActions() {
  const queryClient = useQueryClient();

  function invalidateRental(id: number) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.adminRentals });
    void queryClient.invalidateQueries({ queryKey: adminRentalDetailKey(id) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.adminOrderHealth });
    void queryClient.invalidateQueries({ queryKey: queryKeys.adminTransactions });
  }

  const onError = (error: Error) => toast.error(error.message || "Couldn't update the rental.");

  const force = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      forceAdminRentalStatus(id, status),
    onSuccess: (_result, { id }) => {
      invalidateRental(id);
      toast.success("Rental status updated.");
    },
    onError,
  });

  const confirmReturn = useMutation({
    mutationFn: (id: number) => confirmAdminRentalReturn(id),
    onSuccess: (_result, id) => {
      invalidateRental(id);
      toast.success("Return confirmed.");
    },
    onError,
  });

  const settleDeposit = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: number;
      input: { deduction: number; reason: string };
    }) => settleAdminRentalDeposit(id, input),
    onSuccess: (result, { id }) => {
      invalidateRental(id);
      toast.success(
        result.deduction > 0
          ? `Deposit settled — released ₹${(result.released / 100).toFixed(2)}.`
          : "Deposit released in full.",
      );
    },
    onError,
  });

  const decideExtension = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: number;
      input: { decision: "APPROVE" | "REJECT"; days?: number; reason: string };
    }) => decideAdminRentalExtension(id, input),
    onSuccess: (_result, { id, input }) => {
      invalidateRental(id);
      toast.success(input.decision === "APPROVE" ? "Extension approved." : "Extension declined.");
    },
    onError,
  });

  return {
    forceStatus: force.mutateAsync,
    confirmReturn: confirmReturn.mutateAsync,
    settleDeposit: settleDeposit.mutateAsync,
    decideExtension: decideExtension.mutateAsync,
    isPending:
      force.isPending ||
      confirmReturn.isPending ||
      settleDeposit.isPending ||
      decideExtension.isPending,
  };
}

export function useAdminDisputes(filters: AdminDisputeFilters) {
  return useQuery({
    queryKey: [...queryKeys.adminDisputes, "list", filters] as const,
    queryFn: () => fetchAdminDisputesPage(filters),
    placeholderData: keepPreviousData,
  });
}

export function useAdminDisputeDetail(id: number | null) {
  return useQuery({
    queryKey: adminDisputeDetailKey(id ?? 0),
    queryFn: () => fetchAdminDisputeDetail(id as number),
    enabled: id !== null,
  });
}

export function useAdminDisputeDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: number;
      input: {
        status: "UNDER_REVIEW" | "RESOLVED" | "DISMISSED";
        resolution: string;
        refund?: { amount: number; reason: string; idempotencyKey?: string | null } | null;
      };
    }) => decideAdminDispute(id, input),
    onSuccess: (_result, { id }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminDisputes });
      void queryClient.invalidateQueries({ queryKey: adminDisputeDetailKey(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminOrders });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminOrderHealth });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminTransactions });
      toast.success("Dispute decision recorded; both parties notified.");
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't record the decision."),
  });
}

/* ---------------------- PROMPT 28: refunds and finance reports ---------------- */

export function adminRefundDetailKey(id: number) {
  return [...queryKeys.adminRefunds, "detail", id] as const;
}

export function adminTransactionDetailKey(id: number) {
  return [...queryKeys.adminTransactions, "detail", id] as const;
}

export function useAdminRefunds(filters: AdminRefundFilters) {
  return useQuery({
    queryKey: [...queryKeys.adminRefunds, "list", filters] as const,
    queryFn: () => fetchAdminRefundsPage(filters),
    placeholderData: keepPreviousData,
  });
}

export function useAdminRefundDetail(id: number | null) {
  return useQuery({
    queryKey: adminRefundDetailKey(id ?? 0),
    queryFn: () => fetchAdminRefundDetail(id as number),
    enabled: id !== null,
    // A decided refund is final, but an open one is the thing this screen exists to
    // act on, so freshness beats caching here.
    staleTime: 0,
  });
}

/** One payment with its archived provider events — read from the payments table. */
export function useAdminTransactionDetail(id: number | null) {
  return useQuery({
    queryKey: adminTransactionDetailKey(id ?? 0),
    queryFn: () => fetchAdminTransactionDetail(id as number),
    enabled: id !== null,
  });
}

/**
 * Approving or rejecting a refund moves money, so it invalidates more than its own
 * queue: the ledger gains a row, the order's payment status changes, and both the
 * revenue report and the reconciliation view stop being true.
 */
export function useAdminRefundDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: number;
      input: { decision: "APPROVE" | "REJECT"; providerReference?: string | null; reason: string };
    }) => decideAdminRefund(id, input),
    onSuccess: (result, { id, input }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminRefunds });
      void queryClient.invalidateQueries({ queryKey: adminRefundDetailKey(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminTransactions });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminOrders });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminFinance });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminRevenue });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminReconciliation });
      toast.success(
        input.decision === "APPROVE"
          ? `Refund ${result.refundNumber} ${result.status === "SUCCEEDED" ? "was returned" : `is ${result.status.toLowerCase()}`}.`
          : `Refund ${result.refundNumber} declined.`,
      );
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't record the refund decision."),
  });
}

export function useAdminRevenue() {
  return useQuery({
    queryKey: queryKeys.adminRevenue,
    queryFn: fetchAdminRevenue,
  });
}

export function useAdminReconciliation() {
  return useQuery({
    queryKey: queryKeys.adminReconciliation,
    queryFn: fetchAdminReconciliation,
    // Reconciliation is a "right now" claim; a cached clean bill of health is exactly
    // the answer that must not be trusted twice.
    staleTime: 15_000,
  });
}

/* ---------------------------- PROMPT 29: moderation -------------------------- */

export function adminModerationDetailKey(id: number) {
  return [...queryKeys.adminModeration, "detail", id] as const;
}

export function useAdminModerationReports(filters: AdminModerationFilters) {
  return useQuery({
    queryKey: [...queryKeys.adminModeration, "list", filters] as const,
    queryFn: () => fetchAdminModerationReports(filters),
    placeholderData: keepPreviousData,
  });
}

export function useAdminModerationReportDetail(id: number | null) {
  return useQuery({
    queryKey: adminModerationDetailKey(id ?? 0),
    queryFn: () => fetchAdminModerationReportDetail(id as number),
    enabled: id !== null,
    // A decision is final but an open report is the thing this screen exists to act
    // on, so freshness beats caching here.
    staleTime: 0,
  });
}

/**
 * Deciding a report can change a listing's visibility, an account's access, a
 * review's contribution to a product's rating and the report's own queue, so it
 * invalidates every surface a decision can move.
 */
export function useAdminModerationDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: { action: ModerationAction; reason: string } }) =>
      decideAdminModeration(id, input),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminModeration });
      void queryClient.invalidateQueries({ queryKey: adminModerationDetailKey(result.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminReports });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminProducts });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminReviews });
      toast.success(
        result.applied ? `Report #${result.id} decided.` : `Report #${result.id} was already decided.`,
      );
    },
    onError: (error: Error) =>
      toast.error(error.message || "Couldn't record the moderation decision."),
  });
}

export function useAdminModerationBulkDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { ids: number[]; action: "RESOLVED" | "DISMISSED"; reason: string }) =>
      bulkDecideAdminModeration(input),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminModeration });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminReports });
      toast.success(
        `${result.applied} report${result.applied === 1 ? "" : "s"} decided${
          result.already > 0 ? `, ${result.already} already closed` : ""
        }.`,
      );
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't decide the reports."),
  });
}

export function useAdminFlagWords() {
  return useQuery({
    queryKey: queryKeys.adminFlagWords,
    queryFn: fetchAdminFlagWords,
  });
}

export function useSetAdminFlagWords() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (words: string[]) => setAdminFlagWords(words),
    onSuccess: (words) => {
      queryClient.setQueryData(queryKeys.adminFlagWords, words);
      toast.success("Flag words saved");
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't save the flag words."),
  });
}

/* ---------------------------- PROMPT 30: support inbox ----------------------- */

export function adminSupportDetailKey(id: number) {
  return [...queryKeys.adminSupport, "detail", id] as const;
}

export function useAdminSupportTickets(filters: AdminSupportFilters) {
  return useQuery({
    queryKey: [...queryKeys.adminSupport, "list", filters] as const,
    queryFn: () => fetchAdminSupportTickets(filters),
    placeholderData: keepPreviousData,
  });
}

export function useAdminSupportTicketDetail(id: number | null) {
  return useQuery({
    queryKey: adminSupportDetailKey(id ?? 0),
    queryFn: () => fetchAdminSupportTicket(id as number),
    enabled: id !== null,
    // A live thread is the thing this screen exists to work, so freshness beats
    // caching away a reply that just arrived.
    staleTime: 0,
  });
}

/**
 * Sending a reply writes to the ticket and re-reads both the open thread and the
 * queue: a reply moves the ticket's status (and `updatedAt`), which reorders the list.
 */
export function useAdminSupportReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: { body: string; isInternal: boolean } }) =>
      replyAdminSupportTicket(id, input),
    onSuccess: (_result, { id }) => {
      void queryClient.invalidateQueries({ queryKey: adminSupportDetailKey(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminSupport });
      toast.success("Reply sent.");
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't send the reply."),
  });
}

export function useAdminSupportUpdate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: AdminSupportTicketUpdate }) =>
      updateAdminSupportTicket(id, input),
    onSuccess: (_result, { id }) => {
      void queryClient.invalidateQueries({ queryKey: adminSupportDetailKey(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminSupport });
      toast.success("Ticket updated.");
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't update the ticket."),
  });
}

/* ------------------------------ PROMPT 31: coupons --------------------------- */

export function adminCouponDetailKey(id: number) {
  return [...queryKeys.adminCoupons, "detail", id] as const;
}

export function useAdminCoupons(filters: AdminCouponFilters) {
  return useQuery({
    queryKey: [...queryKeys.adminCoupons, "list", filters] as const,
    queryFn: () => fetchAdminCoupons(filters),
    placeholderData: keepPreviousData,
  });
}

export function useAdminCouponDetail(id: number | null) {
  return useQuery({
    queryKey: adminCouponDetailKey(id ?? 0),
    queryFn: () => fetchAdminCouponDetail(id as number),
    enabled: id !== null,
  });
}

/** A write re-reads the list and the open detail, since both show `usedCount`. */
function useCouponInvalidate(id?: number) {
  const queryClient = useQueryClient();
  return () => {
    if (id !== undefined) {
      void queryClient.invalidateQueries({ queryKey: adminCouponDetailKey(id) });
    }
    void queryClient.invalidateQueries({ queryKey: queryKeys.adminCoupons });
  };
}

export function useCreateAdminCoupon() {
  const invalidate = useCouponInvalidate();
  return useMutation({
    mutationFn: (input: AdminCouponWriteInput) => createAdminCoupon(input),
    onSuccess: (result) => {
      invalidate();
      toast.success(`Coupon ${result.code} created.`);
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't create the coupon."),
  });
}

export function useUpdateAdminCoupon(id: number) {
  const invalidate = useCouponInvalidate(id);
  return useMutation({
    mutationFn: (input: AdminCouponWriteInput) => updateAdminCoupon(id, input),
    onSuccess: (result) => {
      invalidate();
      toast.success(`Coupon ${result.code} saved.`);
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't save the coupon."),
  });
}

export function useDeleteAdminCoupon(id: number) {
  const invalidate = useCouponInvalidate(id);
  return useMutation({
    mutationFn: (reason: string) => deleteAdminCoupon(id, reason),
    onSuccess: (result) => {
      invalidate();
      toast.success(`Coupon ${result.code} deleted.`);
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't delete the coupon."),
  });
}

/** The quick pause/activate on a listing: one status field, not a full re-save. */
export function useAdminCouponStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: AdminCouponStatus }) =>
      setAdminCouponStatus(id, status),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminCoupons });
      toast.success(`${result.code} is now ${result.status.toLowerCase()}.`);
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't change the coupon's status."),
  });
}
