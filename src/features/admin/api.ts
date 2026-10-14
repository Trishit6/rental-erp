import { api } from "@/lib/api/client";
import { PAISE_PER_RUPEE } from "@/lib/pricing";
import type {
  AdminBanner,
  AdminBlock,
  AdminCmsCatalogue,
  AdminCmsVersion,
  AdminOverview,
  AdminProductFacets,
  AdminProductRelations,
  AdminProductRow,
  AdminProductFilters,
} from "./types";

/**
 * Admin HTTP endpoints.
 *
 * ## Why filters are serialised here and not in the components
 *
 * The catalogue's query string is the contract with `adminProductsQuerySchema`, and
 * three different components read and write parts of it (the search box, the filter
 * bar, the sortable column headers). Building it in one place is what keeps them in
 * step — a component that sent `status=` for "no filter" would silently exclude
 * nothing *and* cache under a different key than the row above it.
 */

/**
 * Rupees as typed into the filter → paise as stored and compared.
 *
 * The API takes paise, matching every other price filter in the app. The field is
 * labelled in rupees because that is what a person types, so the conversion belongs
 * here: sending the raw number compared it against a paise column, making
 * "max ₹1,000" behave as "max ₹10".
 *
 * `0` is preserved rather than treated as absent — "free and up" is a real filter.
 */
function toPaise(rupees: number | null): number | null {
  return rupees === null ? null : Math.round(rupees * PAISE_PER_RUPEE);
}

/**
 * Serialises the catalogue's filters into a query string.
 *
 * Exported for the tests, because "no filter" is a behavioural contract rather than
 * a formatting detail: an empty-string `status=` would be rejected by the server's
 * `z.enum` as a 400, while an absent one means "no filter". Encoding that here means
 * the components cannot get it wrong individually.
 */
export function buildAdminProductQuery(filters: AdminProductFilters): string {
  const params = new URLSearchParams();
  const set = (key: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === "") return;
    params.set(key, String(value));
  };

  set("search", filters.search.trim());
  set("category", filters.category);
  set("seller", filters.seller);
  set("status", filters.status);
  set("condition", filters.condition);
  set("listingType", filters.listingType);
  // "ALL" is the absence of a filter, so it is sent as nothing at all.
  set("stock", filters.stock === "ALL" ? null : filters.stock);
  set("minPrice", toPaise(filters.minPrice));
  set("maxPrice", toPaise(filters.maxPrice));
  set("sort", filters.sort);
  set("dir", filters.dir);
  set("page", filters.page);
  set("pageSize", filters.pageSize);

  return params.toString();
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  return (await api.get<AdminOverview>("/admin/stats")).data;
}

/**
 * The signed-in staff member's own access (PROMPT 22).
 *
 * The sidebar filters to the modules these permissions allow and the role editor's
 * "view as role" preview renders against the same vocabulary. The set cannot be
 * derived on the client: every staff account's coarse `users.role` is `ADMIN`, and
 * the sub-role lives in `user_roles`.
 */
export type AdminMe = {
  /** The staff account's own id — used to offer "assign to me" on a support ticket. */
  id: number;
  /** The staff account's display name. */
  name: string;
  role: string;
  roles: string[];
  permissions: string[];
  isSuperAdmin: boolean;
};

export async function fetchAdminMe(): Promise<AdminMe> {
  return (await api.get<AdminMe>("/admin/me")).data;
}

/**
 * One probe of `/api/health`.
 *
 * The dashboard's system-status card reads this. The endpoint is deliberately public
 * (it answers `SELECT 1` and nothing else), but the *query* it feeds is scoped under
 * the admin prefix so the workspace's status display is cleared from the cache with
 * the rest of the workspace when the admin signs out.
 */
export type AdminHealth = {
  status: "ok" | "unavailable";
  database: "connected" | "unavailable";
};

export async function fetchAdminHealth(): Promise<AdminHealth> {
  return (await api.get<AdminHealth>("/health")).data;
}

export async function fetchAdminProducts(filters: AdminProductFilters): Promise<{
  rows: AdminProductRow[];
  total: number;
  totalPages: number;
}> {
  const result = await api.get<AdminProductRow[]>(
    `/admin/products?${buildAdminProductQuery(filters)}`,
  );
  return {
    rows: result.data,
    total: result.pagination?.total ?? result.data.length,
    totalPages: result.pagination?.totalPages ?? 1,
  };
}

export async function fetchAdminProductFacets(): Promise<AdminProductFacets> {
  return (await api.get<AdminProductFacets>("/admin/products/facets")).data;
}

export async function setAdminProductStatus(id: number, status: string): Promise<void> {
  await api.patch(`/admin/products/${id}/status`, { status });
}

/* --------------------------- catalogue write paths --------------------------- */

/**
 * The full editable record for one listing.
 *
 * Separate from `AdminProductRow` on purpose: the table row is eleven denormalised
 * columns for display and carries no description, deposit or optional price tier,
 * so prefilling an edit form from it would silently blank fields the admin never
 * touched. Fetching the record is one request and makes the form's initial state
 * the stored state.
 */
export type AdminProductDetail = {
  id: number;
  title: string;
  slug: string;
  description: string;
  status: string;
  condition: string;
  listingType: string;
  categoryId: number;
  brand: string | null;
  location: string;
  sellerId: number;
  sellerName: string;
  categoryName: string;
  purchasePrice: number | null;
  rentalPricePerDay: number | null;
  rentalPricePerWeek: number | null;
  rentalPricePerMonth: number | null;
  securityDeposit: number | null;
  minimumRentalDays: number | null;
  maximumRentalDays: number | null;
  quantity: number;
  availableQuantity: number;
  allowsDelivery: boolean;
  allowsPickup: boolean;
  createdAt: string;
  updatedAt: string;
  /** Order lines referencing this listing. Decides delete vs archive. */
  orderCount: number;
};

export async function fetchAdminProductDetail(id: number): Promise<AdminProductDetail> {
  return (await api.get<AdminProductDetail>(`/admin/products/${id}`)).data;
}

/** Only the fields `lib/admin-product-writer` accepts; anything else is refused. */
export type AdminProductEditInput = {
  title?: string;
  description?: string;
  categoryId?: number;
  listingType?: "SALE" | "RENT" | "BOTH";
  purchasePrice?: number | null;
  rentalPricePerDay?: number | null;
  rentalPricePerWeek?: number | null;
  rentalPricePerMonth?: number | null;
  securityDeposit?: number | null;
  minimumRentalDays?: number | null;
  maximumRentalDays?: number | null;
  quantity?: number;
  availableQuantity?: number;
  status?: string;
  allowsDelivery?: boolean;
  allowsPickup?: boolean;
  /** Reassign the listing to another seller (PROMPT 26). */
  sellerId?: number;
};

export async function updateAdminProduct(
  id: number,
  input: AdminProductEditInput,
): Promise<{ updated: boolean; unchanged?: boolean; changed: string[] }> {
  return (
    await api.patch<{ updated: boolean; unchanged?: boolean; changed: string[] }>(
      `/admin/products/${id}`,
      input,
    )
  ).data;
}

export type AdminProductDeleteOutcome = {
  id: number;
  outcome: "deleted" | "archived";
  reason: string;
  orderCount: number;
};

export async function deleteAdminProduct(id: number): Promise<AdminProductDeleteOutcome> {
  return (await api.delete<AdminProductDeleteOutcome>(`/admin/products/${id}`)).data;
}

export type AdminBulkStatusInput = {
  ids: number[];
  status: "PUBLISHED" | "PAUSED" | "ARCHIVED";
};

export async function bulkSetAdminProductStatus(
  input: AdminBulkStatusInput,
): Promise<{ requested: number; updated: number; missing: number[]; status: string }> {
  return (
    await api.patch<{ requested: number; updated: number; missing: number[]; status: string }>(
      `/admin/products/bulk-status`,
      input,
    )
  ).data;
}

/** Move many listings into one category (PROMPT 26). */
export async function bulkMoveAdminProducts(
  ids: number[],
  categoryId: number,
): Promise<{ requested: number; updated: number; missing: number[]; categoryId: number }> {
  return (
    await api.patch<{ requested: number; updated: number; missing: number[]; categoryId: number }>(
      `/admin/products/bulk-category`,
      { ids, categoryId },
    )
  ).data;
}

/**
 * Delete many listings at once. A `reason` is mandatory — the server's
 * `requireReason` refuses the call without one, and a bulk removal is exactly the
 * kind of action the audit trail exists for.
 */
export async function bulkDeleteAdminProducts(
  ids: number[],
  reason: string,
): Promise<{ requested: number; deleted: number; archived: number; missing: number[] }> {
  return (
    await api.patch<{ requested: number; deleted: number; archived: number; missing: number[] }>(
      `/admin/products/bulk-delete`,
      { ids, reason },
    )
  ).data;
}

/** Orders, rentals, reviews and reports touching one listing. */
export async function fetchAdminProductRelations(id: number): Promise<AdminProductRelations> {
  return (await api.get<AdminProductRelations>(`/admin/products/${id}/relations`)).data;
}

/* --------------------------- generic list helpers --------------------------- */

/**
 * Every admin list endpoint answers with the same shape: a page of rows plus the
 * pagination envelope. One helper keeps the eight list hooks from re-deriving
 * `total`'s fallback (the envelope is optional for callers that pass no paging),
 * which is exactly the kind of tiny inconsistency that drifts.
 */
export async function fetchAdminPage<Row>(
  path: string,
): Promise<{ rows: Row[]; total: number; totalPages: number }> {
  const result = await api.get<Row[]>(path);
  return {
    rows: result.data,
    total: result.pagination?.total ?? result.data.length,
    totalPages: result.pagination?.totalPages ?? 1,
  };
}

/** Query-string builder with the same "empty means absent" rule the catalogue uses. */
export function adminQueryString(
  parts: Record<string, string | number | null | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(parts)) {
    if (value === null || value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

/* ------------------------------- orders ---------------------------------- */

export type AdminOrderFilters = {
  search: string;
  status: string | null;
  type: string | null;
  paymentStatus: string | null;
  /** Order-total bounds, in rupees as typed; converted to paise for the API. */
  minAmount: number | null;
  maxAmount: number | null;
  page: number;
  pageSize: number;
};

export const EMPTY_ADMIN_ORDER_FILTERS: AdminOrderFilters = {
  search: "",
  status: null,
  type: null,
  paymentStatus: null,
  minAmount: null,
  maxAmount: null,
  page: 1,
  pageSize: 20,
};

export function adminOrdersPath(filters: AdminOrderFilters): string {
  return `/admin/orders${adminQueryString({
    search: filters.search,
    status: filters.status,
    type: filters.type,
    paymentStatus: filters.paymentStatus,
    minAmount: toPaise(filters.minAmount),
    maxAmount: toPaise(filters.maxAmount),
    page: filters.page,
    pageSize: filters.pageSize,
  })}`;
}

/** The admin order row, as `listAdminOrders` on the server returns it. */
export type AdminOrderRow = {
  id: number;
  orderNumber: string | null;
  orderType: string;
  status: string;
  paymentStatus: string;
  total: number;
  currency: string;
  itemCount: number;
  customerName: string;
  customerEmail: string;
  createdAt: string;
};

export function fetchAdminOrdersPage(filters: AdminOrderFilters) {
  return fetchAdminPage<AdminOrderRow>(adminOrdersPath(filters));
}

export async function setAdminOrderStatus(id: number, status: string): Promise<void> {
  await api.patch(`/admin/orders/${id}/status`, { status });
}

/* ------------------------------- rentals --------------------------------- */

/**
 * Rental filters, matching `adminRentalsQuerySchema` exactly.
 *
 * `bucket` is the one that matters. `status` alone cannot answer the question the
 * rentals screen is actually asked — "what is out", "what is overdue" — because both
 * span several statuses, and the server groups them (`statusesForBucket`). Sending
 * only `status` forced the admin to know that OVERDUE is a bucket and not a status and
 * to have no way to express it at all.
 *
 * `sort` and the `from`/`to` window are the other two the server already honours, so
 * no admin-side invention was needed to offer them.
 */
export type AdminRentalFilters = {
  search: string;
  status: string | null;
  bucket: string | null;
  sort: string;
  from: string;
  to: string;
  /** The "returns" view — rentals whose item came back. See the server schema. */
  returned?: boolean;
  page: number;
  pageSize: number;
};

export const EMPTY_ADMIN_RENTAL_FILTERS: AdminRentalFilters = {
  search: "",
  status: null,
  bucket: null,
  sort: "newest",
  from: "",
  to: "",
  page: 1,
  pageSize: 20,
};

export function adminRentalsPath(filters: AdminRentalFilters): string {
  return `/admin/rentals${adminQueryString({
    search: filters.search,
    status: filters.status,
    bucket: filters.bucket,
    sort: filters.sort,
    from: filters.from,
    to: filters.to,
    // Only sent when true, so the default list is byte-identical to what it was before
    // this flag existed and an unfiltered request stays cache-compatible.
    returned: filters.returned ? "true" : null,
    page: filters.page,
    pageSize: filters.pageSize,
  })}`;
}

export type AdminRentalRow = {
  id: number;
  status: string;
  startDate: string;
  endDate: string;
  actualReturnDate: string | null;
  rentalSubtotal: number;
  securityDeposit: number;
  total: number;
  title: string;
  productSlug: string;
  orderNumber: string | null;
  renterName: string;
  ownerName: string;
  createdAt: string;
};

export function fetchAdminRentalsPage(filters: AdminRentalFilters) {
  return fetchAdminPage<AdminRentalRow>(adminRentalsPath(filters));
}

/* -------------------------------- users ----------------------------------- */

export type AdminUserFilters = {
  search: string;
  role: string | null;
  sort: string;
  page: number;
  pageSize: number;
};

export const EMPTY_ADMIN_USER_FILTERS: AdminUserFilters = {
  search: "",
  role: null,
  sort: "newest",
  page: 1,
  pageSize: 20,
};

export function adminUsersPath(filters: AdminUserFilters): string {
  return `/admin/users${adminQueryString({
    search: filters.search,
    role: filters.role,
    sort: filters.sort,
    page: filters.page,
    pageSize: filters.pageSize,
  })}`;
}

export type AdminWorkspaceUserRow = {
  id: number;
  name: string;
  email: string;
  role: string;
  verified: boolean;
  orders: number;
  rentals: number;
  isSeller: boolean;
  sellerVerified: boolean | null;
  createdAt: string;
};

export function fetchAdminUsersPage(filters: AdminUserFilters) {
  return fetchAdminPage<AdminWorkspaceUserRow>(adminUsersPath(filters));
}

export function setAdminUserSuspended(
  id: number,
  suspend: boolean,
  reason: string,
): Promise<void> {
  return api
    .patch(`/admin/users/${id}/status`, {
      status: suspend ? "SUSPENDED" : "ACTIVE",
      reason,
    })
    .then(() => undefined);
}

/* ------------------------------- sellers ---------------------------------- */

export type AdminSellerFilters = {
  search: string;
  status: string | null;
  page: number;
  pageSize: number;
};

export const EMPTY_ADMIN_SELLER_FILTERS: AdminSellerFilters = {
  search: "",
  status: null,
  page: 1,
  pageSize: 20,
};

export function adminSellersPath(filters: AdminSellerFilters): string {
  return `/admin/sellers${adminQueryString({
    search: filters.search,
    status: filters.status,
    page: filters.page,
    pageSize: filters.pageSize,
  })}`;
}

export type AdminSellerRow = {
  id: number;
  name: string;
  email: string;
  location: string | null;
  verified: boolean;
  suspended: boolean;
  products: number;
  orders: number;
  rentals: number;
  revenue: number;
  createdAt: string;
};

export function fetchAdminSellersPage(filters: AdminSellerFilters) {
  return fetchAdminPage<AdminSellerRow>(adminSellersPath(filters));
}

export function setAdminSellerVerified(id: number, verified: boolean): Promise<void> {
  return api.patch(`/admin/sellers/${id}/verified`, { verified }).then(() => undefined);
}

/* ------------------------------- finance ----------------------------------- */

export type AdminFinanceSummary = {
  grossRevenue: number;
  sellerEarnings: number;
  platformEarnings: number;
  refunds: number;
  pendingPayouts: number;
  completedPayouts: number;
  currency: string;
};

export async function fetchAdminFinance(): Promise<AdminFinanceSummary> {
  return (await api.get<AdminFinanceSummary>("/admin/finance")).data;
}

/* ----------------------------- transactions -------------------------------- */

export type AdminTransactionFilters = {
  search: string;
  status: string | null;
  type: string | null;
  page: number;
  pageSize: number;
};

export const EMPTY_ADMIN_TRANSACTION_FILTERS: AdminTransactionFilters = {
  search: "",
  status: null,
  type: null,
  page: 1,
  pageSize: 20,
};

export function adminTransactionsPath(filters: AdminTransactionFilters): string {
  return `/admin/transactions${adminQueryString({
    search: filters.search,
    status: filters.status,
    type: filters.type,
    page: filters.page,
    pageSize: filters.pageSize,
  })}`;
}

export type AdminTransactionRow = {
  id: number;
  type: string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  providerTransactionId: string | null;
  paymentMethod: string | null;
  failureReason: string | null;
  orderNumber: string | null;
  customerName: string;
  createdAt: string;
  /** A one-line next step for a failed or stalled payment, or `null` when settled. */
  retryHint: string | null;
};

export function fetchAdminTransactionsPage(filters: AdminTransactionFilters) {
  return fetchAdminPage<AdminTransactionRow>(adminTransactionsPath(filters));
}

/* -------------------------------- reviews ----------------------------------- */

export type AdminReviewFilters = {
  search: string;
  status: string | null;
  scope: "product" | "seller";
  page: number;
  pageSize: number;
};

export const EMPTY_ADMIN_REVIEW_FILTERS: AdminReviewFilters = {
  search: "",
  status: null,
  scope: "product",
  page: 1,
  pageSize: 20,
};

export function adminReviewsPath(filters: AdminReviewFilters): string {
  return `/admin/reviews${adminQueryString({
    search: filters.search,
    status: filters.status,
    scope: filters.scope,
    page: filters.page,
    pageSize: filters.pageSize,
  })}`;
}

export type AdminReviewRow = {
  id: number;
  rating: number;
  title: string | null;
  comment: string;
  status: string;
  purchaseType: string;
  isVerifiedPurchase: boolean;
  reviewerName: string;
  productTitle: string | null;
  productSlug: string | null;
  sellerName: string | null;
  createdAt: string;
};

export function fetchAdminReviewsPage(filters: AdminReviewFilters) {
  return fetchAdminPage<AdminReviewRow>(adminReviewsPath(filters));
}

export function setAdminReviewStatus(id: number, status: "PUBLISHED" | "HIDDEN"): Promise<void> {
  return api.patch(`/admin/reviews/${id}/status`, { status }).then(() => undefined);
}

/* ------------------------------ categories ---------------------------------- */

export type AdminCategoryRow = {
  id: number;
  name: string;
  slug: string;
  parentId: number | null;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
  productCount: number;
};

export async function fetchAdminCategories(): Promise<AdminCategoryRow[]> {
  return (await api.get<AdminCategoryRow[]>("/admin/categories")).data;
}

export function setAdminCategoryActive(id: number, isActive: boolean): Promise<void> {
  return api.patch(`/admin/categories/${id}/active`, { isActive }).then(() => undefined);
}

export type AdminCategoryWriteInput = {
  name: string;
  slug?: string;
  description?: string | null;
  imageUrl?: string | null;
  icon?: string | null;
  parentId?: number | null;
  sortOrder?: number;
  isFeatured?: boolean;
  isActive?: boolean;
};

export async function createAdminCategory(
  input: AdminCategoryWriteInput,
): Promise<AdminCategoryRow> {
  return (await api.post<AdminCategoryRow>("/admin/categories", input)).data;
}

export async function updateAdminCategory(
  id: number,
  input: Partial<AdminCategoryWriteInput>,
): Promise<void> {
  await api.patch(`/admin/categories/${id}`, input);
}

/**
 * Delete a category, moving its listings first. `reassignToId` is required by the
 * server when the category is not empty, and `reason` is mandatory for the audit
 * trail.
 */
export async function deleteAdminCategory(
  id: number,
  input: { reason: string; reassignToId?: number },
): Promise<{ reassigned: number; childrenReassigned: number }> {
  return (
    await api.delete<{ reassigned: number; childrenReassigned: number }>(
      `/admin/categories/${id}`,
      input,
    )
  ).data;
}

export async function reorderAdminCategories(ids: number[]): Promise<void> {
  await api.patch("/admin/categories/reorder", { ids });
}

/* ---------------------------- product images -------------------------------- */

export type AdminProductImageRow = {
  id: number;
  title: string;
  slug: string;
  sellerName: string;
  imageCount: number;
  primaryImage: string | null;
};

export type AdminProductImageDetail = {
  product: { id: number; title: string };
  images: { id: number; url: string; altText: string | null; sortOrder: number }[];
};

export function adminProductImagesPath(page: number, pageSize: number): string {
  return `/admin/product-images${adminQueryString({ page, pageSize })}`;
}

export async function fetchAdminProductImageDetail(
  productId: number,
): Promise<AdminProductImageDetail> {
  return (await api.get<AdminProductImageDetail>(`/admin/product-images/${productId}`)).data;
}

export function addAdminProductImage(
  productId: number,
  input: { url: string; altText?: string; makePrimary?: boolean },
): Promise<void> {
  return api.post(`/admin/product-images/${productId}`, input).then(() => undefined);
}

export function removeAdminProductImage(imageId: number): Promise<void> {
  return api.delete(`/admin/product-images/${imageId}`).then(() => undefined);
}

export function setAdminProductImagePrimary(imageId: number): Promise<void> {
  return api.patch(`/admin/product-images/${imageId}/primary`).then(() => undefined);
}

/* -------------------------------- audit log --------------------------------- */

export type AdminAuditFilters = {
  action: string;
  entityType: string | null;
  search: string;
  from: string;
  to: string;
  page: number;
  pageSize: number;
};

export const EMPTY_ADMIN_AUDIT_FILTERS: AdminAuditFilters = {
  action: "",
  entityType: null,
  search: "",
  from: "",
  to: "",
  page: 1,
  pageSize: 20,
};

export function adminAuditPath(filters: AdminAuditFilters): string {
  return `/admin/audit-log${adminQueryString({
    action: filters.action,
    entityType: filters.entityType,
    search: filters.search,
    from: filters.from,
    to: filters.to,
    page: filters.page,
    pageSize: filters.pageSize,
  })}`;
}

export type AdminAuditRow = {
  id: number;
  adminId: number;
  adminName: string;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: number | null;
  details: string | null;
  reason: string | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  beforeState: string | null;
  afterState: string | null;
  createdAt: string;
};

export function fetchAdminAuditPage(filters: AdminAuditFilters) {
  return fetchAdminPage<AdminAuditRow>(adminAuditPath(filters));
}

/* ---------------------------------- RBAC ------------------------------------ */

export type AdminRoleRow = {
  id: number;
  name: string;
  description: string | null;
  isSystem: boolean;
  /** Permission keys `resource.action`. */
  permissions: string[];
  /** How many accounts hold this role. `DELETE` refuses while this is non-zero. */
  memberCount: number;
};

export type AdminPermissionRow = {
  key: string;
  description: string | null;
  groupKey: string;
};

export async function fetchAdminRoles(): Promise<AdminRoleRow[]> {
  return (await api.get<AdminRoleRow[]>("/admin/roles")).data;
}

export async function fetchAdminPermissions(): Promise<AdminPermissionRow[]> {
  return (await api.get<AdminPermissionRow[]>("/admin/permissions")).data;
}

export type AdminRoleWriteInput = {
  name: string;
  description?: string;
  permissions: string[];
  /** Recorded in the audit log; mandatory. */
  reason: string;
};

export async function createAdminRole(input: AdminRoleWriteInput): Promise<AdminRoleRow> {
  return (await api.post<AdminRoleRow>("/admin/roles", input)).data;
}

export type AdminRoleUpdateInput = {
  name?: string;
  description?: string | null;
  permissions?: string[];
  /** Recorded in the audit log; mandatory. */
  reason: string;
};

export async function updateAdminRole(
  id: number,
  input: AdminRoleUpdateInput,
): Promise<{ id: number; name: string; permissions?: string[] }> {
  return (await api.patch<{ id: number; name: string; permissions?: string[] }>(
    `/admin/roles/${id}`,
    input,
  )).data;
}

export async function deleteAdminRole(id: number, reason: string): Promise<void> {
  await api.delete(`/admin/roles/${id}`, { reason });
}

export async function fetchAdminUserRoles(userId: number): Promise<string[]> {
  return (await api.get<string[]>(`/admin/users/${userId}/roles`)).data;
}

export async function setAdminUserRoles(
  userId: number,
  roles: string[],
  reason: string,
): Promise<{ roles: string[] }> {
  return (await api.put<{ roles: string[] }>(`/admin/users/${userId}/roles`, { roles, reason }))
    .data;
}

/* ----------------------------------- CMS ------------------------------------ */

export async function fetchAdminCmsCatalogue(): Promise<AdminCmsCatalogue> {
  return (await api.get<AdminCmsCatalogue>("/admin/cms/catalogue")).data;
}

export async function fetchAdminBanners(): Promise<AdminBanner[]> {
  return (await api.get<AdminBanner[]>("/admin/cms/banners")).data;
}

export type AdminBannerWriteInput = {
  placement: string;
  title: string;
  subtitle?: string | null;
  imageUrl: string;
  linkUrl?: string | null;
  sortOrder?: number;
  status?: string;
  /** ISO strings, or null for "no bound". */
  startsAt?: string | null;
  endsAt?: string | null;
};

export async function createAdminBanner(input: AdminBannerWriteInput): Promise<{ id: number }> {
  return (await api.post<{ id: number }>("/admin/cms/banners", input)).data;
}

export async function updateAdminBanner(
  id: number,
  input: Partial<AdminBannerWriteInput>,
): Promise<void> {
  await api.patch(`/admin/cms/banners/${id}`, input);
}

export async function deleteAdminBanner(id: number, reason: string): Promise<void> {
  await api.delete(`/admin/cms/banners/${id}`, { reason });
}

export async function reorderAdminBanners(placement: string, ids: number[]): Promise<void> {
  await api.patch("/admin/cms/banners/reorder", { placement, ids });
}

export async function fetchAdminBlocks(): Promise<AdminBlock[]> {
  return (await api.get<AdminBlock[]>("/admin/cms/blocks")).data;
}

export async function fetchAdminBlock(key: string): Promise<AdminBlock> {
  return (await api.get<AdminBlock>(`/admin/cms/blocks/${encodeURIComponent(key)}`)).data;
}

export async function saveAdminBlock(
  key: string,
  input: { content: Record<string, unknown>; status?: "DRAFT" | "PUBLISHED" },
): Promise<{ id: number; blockKey: string; status: string }> {
  return (
    await api.put<{ id: number; blockKey: string; status: string }>(
      `/admin/cms/blocks/${encodeURIComponent(key)}`,
      input,
    )
  ).data;
}

export async function setAdminBlockStatus(
  key: string,
  status: "DRAFT" | "PUBLISHED",
): Promise<void> {
  await api.patch(`/admin/cms/blocks/${encodeURIComponent(key)}/status`, { status });
}

export async function deleteAdminBlock(key: string, reason: string): Promise<void> {
  await api.delete(`/admin/cms/blocks/${encodeURIComponent(key)}`, { reason });
}

export async function fetchAdminCmsVersions(
  entityType: "cms_block" | "cms_banner",
  id: number,
): Promise<AdminCmsVersion[]> {
  return (await api.get<AdminCmsVersion[]>(`/admin/cms/versions/${entityType}/${id}`)).data;
}

/* --------------------- PROMPT 27: the orders and rentals desks ---------------- */

/**
 * One order line as the admin detail view sees it.
 *
 * Carries the seller's name and the line's fulfilment state because the point of
 * the detail view is to answer "who is holding this up?" without opening the seller
 * dashboard — a bare `sellerId` would make the operator do the join by hand.
 */
export type AdminOrderItemView = {
  id: number;
  productId: number;
  sellerId: number;
  sellerName: string;
  mode: string;
  quantity: number;
  unitPrice: number;
  rentalCharge: number;
  securityDeposit: number;
  lineTotal: number;
  titleSnapshot: string;
  slugSnapshot: string | null;
  fulfillmentStatus: string | null;
  cancellationReason: string | null;
  startDate: string | null;
  endDate: string | null;
};

export type AdminOrderTimelineEntry = {
  id: number;
  type: string;
  fromStatus: string | null;
  toStatus: string;
  actorId: number | null;
  actorRole: string | null;
  note: string | null;
  metadata: string | null;
  createdAt: string;
};

export type AdminOrderDetail = {
  order: {
    id: number;
    orderNumber: string | null;
    status: string;
    paymentStatus: string;
    orderType: string;
    subtotal: number;
    deliveryFee: number;
    depositTotal: number;
    discount: number;
    tax: number;
    total: number;
    currency: string;
    deliveryMethod: string;
    deliveryAddress: string | null;
    trackingNumber: string | null;
    paymentProvider: string;
    paymentReference: string | null;
    createdAt: string;
    updatedAt: string;
  };
  customer: { id: number; name: string; email: string; phone: string | null };
  items: AdminOrderItemView[];
  sellerSplit: {
    sellerId: number;
    sellerName: string;
    lines: number;
    goods: number;
    deposit: number;
    total: number;
  }[];
  transactions: {
    id: number;
    type: string;
    amount: number;
    currency: string;
    status: string;
    provider: string;
    providerTransactionId: string | null;
    createdAt: string;
  }[];
  rentals: {
    id: number;
    status: string;
    startDate: string;
    endDate: string;
    actualReturnDate: string | null;
    securityDeposit: number;
    total: number;
    itemTitle: string;
  }[];
  refunds: {
    id: number;
    refundNumber: string;
    amount: number;
    status: string;
    reason: string | null;
    createdAt: string;
  }[];
  disputes: { id: number; disputeNumber: string; status: string; reason: string; createdAt: string }[];
  timeline: AdminOrderTimelineEntry[];
  /** The moves the state machine allows from the current status. */
  nextStatuses: string[];
  /** Whether cancellation is still possible (goods have not left). */
  canCancel: boolean;
};

export async function fetchAdminOrderDetail(id: number): Promise<AdminOrderDetail> {
  return (await api.get<AdminOrderDetail>(`/admin/orders/${id}`)).data;
}

/** The admin override, which forces any status but demands a reason. */
export async function overrideAdminOrderStatus(
  id: number,
  status: string,
  reason: string,
): Promise<void> {
  await api.patch(`/admin/orders/${id}/override`, { status, reason });
}

export async function cancelAdminOrder(id: number, reason: string): Promise<void> {
  await api.post(`/admin/orders/${id}/cancel`, { reason });
}

export async function addAdminOrderNote(id: number, note: string): Promise<void> {
  await api.post(`/admin/orders/${id}/notes`, { note });
}

export type AdminRefundRequest = {
  amount: number;
  reason: string;
  orderItemId?: number | null;
  idempotencyKey?: string | null;
};

export type AdminRefundResult = {
  id: number;
  refundNumber: string;
  amount: number;
  status: string;
  duplicate: boolean;
};

export async function requestAdminOrderRefund(
  id: number,
  input: AdminRefundRequest,
): Promise<AdminRefundResult> {
  return (await api.post<AdminRefundResult>(`/admin/orders/${id}/refunds`, input)).data;
}

/** Stuck orders and overdue returns — the dashboard's operations panel. */
export type AdminOrderHealth = {
  generatedAt: string;
  stuck: {
    id: number;
    orderNumber: string | null;
    status: string;
    customerName: string;
    total: number;
    ageMs: number;
    thresholdMs: number;
  }[];
  overdueReturns: {
    id: number;
    orderNumber: string | null;
    status: string;
    title: string;
    renterName: string;
    ownerName: string;
    endDate: string;
    daysOverdue: number;
    securityDeposit: number;
  }[];
  pendingRefunds: number;
  openDisputes: number;
};

export async function fetchAdminOrderHealth(): Promise<AdminOrderHealth> {
  return (await api.get<AdminOrderHealth>("/admin/order-health")).data;
}

/** A rental's recorded timeline step, as `buildRentalTimeline` returns it. */
export type AdminRentalTimelineStep = {
  key: string;
  label: string;
  description?: string;
  at: string | null;
  state: "done" | "current" | "pending" | "failed" | "cancelled";
};

export type AdminRentalDetail = {
  rental: {
    id: number;
    status: string;
    startDate: string;
    endDate: string;
    actualReturnDate: string | null;
    returnRequestedAt: string | null;
    completedAt: string | null;
    dailyRate: number;
    rentalSubtotal: number;
    securityDeposit: number;
    deliveryFee: number;
    total: number;
    currency: string;
    extensionRequestedAt: string | null;
    extensionRequestedDays: number | null;
    createdAt: string;
  };
  product: { id: number; title: string; slug: string };
  order: { id: number; orderNumber: string | null; status: string; paymentStatus: string };
  renter: { id: number; name: string; email: string };
  owner: { id: number; name: string; email: string };
  events: { type: string; createdAt: string }[];
  timeline: AdminRentalTimelineStep[];
  deposit: { held: number; settled: boolean; released: number | null };
  nextStatuses: string[];
};

export async function fetchAdminRentalDetail(id: number): Promise<AdminRentalDetail> {
  return (await api.get<AdminRentalDetail>(`/admin/rentals/${id}`)).data;
}

export async function forceAdminRentalStatus(id: number, status: string): Promise<void> {
  await api.patch(`/admin/rentals/${id}/status`, { status });
}

export async function confirmAdminRentalReturn(id: number): Promise<void> {
  await api.post(`/admin/rentals/${id}/return`);
}

export async function settleAdminRentalDeposit(
  id: number,
  input: { deduction: number; reason: string },
): Promise<{ refundNumber: string | null; released: number; deduction: number }> {
  return (
    await api.post<{ refundNumber: string | null; released: number; deduction: number }>(
      `/admin/rentals/${id}/deposit`,
      input,
    )
  ).data;
}

export async function decideAdminRentalExtension(
  id: number,
  input: { decision: "APPROVE" | "REJECT"; days?: number; reason: string },
): Promise<{ days: number; newEndDate: string | null }> {
  return (
    await api.post<{ days: number; newEndDate: string | null }>(
      `/admin/rentals/${id}/extension`,
      input,
    )
  ).data;
}

export type AdminDisputeFilters = {
  status: string | null;
  search: string;
  from: string;
  to: string;
  page: number;
  pageSize: number;
};

export const EMPTY_ADMIN_DISPUTE_FILTERS: AdminDisputeFilters = {
  status: null,
  search: "",
  from: "",
  to: "",
  page: 1,
  pageSize: 20,
};

export function adminDisputesPath(filters: AdminDisputeFilters): string {
  return `/admin/disputes${adminQueryString({
    status: filters.status,
    search: filters.search,
    from: filters.from,
    to: filters.to,
    page: filters.page,
    pageSize: filters.pageSize,
  })}`;
}

export type AdminDisputeRow = {
  id: number;
  disputeNumber: string;
  status: string;
  reason: string;
  orderId: number;
  orderNumber: string | null;
  openerId: number;
  openerName: string;
  againstName: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export function fetchAdminDisputesPage(filters: AdminDisputeFilters) {
  return fetchAdminPage<AdminDisputeRow>(adminDisputesPath(filters));
}

export type AdminDisputeDetail = {
  dispute: {
    id: number;
    disputeNumber: string;
    status: string;
    reason: string;
    description: string | null;
    resolution: string | null;
    createdAt: string;
    resolvedAt: string | null;
    resolvedBy: number | null;
  };
  order: {
    id: number;
    orderNumber: string | null;
    status: string;
    paymentStatus: string;
    total: number;
    currency: string;
    createdAt: string;
  };
  opener: { id: number; name: string; email: string };
  against: { id: number; name: string; email: string } | null;
};

export async function fetchAdminDisputeDetail(id: number): Promise<AdminDisputeDetail> {
  return (await api.get<AdminDisputeDetail>(`/admin/disputes/${id}`)).data;
}

export async function decideAdminDispute(
  id: number,
  input: {
    status: "UNDER_REVIEW" | "RESOLVED" | "DISMISSED";
    resolution: string;
    refund?: { amount: number; reason: string; idempotencyKey?: string | null } | null;
  },
): Promise<{ appliedRefund: boolean }> {
  return (await api.patch<{ appliedRefund: boolean }>(`/admin/disputes/${id}`, input)).data;
}

/* ------------------------- PROMPT 28: transaction detail -------------------- */

/** The archived provider events behind one payment, plus what it refunded. */
export type AdminTransactionDetail = {
  transaction: {
    id: number;
    type: string;
    amount: number;
    currency: string;
    status: string;
    provider: string;
    providerTransactionId: string | null;
    paymentMethod: string | null;
    failureReason: string | null;
    createdAt: string;
    updatedAt: string;
  };
  order: {
    id: number;
    orderNumber: string | null;
    status: string;
    paymentStatus: string;
    total: number;
    currency: string;
  } | null;
  customer: { id: number; name: string; email: string };
  webhookEvents: {
    id: number;
    provider: string;
    providerEventId: string;
    eventType: string;
    status: string;
    signatureVerified: boolean;
    errorMessage: string | null;
    payload: string;
    processedAt: string | null;
    createdAt: string;
  }[];
  refunds: {
    id: number;
    refundNumber: string;
    amount: number;
    status: string;
    providerReference: string | null;
    createdAt: string;
  }[];
  retryHint: string | null;
};

export async function fetchAdminTransactionDetail(id: number): Promise<AdminTransactionDetail> {
  return (await api.get<AdminTransactionDetail>(`/admin/transactions/${id}`)).data;
}

/* ------------------------- PROMPT 28: refund review ------------------------- */

export type AdminRefundFilters = {
  search: string;
  status: string | null;
  page: number;
  pageSize: number;
};

export const EMPTY_ADMIN_REFUND_FILTERS: AdminRefundFilters = {
  search: "",
  status: null,
  page: 1,
  pageSize: 20,
};

export function adminRefundsPath(filters: AdminRefundFilters): string {
  return `/admin/refunds${adminQueryString({
    search: filters.search,
    status: filters.status,
    page: filters.page,
    pageSize: filters.pageSize,
  })}`;
}

export type AdminRefundRow = {
  id: number;
  refundNumber: string;
  status: string;
  amount: number;
  currency: string;
  reason: string | null;
  orderId: number;
  orderNumber: string | null;
  customerName: string;
  providerReference: string | null;
  createdAt: string;
};

export function fetchAdminRefundsPage(filters: AdminRefundFilters) {
  return fetchAdminPage<AdminRefundRow>(adminRefundsPath(filters));
}

export type AdminRefundDetail = {
  refund: {
    id: number;
    refundNumber: string;
    status: string;
    amount: number;
    currency: string;
    reason: string | null;
    providerReference: string | null;
    createdAt: string;
    updatedAt: string;
    createdByName: string | null;
  };
  order: {
    id: number;
    orderNumber: string | null;
    status: string;
    paymentStatus: string;
    total: number;
    currency: string;
    createdAt: string;
  };
  customer: { id: number; name: string; email: string };
  transaction: {
    id: number;
    provider: string;
    providerTransactionId: string | null;
    amount: number;
    status: string;
    createdAt: string;
  } | null;
  /** Total settled against the order, in paise. */
  captured: number;
  /** Still refundable beyond this request, in paise. */
  remaining: number;
  nextStatuses: string[];
};

export async function fetchAdminRefundDetail(id: number): Promise<AdminRefundDetail> {
  return (await api.get<AdminRefundDetail>(`/admin/refunds/${id}`)).data;
}

export type AdminRefundDecisionResult = {
  id: number;
  refundNumber: string;
  status: string;
  providerReference: string | null;
  applied: boolean;
};

export async function decideAdminRefund(
  id: number,
  input: { decision: "APPROVE" | "REJECT"; providerReference?: string | null; reason: string },
): Promise<AdminRefundDecisionResult> {
  return (await api.post<AdminRefundDecisionResult>(`/admin/refunds/${id}/decision`, input)).data;
}

/* --------------------- PROMPT 28: commission + reconciliation ---------------- */

export type AdminCommissionByVendor = {
  sellerId: number;
  sellerName: string;
  sales: number;
  commission: number;
  feeCount: number;
};

export type AdminCommissionByCategory = {
  categoryId: number;
  categoryName: string;
  sales: number;
  commission: number;
};

export type AdminRevenueMonth = {
  month: string;
  gross: number;
  commission: number;
  orders: number;
};

export type AdminRevenueReport = {
  commission: {
    currency: string;
    byVendor: AdminCommissionByVendor[];
    byCategory: AdminCommissionByCategory[];
    totals: { sales: number; commission: number };
  };
  revenue: {
    currency: string;
    grossCollected: number;
    commission: number;
    sellerEarnings: number;
    refunded: number;
    netRevenueAfterRefunds: number;
    byMonth: AdminRevenueMonth[];
  };
};

export async function fetchAdminRevenue(): Promise<AdminRevenueReport> {
  return (await api.get<AdminRevenueReport>("/admin/revenue")).data;
}

export type AdminReconciliationMismatch = {
  kind: string;
  severity: "HIGH" | "MEDIUM";
  entityType: string;
  entityId: number | null;
  reference: string | null;
  detail: string;
  amount: number | null;
};

export type AdminReconciliation = {
  generatedAt: string;
  currency: string;
  totals: {
    ordersCollected: number;
    capturedPayments: number;
    refunded: number;
    completedPayouts: number;
  };
  mismatches: AdminReconciliationMismatch[];
};

export async function fetchAdminReconciliation(): Promise<AdminReconciliation> {
  return (await api.get<AdminReconciliation>("/admin/reconciliation")).data;
}

/* -------------------------- PROMPT 29: moderation hub ----------------------- */

/**
 * The decisions a moderator can record. Mirrors `MODERATION_ACTIONS` in
 * `server/lib/moderation.ts` the way the listing vocabulary is mirrored — the two
 * are asserted to agree in `tests/admin-moderation.test.ts`, rather than sharing a
 * module across the app/server tsconfigs.
 */
export const MODERATION_ACTIONS = [
  "RESOLVED",
  "DISMISSED",
  "REVIEW_HIDDEN",
  "REVIEW_RESTORED",
  "PRODUCT_HIDDEN",
  "PRODUCT_RESTORED",
  "USER_WARNED",
  "USER_SUSPENDED",
  "USER_RESTORED",
  "MESSAGE_DELETED",
] as const;

export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

/** What each action does, in the words the button carries. */
export const MODERATION_ACTION_LABELS: Record<ModerationAction, string> = {
  RESOLVED: "Resolve — no action needed",
  DISMISSED: "Dismiss the report",
  REVIEW_HIDDEN: "Hide the review",
  REVIEW_RESTORED: "Restore the review",
  PRODUCT_HIDDEN: "Hide the listing",
  PRODUCT_RESTORED: "Restore the listing",
  USER_WARNED: "Warn the account",
  USER_SUSPENDED: "Suspend the account",
  USER_RESTORED: "Restore the account",
  MESSAGE_DELETED: "Delete the message",
};

/**
 * Which actions make sense for a target, most severe first.
 *
 * The server rejects an action that does not match the report's target, so this is
 * presentational: it keeps the moderator from being offered "hide the listing" on a
 * report about a person. A target with no linked action (an order or rental) can
 * still be resolved or dismissed.
 */
const ACTIONS_BY_TARGET: Record<string, ModerationAction[]> = {
  review: ["REVIEW_HIDDEN", "REVIEW_RESTORED", "RESOLVED", "DISMISSED"],
  product: ["PRODUCT_HIDDEN", "PRODUCT_RESTORED", "RESOLVED", "DISMISSED"],
  user: ["USER_WARNED", "USER_SUSPENDED", "USER_RESTORED", "RESOLVED", "DISMISSED"],
  message: ["MESSAGE_DELETED", "RESOLVED", "DISMISSED"],
  order: ["RESOLVED", "DISMISSED"],
  rental: ["RESOLVED", "DISMISSED"],
};

export function moderationActionsForTarget(targetType: string): ModerationAction[] {
  return ACTIONS_BY_TARGET[targetType] ?? ["RESOLVED", "DISMISSED"];
}

/**
 * Which configured keywords a piece of text contains. Mirrors the pure helper on
 * the server; kept here so the queue can badge a flagged review without a round
 * trip per row.
 */
export function flagWordMatches(
  text: string | null | undefined,
  words: readonly string[],
): string[] {
  const haystack = (text ?? "").toLowerCase();
  return words
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length > 0 && haystack.includes(word));
}

export type AdminModerationFilters = {
  search: string;
  status: string | null;
  target: string | null;
  page: number;
  pageSize: number;
};

export const EMPTY_ADMIN_MODERATION_FILTERS: AdminModerationFilters = {
  search: "",
  status: null,
  target: null,
  page: 1,
  pageSize: 20,
};

export function adminModerationPath(filters: AdminModerationFilters): string {
  return `/admin/moderation/reports${adminQueryString({
    search: filters.search,
    status: filters.status,
    target: filters.target,
    page: filters.page,
    pageSize: filters.pageSize,
  })}`;
}

export type AdminModerationReportRow = {
  id: number;
  status: string;
  action: string | null;
  actionNote: string | null;
  reason: string;
  details: string | null;
  targetType: string;
  targetId: number;
  targetLabel: string;
  reporterName: string;
  resolvedByName: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export function fetchAdminModerationReports(filters: AdminModerationFilters) {
  return fetchAdminPage<AdminModerationReportRow>(adminModerationPath(filters));
}

export type AdminModerationHistoryEntry = {
  id: number;
  action: string;
  details: string | null;
  reason: string | null;
  adminName: string | null;
  actorRole: string | null;
  createdAt: string;
};

export type AdminModerationReportDetail = {
  report: {
    id: number;
    status: string;
    action: string | null;
    actionNote: string | null;
    reason: string;
    details: string | null;
    createdAt: string;
    resolvedAt: string | null;
  };
  reporter: { id: number; name: string; email: string };
  resolvedBy: { id: number; name: string } | null;
  target: { type: string; id: number; headline: string };
  history: AdminModerationHistoryEntry[];
};

export async function fetchAdminModerationReportDetail(
  id: number,
): Promise<AdminModerationReportDetail> {
  return (await api.get<AdminModerationReportDetail>(`/admin/moderation/reports/${id}`)).data;
}

export type AdminModerationDecisionResult = {
  id: number;
  status: string;
  action: ModerationAction;
  outcomeLabel: string;
  applied: boolean;
};

export async function decideAdminModeration(
  id: number,
  input: { action: ModerationAction; reason: string },
): Promise<AdminModerationDecisionResult> {
  return (await api.post<AdminModerationDecisionResult>(
    `/admin/moderation/reports/${id}/decision`,
    input,
  )).data;
}

export type AdminModerationBulkResult = { applied: number; already: number };

export async function bulkDecideAdminModeration(input: {
  ids: number[];
  action: "RESOLVED" | "DISMISSED";
  reason: string;
}): Promise<AdminModerationBulkResult> {
  return (await api.post<AdminModerationBulkResult>("/admin/moderation/reports/bulk", input)).data;
}

export async function fetchAdminFlagWords(): Promise<string[]> {
  return (await api.get<{ words: string[] }>("/admin/moderation/flag-words")).data.words;
}

export async function setAdminFlagWords(words: string[]): Promise<string[]> {
  return (await api.patch<{ words: string[] }>("/admin/moderation/flag-words", { words })).data.words;
}

/* ---------------------------- PROMPT 30: support inbox ---------------------- */

/**
 * The staff ticket vocabularies. Mirrors `TICKET_STATUSES` / `TICKET_PRIORITIES` in
 * `server/lib/support.ts`; the server decides what a transition may be, and these are
 * what the filter dropdowns and the status editor offer.
 */
export const TICKET_STATUSES = ["OPEN", "PENDING", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
export type AdminTicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type AdminTicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_STATUS_LABELS: Record<AdminTicketStatus, string> = {
  OPEN: "Open",
  PENDING: "Awaiting customer",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export const TICKET_PRIORITY_LABELS: Record<AdminTicketPriority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

export type AdminSupportFilters = {
  search: string;
  status: string | null;
  priority: string | null;
  /** `"me"` for the viewer's claims, `"unassigned"` for the shared pool. */
  assignee: string | null;
  page: number;
  pageSize: number;
};

export const EMPTY_ADMIN_SUPPORT_FILTERS: AdminSupportFilters = {
  search: "",
  status: null,
  priority: null,
  assignee: null,
  page: 1,
  pageSize: 20,
};

export function adminSupportPath(filters: AdminSupportFilters): string {
  return `/admin/support/tickets${adminQueryString({
    search: filters.search,
    status: filters.status,
    priority: filters.priority,
    assignee: filters.assignee,
    page: filters.page,
    pageSize: filters.pageSize,
  })}`;
}

export type AdminSupportTicketRow = {
  id: number;
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  orderId: number | null;
  rentalId: number | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  resolutionRating: number | null;
  messageCount: number;
  userId: number;
  requesterName: string;
  requesterEmail: string;
  assigneeId: number | null;
  assigneeName: string | null;
  slaDueAt: string | null;
};

export function fetchAdminSupportTickets(filters: AdminSupportFilters) {
  return fetchAdminPage<AdminSupportTicketRow>(adminSupportPath(filters));
}

export type AdminSupportMessage = {
  id: number;
  body: string;
  createdAt: string;
  authorId: number;
  authorName: string;
  authorIsStaff: boolean;
  /** Staff-only note; filtered from every customer read but shown here. */
  isInternal: boolean;
  attachments: {
    id: number;
    fileName: string;
    url: string;
    mimeType: string | null;
    sizeBytes: number | null;
  }[];
};

export type AdminSupportTicketDetail = AdminSupportTicketRow & {
  requester: { id: number; name: string; email: string };
  assignee: { id: number; name: string } | null;
  order: {
    id: number;
    orderNumber: string | null;
    status: string;
    paymentStatus: string;
    total: number;
    currency: string;
  } | null;
  rental: { id: number; status: string } | null;
  messages: AdminSupportMessage[];
};

export async function fetchAdminSupportTicket(id: number): Promise<AdminSupportTicketDetail> {
  return (await api.get<AdminSupportTicketDetail>(`/admin/support/tickets/${id}`)).data;
}

export async function replyAdminSupportTicket(
  id: number,
  input: { body: string; isInternal: boolean },
): Promise<{ messageId: number; status: string }> {
  return (await api.post<{ messageId: number; status: string }>(
    `/admin/support/tickets/${id}/messages`,
    input,
  )).data;
}

export type AdminSupportTicketUpdate = {
  status?: AdminTicketStatus;
  priority?: AdminTicketPriority;
  assigneeId?: number | null;
  reason: string;
};

export async function updateAdminSupportTicket(
  id: number,
  input: AdminSupportTicketUpdate,
): Promise<{
  id: number;
  status: AdminTicketStatus;
  priority: AdminTicketPriority;
  assigneeId: number | null;
}> {
  return (await api.patch<{
    id: number;
    status: AdminTicketStatus;
    priority: AdminTicketPriority;
    assigneeId: number | null;
  }>(`/admin/support/tickets/${id}`, input)).data;
}

/* ------------------------------ PROMPT 31: coupons --------------------------- */

/**
 * The coupon desk's vocabularies. Mirrors `COUPON_STATUSES` / `COUPON_DISCOUNT_TYPES`
 * and the writable scopes in `server/lib/coupon-admin.ts`.
 */
export const COUPON_STATUSES = ["ACTIVE", "PAUSED", "SCHEDULED", "EXPIRED", "RETIRED"] as const;
export type AdminCouponStatus = (typeof COUPON_STATUSES)[number];

export const COUPON_DISCOUNT_TYPES = ["PERCENT", "FLAT"] as const;
export type AdminCouponDiscountType = (typeof COUPON_DISCOUNT_TYPES)[number];

/** Every scope has a column to name its target. */
export const COUPON_SCOPES = ["ALL", "CATEGORY", "SELLER", "PRODUCT"] as const;
export type AdminCouponScope = (typeof COUPON_SCOPES)[number];

export const COUPON_STATUS_LABELS: Record<AdminCouponStatus, string> = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  SCHEDULED: "Scheduled",
  EXPIRED: "Expired",
  RETIRED: "Retired",
};

export const COUPON_DISCOUNT_TYPE_LABELS: Record<AdminCouponDiscountType, string> = {
  PERCENT: "Percentage",
  FLAT: "Flat amount",
};

export const COUPON_SCOPE_LABELS: Record<AdminCouponScope, string> = {
  ALL: "Whole catalogue",
  CATEGORY: "One category",
  SELLER: "One seller",
  PRODUCT: "One product",
};

export type AdminCouponFilters = {
  search: string;
  status: string | null;
  discountType: string | null;
  page: number;
  pageSize: number;
};

export const EMPTY_ADMIN_COUPON_FILTERS: AdminCouponFilters = {
  search: "",
  status: null,
  discountType: null,
  page: 1,
  pageSize: 20,
};

export function adminCouponsPath(filters: AdminCouponFilters): string {
  return `/admin/coupons${adminQueryString({
    search: filters.search,
    status: filters.status,
    discountType: filters.discountType,
    page: filters.page,
    pageSize: filters.pageSize,
  })}`;
}

export type AdminCouponRow = {
  id: number;
  code: string;
  description: string | null;
  discountType: string;
  /** `FLAT` = paise; `PERCENT` = basis points. */
  discountValue: number;
  maxDiscountPaise: number | null;
  minimumOrderPaise: number;
  usageLimit: number | null;
  perUserLimit: number | null;
  usedCount: number;
  redemptionCount: number;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  appliesTo: string;
  categoryId: number | null;
  categoryName: string | null;
  sellerId: number | null;
  sellerName: string | null;
  productId: number | null;
  productTitle: string | null;
  /** May this coupon be combined with another promotion. */
  stackable: boolean;
  /** May the discount be taken out of the refundable deposit. */
  allowDepositDiscount: boolean;
  createdAt: string;
  updatedAt: string;
};

export function fetchAdminCoupons(filters: AdminCouponFilters) {
  return fetchAdminPage<AdminCouponRow>(adminCouponsPath(filters));
}

export type AdminCouponRedemption = {
  id: number;
  orderId: number;
  orderNumber: string | null;
  userId: number;
  userName: string;
  discountPaise: number;
  createdAt: string;
};

export type AdminCouponDetail = {
  coupon: AdminCouponRow;
  redemptionCount: number;
  totalDiscountPaise: number;
  redemptions: AdminCouponRedemption[];
};

export async function fetchAdminCouponDetail(id: number): Promise<AdminCouponDetail> {
  return (await api.get<AdminCouponDetail>(`/admin/coupons/${id}`)).data;
}

export type AdminCouponWriteInput = {
  code: string;
  description?: string | null;
  discountType: AdminCouponDiscountType;
  discountValue: number;
  maxDiscountPaise?: number | null;
  minimumOrderPaise?: number;
  usageLimit?: number | null;
  perUserLimit?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  status: AdminCouponStatus;
  appliesTo: AdminCouponScope;
  categoryId?: number | null;
  sellerId?: number | null;
  productId?: number | null;
  stackable?: boolean;
  allowDepositDiscount?: boolean;
};

/**
 * The desk's CSV export, as a same-origin URL.
 *
 * A plain link rather than a fetch: the browser sends the session cookie to the
 * same origin, and letting it handle the download means the file never has to sit
 * in client memory as a string.
 */
export function adminCouponsExportUrl(filters: AdminCouponFilters): string {
  const query = adminQueryString({
    search: filters.search,
    status: filters.status,
    discountType: filters.discountType,
  });
  return `/api/admin/coupons/export${query}`;
}

export async function createAdminCoupon(
  input: AdminCouponWriteInput,
): Promise<{ id: number; code: string }> {
  return (await api.post<{ id: number; code: string }>("/admin/coupons", input)).data;
}

export async function updateAdminCoupon(
  id: number,
  input: AdminCouponWriteInput,
): Promise<{ id: number; code: string }> {
  return (await api.patch<{ id: number; code: string }>(`/admin/coupons/${id}`, input)).data;
}

export async function deleteAdminCoupon(
  id: number,
  reason: string,
): Promise<{ id: number; code: string }> {
  return (await api.delete<{ id: number; code: string }>(`/admin/coupons/${id}`, { reason })).data;
}

export async function setAdminCouponStatus(
  id: number,
  status: AdminCouponStatus,
): Promise<{ id: number; code: string; status: AdminCouponStatus }> {
  return (
    await api.patch<{ id: number; code: string; status: AdminCouponStatus }>(
      `/admin/coupons/${id}/status`,
      { status },
    )
  ).data;
}
