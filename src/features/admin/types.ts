/**
 * Admin workspace types.
 *
 * These mirror what `server/routes/admin.ts` actually returns. The catalogue row
 * carries its seller, category and thumbnail *denormalised into the row* on
 * purpose: the table renders eleven columns per product, and resolving them with a
 * request per cell would mean twenty round trips to draw one page.
 *
 * Prices are paise on the wire and rupees in the UI. The conversion is the
 * display layer's job (`lib/pricing`), and nothing here converts — the same rule
 * the customer-facing product types follow, so a price read in two places cannot
 * drift apart by a factor of 100.
 */

export type AdminOverview = {
  totalProducts: number;
  activeProducts: number;
  totalUsers: number;
  totalSellers: number;
  totalOrders: number;
  activeRentals: number;
  /** Paise. Order totals summed over everything not still `PENDING_PAYMENT`. */
  totalRevenue: number;
  pendingPayouts: number;
  reviews: number;
  openReports: number;
  grossVolume: number;
};

export type AdminProductRow = {
  id: number;
  title: string;
  slug: string;
  status: string;
  condition: string;
  listingType: string;
  categoryId: number;
  categoryName: string;
  sellerId: number;
  sellerName: string;
  purchasePrice: number | null;
  rentalPricePerDay: number | null;
  quantity: number;
  availableQuantity: number;
  /** First image by sort order, or null when a listing has none. */
  imageUrl: string | null;
  createdAt: string;
};

export type AdminProductFacets = {
  sellers: { id: number; name: string }[];
  categories: { id: number; name: string }[];
};

/** Mirrors `ADMIN_PRODUCT_SORTS` in `server/lib/admin-products`. */
export const ADMIN_PRODUCT_SORT_KEYS = [
  "createdAt",
  "title",
  "status",
  "purchasePrice",
  "rentalPricePerDay",
  "quantity",
] as const;

export type AdminProductSort = (typeof ADMIN_PRODUCT_SORT_KEYS)[number];

/**
 * Every value the catalogue can be filtered or sorted by.
 *
 * `null`/`""` mean "no filter" and are sent as absent parameters rather than as
 * empty strings, so the server's `.nullish()` sees the same thing either way and
 * the query key stays stable — an empty-string filter would have produced a
 * different cache entry per keystroke of a cleared search box.
 */
export type AdminProductFilters = {
  search: string;
  category: number | null;
  seller: number | null;
  status: string | null;
  condition: string | null;
  listingType: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  sort: AdminProductSort;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
};

export const EMPTY_ADMIN_PRODUCT_FILTERS: AdminProductFilters = {
  search: "",
  category: null,
  seller: null,
  status: null,
  condition: null,
  listingType: null,
  minPrice: null,
  maxPrice: null,
  sort: "createdAt",
  dir: "desc",
  page: 1,
  pageSize: 20,
};

/** Whether any filter other than paging and sorting is narrowing the result. */
export function hasActiveFilters(filters: AdminProductFilters): boolean {
  return (
    filters.search !== "" ||
    filters.category !== null ||
    filters.seller !== null ||
    filters.status !== null ||
    filters.condition !== null ||
    filters.listingType !== null ||
    filters.minPrice !== null ||
    filters.maxPrice !== null
  );
}
