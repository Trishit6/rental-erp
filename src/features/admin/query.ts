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
import type {
  AdminAuditFilters,
  AdminBulkStatusInput,
  AdminOrderFilters,
  AdminProductEditInput,
  AdminRentalFilters,
  AdminReviewFilters,
  AdminRoleUpdateInput,
  AdminRoleWriteInput,
  AdminSellerFilters,
  AdminTransactionFilters,
  AdminUserFilters,
  AdminBannerWriteInput,
  AdminCategoryWriteInput,
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
    queryFn: () =>
      import("./api").then((m) =>
        m.fetchAdminPage<import("./api").AdminProductImageRow>(
          m.adminProductImagesPath(page, pageSize),
        ),
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
    async suspendUser(id: number, suspend: boolean, reason: string) {
      await api.patch(`/admin/users/${id}/status`, {
        status: suspend ? "SUSPENDED" : "ACTIVE",
        reason,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers });
      toast.success(suspend ? "User suspended" : "User restored");
    },
    async resolveReport(id: number, status: string) {
      await api.patch(`/admin/reports/${id}`, { status });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminReports });
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
