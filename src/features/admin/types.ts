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
  /** Availability filter (PROMPT 26): `available_quantity`, not `quantity`. */
  stock: "ALL" | "IN_STOCK" | "OUT_OF_STOCK";
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
  stock: "ALL",
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
    filters.stock !== "ALL" ||
    filters.minPrice !== null ||
    filters.maxPrice !== null
  );
}

/* --------------------------------- CMS types -------------------------------- */

export type AdminBanner = {
  id: number;
  placement: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  linkUrl: string | null;
  sortOrder: number;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
};

export type AdminBlock = {
  id: number;
  blockKey: string;
  /** Parsed content, or null when a stored value no longer matches its schema. */
  content: Record<string, unknown> | null;
  rawContent: string;
  status: string;
  updatedAt: string;
  known: boolean;
};

export type AdminCmsCatalogue = {
  placements: string[];
  bannerStatuses: string[];
  blockStatuses: string[];
  blocks: { key: string; label: string; description: string }[];
};

export type AdminCmsVersion = {
  id: number;
  action: string;
  reason: string | null;
  before: unknown;
  after: unknown;
  adminName: string | null;
  createdAt: string;
};

/* --------------------------- product detail relations ----------------------- */

export type AdminProductRelations = {
  orders: {
    orderId: number;
    orderNumber: string | null;
    status: string;
    paymentStatus: string;
    quantity: number;
    unitPrice: number;
    buyerName: string | null;
    createdAt: string;
  }[];
  rentals: {
    id: number;
    status: string;
    startDate: string;
    endDate: string;
    total: number;
    renterName: string | null;
  }[];
  reviews: {
    id: number;
    rating: number;
    status: string;
    title: string | null;
    comment: string;
    authorName: string | null;
    createdAt: string;
  }[];
  reports: {
    id: number;
    reason: string;
    status: string;
    details: string | null;
    createdAt: string;
  }[];
};
