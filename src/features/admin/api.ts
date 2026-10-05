import { api } from "@/lib/api/client";
import { PAISE_PER_RUPEE } from "@/lib/pricing";
import type {
  AdminOverview,
  AdminProductFacets,
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
};

export async function updateAdminProduct(
  id: number,
  input: AdminProductEditInput,
): Promise<{ updated: boolean; unchanged?: boolean; changed: string[] }> {
  return (await api.patch<{ updated: boolean; unchanged?: boolean; changed: string[] }>(
    `/admin/products/${id}`,
    input,
  )).data;
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
  page: number;
  pageSize: number;
};

export const EMPTY_ADMIN_ORDER_FILTERS: AdminOrderFilters = {
  search: "",
  status: null,
  type: null,
  paymentStatus: null,
  page: 1,
  pageSize: 20,
};

export function adminOrdersPath(filters: AdminOrderFilters): string {
  return `/admin/orders${adminQueryString({
    search: filters.search,
    status: filters.status,
    type: filters.type,
    paymentStatus: filters.paymentStatus,
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

export function setAdminUserSuspended(id: number, suspend: boolean): Promise<void> {
  return api
    .patch(`/admin/users/${id}/${suspend ? "suspend" : "unsuspend"}`)
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
  page: number;
  pageSize: number;
};

export const EMPTY_ADMIN_AUDIT_FILTERS: AdminAuditFilters = {
  action: "",
  entityType: null,
  page: 1,
  pageSize: 20,
};

export function adminAuditPath(filters: AdminAuditFilters): string {
  return `/admin/audit-log${adminQueryString({
    action: filters.action,
    entityType: filters.entityType,
    page: filters.page,
    pageSize: filters.pageSize,
  })}`;
}

export type AdminAuditRow = {
  id: number;
  adminId: number;
  adminName: string;
  action: string;
  entityType: string;
  entityId: number | null;
  details: string | null;
  createdAt: string;
};

export function fetchAdminAuditPage(filters: AdminAuditFilters) {
  return fetchAdminPage<AdminAuditRow>(adminAuditPath(filters));
}
