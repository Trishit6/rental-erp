/** Central TanStack Query key factory — use these everywhere for cache coherence. */
export const queryKeys = {
  health: ["health"] as const,
  /**
   * Image-upload limits, from `GET /api/storage/config`.
   *
   * Public and deployment-fixed, so it is cached hard: no secrets, and the values
   * only change on a deploy. It exists as a key rather than a module constant so
   * the form and the storage client cannot disagree about the limits.
   */
  storageConfig: ["storage", "config"] as const,
  stats: ["stats"] as const,
  categories: ["categories"] as const,
  products: (filters: Record<string, unknown> = {}) => ["products", filters] as const,
  product: (slug: string) => ["product", slug] as const,
  /**
   * Prefix every product-detail entry hangs off.
   *
   * Needed because a review write changes `ratingAverage`/`ratingCount`, which
   * are cached on the product row and read by the card badge. `["product", "*"]`
   * would *not* work: TanStack matches by prefix, so a literal `"*"` element only
   * matches keys that literally contain it (the same trap as `orderAll`).
   */
  productAll: ["product"] as const,
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
  favoritesList: (filters: Record<string, unknown> = {}) => ["favorites", "list", filters] as const,
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
  ordersList: (filters: Record<string, unknown> = {}) => ["orders", "list", filters] as const,
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
  paymentStatus: (transactionId: number | "*") => ["payment", "status", transactionId] as const,
  rentals: ["rentals"] as const,
  /**
   * The customer's own rentals. Keyed by the whole filter object so each tab and
   * search combination is its own cache entry. Distinct from `rentals` above,
   * which is the *owner's* view used by the seller dashboard.
   */
  rentalsList: (filters: Record<string, unknown> = {}) => ["rentals", "list", filters] as const,
  rental: (id: string | number) => ["rental", String(id)] as const,
  /**
   * Notifications — the bell, the feed page and the preferences form.
   *
   * `["notifications"]` is the prefix everything hangs off, so one `invalidateQueries`
   * after any notification write reconciles the badge, the dropdown and the page at
   * once (and logout eviction clears all three, which is why it is a prefix rather
   * than three unrelated keys).
   *
   * `notificationsRoot` is spelled out separately from the function below for the
   * same reason as `myReviewsRoot`: the *shape* of a list key includes the filters,
   * and eviction needs a fixed prefix to match against.
   */
  notifications: ["notifications"] as const,
  /**
   * Prefix every page of the feed hangs off, filters and page included.
   *
   * Separate from `notifications` so an optimistic write can patch *every cached page*
   * at once (`setQueriesData`) — a user who marks one read while filtered to "Orders"
   * and then clears the filter must not find it unread again.
   */
  notificationsListRoot: ["notifications", "list"] as const,
  /** The unread badge's own number — never derived from a page of the feed. */
  notificationUnreadCount: ["notifications", "unread-count"] as const,
  /** One page of the feed. Filters are part of the key so pages never collide. */
  notificationsList: (filters: Record<string, unknown> = {}) =>
    ["notifications", "list", filters] as const,
  /** The signed-in user's channel settings. */
  notificationPreferences: ["notifications", "preferences"] as const,
  conversations: ["conversations"] as const,
  /**
   * The orders and rentals a conversation may be attached to.
   *
   * Under `["conversations"]` rather than under `orders`/`rentals` deliberately: this
   * is not an order or rental, it is a picker of ids the messaging write path has
   * approved. Evicting the whole orders family to clear it would be wrong.
   */
  conversationContext: ["conversations", "context"] as const,
  /** Prefix for every conversation-detail entry. See the `orderAll` note above. */
  conversationAll: ["conversation"] as const,
  conversation: (id: number | string) => ["conversation", id] as const,
  /**
   * One conversation's transcript, at `/messages`.
   *
   * A separate root from `conversations` because the two pages disagree about what a
   * key means: the list is "every thread the session user is in" (one entry, refetched
   * on a poll) while a transcript is a paged read of one thread. Collapsing them would
   * let the list's invalidation blank a transcript and vice versa.
   */
  messages: ["messages"] as const,
  messageList: (conversationId: number, page: number) =>
    ["messages", String(conversationId), page] as const,
  /**
   * The signed-in user's own history as a timeline.
   *
   * Private like everything else here: it is assembled from the user's orders, rentals,
   * reviews and listings, which is purchase history. It is not an administrative log
   * and holds no other person's activity.
   */
  activity: ["activity"] as const,
  activityList: (params: Record<string, unknown> = {}) => ["activity", "list", params] as const,
  /**
   * Reviews.
   *
   * `["reviews", productId]` is the **prefix** every entry for one product hangs
   * off — the list, the summary and the viewer's eligibility — so a write that
   * changes a product's rating can reconcile all three with one targeted
   * invalidate instead of guessing at three key shapes.
   *
   * The keys deliberately live under the *product* id rather than a flat
   * `["reviews"]` list: a shopper who pages through product A's reviews must not
   * evict product B's, and a product page that is revisited renders instantly.
   *
   * `myReviews` and `reviewsModeration` are private (see `privateQueryKeys`) —
   * they are one customer's own words and the admin queue.
   */
  reviews: (productId: number) => ["reviews", productId] as const,
  reviewsList: (productId: number, filters: Record<string, unknown>) =>
    ["reviews", productId, "list", filters] as const,
  reviewsSummary: (productId: number) => ["reviews", productId, "summary"] as const,
  myReviews: (filters: Record<string, unknown> = {}) => ["reviews", "mine", filters] as const,
  /** Reviews of the signed-in seller's own listings. Private. */
  sellerReviews: (filters: Record<string, unknown> = {}) => ["reviews", "seller", filters] as const,
  /** The admin moderation queue. Private. */
  reviewsModeration: (filters: Record<string, unknown> = {}) =>
    ["reviews", "moderation", filters] as const,
  /**
   * Whether the signed-in user may review a product, and which of their order
   * lines to attach it to.
   *
   * Under its own root rather than `["reviews", productId]` on purpose: it is
   * derived from *the viewer's orders*, so it must be evictable by prefix on
   * logout. Hanging it off a product id would make that impossible without
   * evicting every product's public reviews as collateral.
   */
  reviewsEligibility: (productId: number) => ["reviews-eligibility", productId] as const,
  /**
   * One review by id.
   *
   * Under `["reviews", "single"]` rather than a product id because the order
   * page's "Edit your review" control holds a review id long before it knows
   * which product it belongs to — and a key that needs a product id the caller
   * does not have is a key that ends up faked.
   */
  reviewSingle: (reviewId: number) => ["reviews", "single", reviewId] as const,
  /**
   * A seller's **public** shopfront — `GET /api/sellers/:id`.
   *
   * Namespaced under `["seller", "public", …]` rather than a bare
   * `["seller", id]` so it cannot collide with `sellerMe` below, and so the whole
   * public family has a prefix of its own to invalidate when a seller edits
   * their bio. Public: no private content, so it stays cached across sessions
   * like the catalogue does.
   */
  sellerPublic: ["seller", "public"] as const,
  seller: (id: number | string) => ["seller", "public", String(id)] as const,
  /**
   * The seller workspace — everything the signed-in seller manages.
   *
   * Nested under `["seller", "me"]` rather than a flat `["seller"]` because
   * `seller(id)` above is a **public** key (the shopfront a visitor reads) and
   * `["seller"]` is a prefix that would match it. Putting the private surface
   * under its own segment means logout eviction hits every seller entry and none
   * of the public shopfronts, and it removes the ambiguity of a numeric id
   * sitting next to a string scope.
   */
  sellerMe: ["seller", "me"] as const,
  /** Whether the viewer is a seller, and what their shopfront says. */
  sellerOnboarding: ["seller", "me", "onboarding"] as const,
  /** Dashboard cards. Private: a stranger's earnings must never be readable. */
  sellerSummary: ["seller", "me", "summary"] as const,
  sellerAnalytics: (params: Record<string, unknown> = {}) =>
    ["seller", "me", "analytics", params] as const,
  /** Prefix every seller-listing entry hangs off — list pages and one product. */
  sellerProducts: ["seller", "me", "products"] as const,
  sellerProductsList: (filters: Record<string, unknown> = {}) =>
    ["seller", "me", "products", "list", filters] as const,
  sellerProduct: (id: number) => ["seller", "me", "products", "detail", id] as const,
  /** Orders containing this seller's lines — never the customer's own orders. */
  sellerOrders: ["seller", "me", "orders"] as const,
  sellerOrdersList: (filters: Record<string, unknown> = {}) =>
    ["seller", "me", "orders", "list", filters] as const,
  sellerOrder: (ref: string | number) => ["seller", "me", "orders", "detail", String(ref)] as const,
  /** Rentals of this seller's own listings (`role=owner`), not the ones they rent. */
  sellerRentals: ["seller", "me", "rentals"] as const,
  sellerRentalsList: (filters: Record<string, unknown> = {}) =>
    ["seller", "me", "rentals", "list", filters] as const,
  /** The caller's own shopfront (bio, location, response time). */
  sellerProfile: ["seller", "me", "profile"] as const,
  /**
   * The seller wallet — balances, the ledger, payouts and saved destinations.
   *
   * Nested under `sellerMe` rather than given its own root, for the reason the rest
   * of this file's private surface is: logout eviction clears the whole
   * `["seller","me"]` prefix, so **one seller's balance can never be read from the
   * store by the next one to sign in on a shared machine**. A wallet is not
   * especially sensitive the way a card number is, but "₹84,200 available" belongs to
   * exactly one person and no other.
   *
   * `walletAll` is the prefix every wallet entry hangs off, including the per-payout
   * and per-method detail keys — so one invalidate after a payout request reconciles
   * the balance card, the ledger row, the payout list and the detail panel at once.
   * There is deliberately no `wallet("*")` shortcut: TanStack matches by prefix, so a
   * literal `"*"` element only matches keys that literally contain one (the same trap
   * as `orderAll`).
   */
  walletAll: ["seller", "me", "wallet"] as const,
  walletOverview: (params: Record<string, unknown> = {}) =>
    ["seller", "me", "wallet", "overview", params] as const,
  walletTransactions: (filters: Record<string, unknown> = {}) =>
    ["seller", "me", "wallet", "transactions", filters] as const,
  walletTransaction: (id: number) =>
    ["seller", "me", "wallet", "transactions", "detail", id] as const,
  walletPayouts: (filters: Record<string, unknown> = {}) =>
    ["seller", "me", "wallet", "payouts", filters] as const,
  walletPayout: (ref: string) => ["seller", "me", "wallet", "payouts", "detail", ref] as const,
  walletMethods: ["seller", "me", "wallet", "methods"] as const,
  earnings: ["earnings"] as const,
  transactions: ["transactions"] as const,
  addresses: ["addresses"] as const,
  /**
   * Review entries that are one person's own words or one seller's own
   * customers: the review history, the seller's queue and the moderation queue.
   * Each is a real prefix, so one `invalidateQueries` on logout clears all of
   * them. The *public* product reviews (`["reviews", productId]`) are
   * deliberately absent — those are public data and stay cached, like products.
   */
  myReviewsRoot: ["reviews", "mine"] as const,
  reviewsSingleRoot: ["reviews", "single"] as const,
  sellerReviewsRoot: ["reviews", "seller"] as const,
  reviewsModerationRoot: ["reviews", "moderation"] as const,
  reviewsEligibilityRoot: ["reviews-eligibility"] as const,
  adminStats: ["admin-stats"] as const,
  adminUsers: ["admin-users"] as const,
  /**
   * Root of the admin catalogue. The catalogue's own keys are built by
   * `features/admin/query.ts` from this prefix, because every filter, sort and page
   * is a distinct cache entry and the filter type belongs to that feature.
   */
  adminProducts: ["admin-products"] as const,
  adminReports: ["admin-reports"] as const,
  adminProductFacets: ["admin-products", "facets"] as const,
  /**
   * The rest of the admin workspace: one root per section, each a real prefix so
   * a write in one section invalidates its own lists and nothing else. All of
   * them are private (see `privateQueryKeys` below) — an admin table shows other
   * people's data, and the next person to open the workspace on a shared machine
   * must not inherit the previous admin's rows.
   */
  adminOrders: ["admin-orders"] as const,
  adminRentals: ["admin-rentals"] as const,
  adminSellers: ["admin-sellers"] as const,
  adminFinance: ["admin-finance"] as const,
  adminTransactions: ["admin-transactions"] as const,
  adminReviews: ["admin-reviews"] as const,
  adminCategories: ["admin-categories"] as const,
  adminProductImages: ["admin-product-images"] as const,
  adminAuditLog: ["admin-audit-log"] as const,
  /**
   * The `/api/health` probe the admin dashboard's system-status card reads. It is
   * scoped under the admin prefix so the status shown in the workspace is never
   * mistaken for storefront data.
   */
  adminHealth: ["admin-health"] as const,
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
  // The bell's badge, the feed page, the preferences form and every conversation
  // transcript are one person's private correspondence and history. All of them hang
  // off prefixes here so logout clears them together — a shared machine is the normal
  // case for a marketplace demo, not the exception.
  queryKeys.notifications,
  queryKeys.conversations,
  queryKeys.conversationAll,
  queryKeys.messages,
  queryKeys.activity,
  queryKeys.sellerMe,
  // `sellerMe` already covers every wallet key, so this is belt-and-braces rather
  // than load-bearing. It is listed explicitly because the wallet is the surface
  // where a leak would be most obviously wrong, and a reader should be able to see
  // that without tracing the `sellerMe` prefix.
  queryKeys.walletAll,
  queryKeys.earnings,
  queryKeys.transactions,
  queryKeys.addresses,
  queryKeys.profile,
  queryKeys.myReviewsRoot,
  queryKeys.reviewsSingleRoot,
  queryKeys.sellerReviewsRoot,
  queryKeys.reviewsModerationRoot,
  queryKeys.reviewsEligibilityRoot,
  ["admin-stats"],
  ["admin-users"],
  ["admin-products"],
  ["admin-reports"],
  ["admin-orders"],
  ["admin-rentals"],
  ["admin-sellers"],
  ["admin-finance"],
  ["admin-transactions"],
  ["admin-reviews"],
  ["admin-categories"],
  ["admin-product-images"],
  ["admin-audit-log"],
  ["admin-health"],
] as const;
