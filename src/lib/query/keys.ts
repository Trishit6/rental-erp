/** Central TanStack Query key factory — use these everywhere for cache coherence. */
export const queryKeys = {
  health: ["health"] as const,
  stats: ["stats"] as const,
  categories: ["categories"] as const,
  products: (filters: Record<string, unknown> = {}) => ["products", filters] as const,
  product: (slug: string) => ["product", slug] as const,
  /** Same-category recommendations for a product. */
  productRelated: (slug: string) => ["product", slug, "related"] as const,
  /** Date-range availability; `range` is a stable signature of the window. */
  productAvailability: (slug: string, range: string) =>
    ["product", slug, "availability", range] as const,
  auth: ["auth", "me"] as const,
  /**
   * Favourites. `["favorites"]` is the prefix every favourites entry hangs off,
   * which is also what `privateQueryKeys` evicts on logout — so no signed-in
   * user's saved items can ever be read by the next one.
   *
   *  - `favoriteIds`  the whole saved set as ids. One small request backs every
   *                   heart in the app, so no grid ever makes a request per card.
   *  - `favoriteStatus` a single product's state (used where a surface knows it
   *                   has exactly one product and no id list).
   *  - `favoritesList` one page of the wishlist, keyed by its filters + sort +
   *                   page, so pages and filter sets never share a cache entry.
   */
  favorites: ["favorites"] as const,
  favoriteIds: ["favorites", "ids"] as const,
  favoriteStatus: (productId: number) => ["favorites", "status", productId] as const,
  favoritesList: (filters: Record<string, unknown> = {}) =>
    ["favorites", "list", filters] as const,
  cart: ["cart"] as const,
  /**
   * Orders. `["orders"]` is the prefix every order-list entry hangs off, and
   * `orderAll` (`["order"]`) is the prefix every order-detail entry hangs off.
   *
   * `orderAll` exists because `["order", "*"]` is **not** a wildcard in TanStack
   * Query — its matcher is a prefix match, so a literal `"*"` element only ever
   * matches a key that literally contains `"*"`. Using it as an eviction key
   * silently evicted nothing, which left one customer's order details in the
   * cache for the next one to sign in.
   */
  orders: ["orders"] as const,
  ordersList: (filters: Record<string, unknown> = {}) =>
    ["orders", "list", filters] as const,
  orderAll: ["order"] as const,
  order: (ref: string | number) => ["order", String(ref)] as const,
  /** Prefix every payment entry hangs off; also what logout evicts. */
  payment: ["payment"] as const,
  /**
   * The server-authoritative amount. Keyed by the checkout context because the
   * figure legitimately changes with the delivery method and address, and two
   * of those must never share one cache entry.
   */
  paymentSummary: (context: Record<string, unknown> = {}) =>
    ["payment", "summary", context] as const,
  paymentMethods: ["payment", "methods"] as const,
  paymentIntent: (transactionId: number | "*") => ["payment", "intent", transactionId] as const,
  paymentStatus: (transactionId: number | "*") =>
    ["payment", "status", transactionId] as const,
  rentals: ["rentals"] as const,
  /**
   * The customer's own rentals. Keyed by the whole filter object so each tab and
   * search combination is its own cache entry. Distinct from `rentals` above,
   * which is the *owner's* view used by the seller dashboard.
   */
  rentalsList: (filters: Record<string, unknown> = {}) =>
    ["rentals", "list", filters] as const,
  rental: (id: string | number) => ["rental", String(id)] as const,
  notifications: ["notifications"] as const,
  conversations: ["conversations"] as const,
  /** Prefix for every conversation-detail entry. See the `orderAll` note above. */
  conversationAll: ["conversation"] as const,
  conversation: (id: number | string) => ["conversation", id] as const,
  reviews: (productId: number) => ["reviews", productId] as const,
  seller: (id: number | string) => ["seller", id] as const,
  myProducts: ["my-products"] as const,
  earnings: ["earnings"] as const,
  transactions: ["transactions"] as const,
  addresses: ["addresses"] as const,
  adminStats: ["admin-stats"] as const,
  adminUsers: ["admin-users"] as const,
  adminProducts: ["admin-products"] as const,
  adminReports: ["admin-reports"] as const,
  profile: ["profile"] as const,
};

/**
 * Private, user-scoped cache entries — removed on logout/session expiry so one
 * user's data never leaks into the next session. Public data (products,
 * categories, stats) is intentionally kept cached.
 */
export const privateQueryKeys = [
  queryKeys.auth,
  queryKeys.favorites,
  queryKeys.cart,
  queryKeys.orders,
  queryKeys.orderAll,
  queryKeys.payment,
  queryKeys.rentals,
  queryKeys.notifications,
  queryKeys.conversations,
  queryKeys.conversationAll,
  queryKeys.myProducts,
  queryKeys.earnings,
  queryKeys.transactions,
  queryKeys.addresses,
  queryKeys.profile,
  ["admin-stats"],
  ["admin-users"],
  ["admin-products"],
  ["admin-reports"],
] as const;
