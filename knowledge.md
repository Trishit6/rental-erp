# knowledge.md — Revaro Marketplace

## What this is
**Revaro** (`revaro-marketplace`, tagline *Rent. Buy. Sell. Reuse.*) — a full-stack
neighbour-to-neighbour rent/buy/sell marketplace.
React 19 + Vite + TanStack (Router/Query/Form/Table) frontend · Hono API · Drizzle ORM · MariaDB.
Package manager: **pnpm**. Currency: **INR (₹)**, all money stored as integer paise.

## Feature-module architecture (IMPORTANT)
All UI features live in `src/features/<feature-name>/` with a **mandatory structure**:

```
features/<feature-name>/
├── components/        # feature-specific UI (+ schema.ts when the feature has forms)
├── api.ts             # all HTTP calls for the feature (via lib/api client)
├── query.ts           # TanStack Query hooks (queryFn calls api.ts, never fetch directly)
├── types.ts           # feature-specific types (Zod-inferred where possible)
├── index.tsx          # page composition — layout + hooks wired to components
└── (route.tsx)        # only for single-route features
```

Features: home, browse, product-details, **categories**, pre-loved, rentals, favorites, cart,
checkout, **auth** (login+register+session state), sell, profile, seller-dashboard (+ earnings.tsx,
profile.tsx), seller-listings, seller-orders, seller-rentals, messages, admin, how-it-works.

The global floating assistant (Loop) was **removed**: its client feature, its `/api/chat`
route, its knowledge base and its stylesheet block are gone, along with the `/api/chat`
mount in `server/index.ts`. Nothing else referenced it, so no replacement was written —
questions that used to reach it are served by `/how-it-works`, `/messages` and the FAQ
copy in the help sections.

**Shared product-search / filter layer** (added with Feature 06; both Browse and the category
pages use it, because feature-to-feature imports are forbidden and copying the filter UI would
defeat the point):
- `src/lib/product-search/types.ts` — `ProductSearch` (URL state), `ProductFilters` (the request
  `GET /api/products` receives), `ActiveFilter`, `ConditionFilterValue`.
- `src/lib/product-search/schema.ts` — the ONLY URL schema for product search:
  `parseProductSearch` (never throws), `toProductFilters(search, pageSize, categorySlug?)`,
  `toProductUrlSearch`, `activeProductFilters`, `CLEARED_PRODUCT_FILTERS`, the option lists
  (`MODE_OPTIONS`/`CONDITION_OPTIONS`/`AVAILABILITY_OPTIONS`/`SORT_OPTIONS`), `PRODUCT_PAGE_SIZE`.
  Browse's route uses `parseProductSearch` directly as its `validateSearch`.
- `src/components/shared/product-filters/` — the shared UI: `FilterPanel` (desktop sidebar),
  `MobileFilterSheet`, `CategoryFilter` (title configurable, so a category page renders it as
  "Subcategory"), `ListingTypeFilter`, `PriceFilter`, `ConditionFilter`, `AvailabilityFilter`,
  `SortSelect`, `SearchBar`, `ActiveFilters`, `ChoiceChip` (+ `FilterGroup`/`FilterClear`).
  `FilterPanel`/`MobileFilterSheet` take a `leadGroup` render-prop slot for the one scope-specific
  group a feature adds; `ActiveFilters` takes its pills as a prop for the same reason.
  There is deliberately no browse-local copy of any of these.

Auth architecture (single source of truth):
- `features/auth/query.ts` — `authMeQuery()` (`["auth","me"]`, staleTime 5m, retry false) is THE
  auth state. `useCurrentUser` consumes it; login/register mutations `setQueryData` the user;
  logout mutation calls the API then `removeQueries` on every `privateQueryKeys` entry (private
  cache eviction; public cache like products/categories survives).
- `lib/auth/auth-context.tsx` — thin context derived from the query (`user`, `loading`, `refresh`);
  do not create a second auth state store.
- `main.tsx` renders an `AuthGate` spinner instead of the router while `loading` — no login flash.
- Guards (`lib/auth/guards.ts`) support redirect preservation: unauthenticated →
  `/login?redirect=<path>`; login consumes the param and navigates there after success.
- While auth is resolving, guards redirect to `/auth-check` (a waiting room that bounces back via
  `router.invalidate()` once state settles).
- Sessions: server stores SHA-256 token hash as `sessions.id` (raw token only in the httpOnly
  cookie), `lastUsedAt` touched on use, `requireRole(...)` helper for authorization; registration
  always creates role USER server-side; rate limits 5/min register, 10/min login keyed by
  x-forwarded-for.

Rules:
- Routes (`src/routes/`) stay thin: `createFileRoute(...)` + component from the feature + guards.
- No `fetch()` in components — always `features/*/api.ts` → `src/lib/api/client.ts`.
- Forms use TanStack Form + Zod; the Zod schema in `features/*/components/schema.ts` is the single
  validation source (login, register are the reference examples).
- Feature-to-feature imports are forbidden; use shared components (`src/components/shared/`) or libs.
- No demo/fake data arrays in feature code (the legacy `lib/listings.ts` dead code was removed).

## Commands
```bash
pnpm install        # install deps
pnpm dev            # Vite (:5173) + tsx watch API (:3001) concurrently
pnpm build          # type-checks BOTH tsconfigs (noEmit) then vite build
pnpm typecheck      # tsc app + server, no emit
pnpm lint           # eslint flat config
pnpm test           # vitest (unit + component tests; see `tests/setup.ts` for jsdom polyfills)
pnpm generate:routes  # regenerate src/routeTree.gen.ts (tsr generate) — auto-runs via Vite plugin too
pnpm db:create      # create the reloop database (server/db-create.ts)
pnpm db:generate    # drizzle-kit generate (migrations into drizzle/)
pnpm db:migrate     # apply migrations
pnpm db:seed        # reset + seed demo data (TRUNCATEs all tables first)
pnpm db:harvest-images   # refresh real Unsplash URLs -> server/data/product-images.json
pnpm db:seed:products    # append 20k bulk products (PRODUCT_COUNT / CLEAR_PRODUCTS / SEED env)
pnpm db:studio      # drizzle studio
pnpm start:api      # API only, no Vite
```Verify in this order — **typecheck → lint → test**. `pnpm build` type-checks both tsconfigs before
`vite build`, so a type error blocks the build. The suite is 68 files / 1215 tests (~2.5 min); one
file is `pnpm exec vitest run tests/pricing.test.ts` (add `-t "name"` for a single test). The repo is
git-managed (remote: `github.com/Trishit6/rental-erp`) but has **no CI workflow**, so verification
is local only — never rely on a push to catch a break.

**Branding**: the product is **Revaro** (`Rent. Buy. Sell. Reuse.`). The MariaDB database name is
still `reloop` — a frozen internal identifier that changing would force a data migration on every
existing install, so it is deliberately left alone.

**Do not run `pnpm db:push` in this repo.** It applies the schema directly to the database and
writes *no* migration file, so it silently diverges from the committed `drizzle/` history.

## Setup (first run)
1. MariaDB on **localhost:3307**, credentials in `.env` (never committed).
2. Copy `.env.example` → `.env`. Two accepted layouts:
   - split vars: `DB_HOST`, `DB_PORT=3307`, `DB_USER`, `DB_PASSWORD`, `DB_NAME=reloop`
   - or single `DATABASE_URL` (takes precedence)
3. `pnpm db:create && pnpm db:migrate && pnpm db:seed`, then `pnpm dev`.
   `db:migrate` is **required** for the category taxonomy (`drizzle/0002_*`) — the categories API
   selects those columns, so the app 500s on `/api/categories` until it has been applied. Running
   only the migration is safe: existing categories become active, keep a null icon (the name-based
   icon fallback covers the 12 legacy names) and are simply never featured. `pnpm db:seed` is what
   adds the parents/children, icons, images and featured flags — and it TRUNCATEs everything.
4. Demo logins (seeded): `admin@revaro.local`, `seller@revaro.local`, `buyer@revaro.local`,
   `daniel@`, `priya@`, `sara@revaro.local` — password `revaro-dev-2026` (dev only, in README).

## Migration history (`drizzle/`)
- `0000_*` initial schema · `0001_*` `sessions.lastUsedAt`.
- `0002_*` **category taxonomy** (`imageUrl`, `icon`, `parentId`, `sortOrder`, `isFeatured`,
  `isActive`) — **required**, or `/api/categories` 500s because the API selects those columns.
- `0003_*` `cart_items.unit_price_snapshot` (price-change display only, never a price source) plus
  the two `updated_at` columns.
- `0004_*` `orders.order_number` (unique, public `RV-YYYY-XXXXXX`) + `orders.payment_status`, the
  `transactions` idempotency/ledger columns, and the per-line `order_items.rental_charge` /
  `security_deposit` snapshots.
- `0005_*` rental lifecycle timestamps (`return_requested_at`, `completed_at`,
  `extension_requested_at` / `_days`) — all nullable, all recording an event that *happened*, never a
  predicted one.
- `0006_*` `rental_events` — the rental timeline's real history (see Rentals below).
- `0007_*` **the listing lifecycle** — a *data* migration: every `products.status`
  `ACTIVE` is rewritten to `PUBLISHED` and `SOLD` (settable by the admin endpoint and
  understood by nothing else) to `ARCHIVED`, then the column default becomes `DRAFT`.
  **Required**: skip it and the public queries ask for `PUBLISHED` while every row still
  says `ACTIVE`, so the entire catalogue silently vanishes from Browse.
- `0008_*` `products.specifications` (nullable JSON text) and
  `seller_profiles.location` / `updated_at`. Purely additive.
- `0009_*` `order_items.fulfillment_status` + `order_items.cancellation_reason` —
  **per-line** seller fulfillment. Purely additive (both nullable), which is what lets
  the existing customer-facing `orders.status` stay untouched.

Schema change flow: edit `server/schema.ts` → `pnpm db:generate` → `pnpm db:migrate`.

## Architecture
- **Frontend** (`src/`): Vite + React 19 + Tailwind CSS 4 (`@tailwindcss/vite`, theme in `src/styles.css`).
  - **File-based routing** via `@tanstack/router-plugin/vite` (configured in `vite.config.ts`, plugin
    order: tanstackRouter BEFORE react). Route files in `src/routes/` are thin; `src/routeTree.gen.ts`
    is generated (do not edit; regenerate with `pnpm generate:routes`). `tsr.config.json` feeds the CLI.
  - `__root.tsx` defines router context `{ user, queryClient }`, not-found + error components.
  - **Layouts**: single chrome layout via `__root.tsx` (SiteHeader + SiteFooter for ALL pages,
    including login/register — do not add a second header). Pathless `_auth.tsx` layout renders
    NO chrome of its own; it exists only to apply the `requireGuest` guard to login/register and
    carries the `redirect` search param. URLs stay `/login`, `/register`.
  - Guards in `src/lib/auth/guards.ts` (`requireAuth`, `requireAdmin`, `requireGuest`) used in
    `beforeLoad`. Router context updates when auth resolves, re-running guards (standard
    TanStack auth pattern; brief guest-page flash possible after hard refresh while signed in).
  - Auth context: `src/lib/auth/auth-context.tsx` — user state, login/register/logout/refresh.
  - Query: `src/lib/query/client.ts` (factory: staleTime 1m, gcTime 10m, retry 1, no refetchOnWindowFocus),
    `providers.tsx` (AppProviders), `keys.ts` (central query-key factory — always use it).
  - `src/lib/api/client.ts` — envelope-aware fetch wrapper (`{success,data,error,pagination}`),
    throws `ApiError(code,message,status)`. All requests `credentials: include`, relative `/api` paths.
  - `src/lib/pricing.ts` — shared money/rental math in integer paise; **included by BOTH tsconfigs**
    (tsconfig.server.json lists it explicitly). Keep it dependency-free.
  - Path alias `@/*` → `src/*` (vite.config.ts + tsconfig.app.json).
  - Global components: `src/components/ui/` (shadcn-style primitives, neumorphically styled),
    `src/components/layout/` (site-header, site-footer), `src/components/shared/` (product-card,
    product-grid, empty-state, pagination, **product-filters/**).
- **Backend** (`server/`): Hono on @hono/node-server, run by tsx (no build step).
  - `index.ts` — `app.onError(onErrorHandler)` (in `server/lib/api.ts`) handles ALL errors →
    `{success:false,error:{code,message}}`. `attachUser` middleware resolves session cookie.
  - `lib/auth.ts` — sessions store a SHA-256 hash of the token (`sessions.id`) with the raw
    random token only in the HTTP-only cookie `revaro_session`, 30-day TTL. `requireUser`/
    `requireAdmin`/`requireRole(...)` throw `HttpError`.
  - `schema.ts` — 22 tables. Money columns are `int` paise. `rental_events` is the one
    append-only history table (see Rentals below).
  - `routes/orders.ts` — rental availability engine: `overlappingRentalCount` +
    `assertRentalAvailability`; order creation is a DB transaction with `FOR UPDATE` row locks.
    Rent-to-own: `POST /api/rentals/:id/buy` applies `rentCreditPercentage` capped by `rentCreditCap`.
  - `routes/products.ts` — search with filters/sort/pagination; `productCardColumns` includes a
    correlated subquery for primaryImage.
  - `lib/config.ts` — platform fees + delivery fee (4900 paise) from env, never exposed to client.
- **Vite** proxies `/api/*` → `localhost:3001`. Client always uses relative `/api/...` URLs.
- **Theme system** (`src/lib/theme/`): tokens in `src/styles.css` (`:root` light, `.dark` overrides;
  all neumorphic surfaces use `--shadow-color-dark/light`, `--inset-bg`, `--divider` etc. — never
  hardcode shadow hexes). `ThemeProvider` (in main.tsx above AuthProvider) persists preference to
  `localStorage["revaro-theme"]` (light|dark|system, default system), follows OS changes, and
  `applyThemeToDom` toggles the `.dark` class on `<html>`. `ThemeToggle` (navbar, desktop + mobile
  menu) cycles the three; an inline script in `index.html` applies the class pre-paint (no flash).
  Dark palette: bg `#171512`, card `#211f1b`, fg `#f6efe5`, muted `#b9b0a4`, primary `#c97b4a`.
  Vitest environment is jsdom with `tests/setup.ts` (jest-dom matchers, `matchMedia`/
  `ResizeObserver`/`scrollTo` stubs, RTL cleanup). Component tests mock `@tanstack/react-router`
  with a plain `<a>` so they need no router instance.
- **Home feature**: sections each own their query/loading/empty/error states (`ProductSection`
  is the shared section shell). `homeKeys` factory in `features/home/query.ts` caches public data
  5–10 min. `FloatingActions` = fixed bottom-right dock (cart badge from real cart query, browse,
  sell/login), `.floating-dock` class provides glassy neumorphic backdrop. Navbar elevates on
  scroll (shadow via `--shadow-color-dark`).
- **Browse (Feature 04) — the URL is the single source of truth.** Every filter, the sort order and
  the page live in search params, so refresh, back/forward and shared links reproduce the view.
  Canonical params: `search`, `category`, `mode`, `condition`, `availability`, `minPrice`,
  `maxPrice`, `sort`, `page`. Legacy `q`/`type` are still accepted and normalized
  (`type=SALE|RENT|BOTH` → `mode=buy|rent|rent-and-buy`), so older links keep working.
  - Validation lives in `lib/product-search/schema.ts` (`parseProductSearch`, wired as the route's
    `validateSearch`). It accepts the number-or-string shapes TanStack Router produces and
    **never throws** — unusable params are dropped, and a reversed price range is swapped.
  - **URL prices are rupees; the API takes paise.** `toBrowseFilters()` does the conversion with
    `rupeesToPaise` — never pass a URL price straight to the API.
  - `mode` semantics: `rent` → listingType IN (RENT, BOTH), `buy` → (SALE, BOTH),
    `rent-and-buy` → exactly BOTH. Price bounds follow the mode server-side (rent compares the daily
    rate, buy the sale price, no mode matches either) so a rent filter can't match a sale price.
  - `condition` uses the **database enum** (NEW/LIKE_NEW/GOOD/FAIR/USED) plus the `pre-loved`
    shortcut, which the API expands to the used conditions. No second condition vocabulary.
  - `availability` (available-now / for-rent / for-buy) is derived only from `available_quantity`,
    which the DB actually tracks.
  - **Clear all** drops every filter *and* the sort but **keeps the search term** (the field has its
    own clear button); the empty state offers both. `page` is navigation, not a filter, and is
    excluded from the filter count/badge.
  - Files: `components/` (BrowseHeader, BrowseEmptyState, BrowseErrorState, ProductGrid),
    plus `api.ts`, `query.ts`, `types.ts`, `index.tsx`, `route.tsx`. `src/routes/browse.tsx` stays
    thin and spreads `browseRouteOptions` from the feature. `types.ts` is now only a facade that
    fixes Browse's local names (`BrowseSearch`, `BrowseFilters`) onto the shared shapes.
  - **Reuse, don't duplicate**: Browse renders the shared `ProductCard`/`ProductGrid` skeleton and the
    shared `Pagination`/`EmptyState`, and every filter control comes from
    `components/shared/product-filters/` (see the shared layer above). `ProductCard` takes an optional
    `mode` (rent leads with the daily rate, buy with the sale price) and an `onPrefetch`;
    `ProductGrid` exports `productGridClassName` so columns stay in one place. There is deliberately
    **no** browse-local ProductCard or filter group.
  - **Caching & prefetch**: `browseKeys.products(filters)` embeds every server filter, so each page
    and each filter combination is its own cache entry — the first visit hits the database and
    returning to a previously viewed page/filter set renders from cache. `staleTime` 5 min /
    `gcTime` 30 min, `placeholderData: previous` holds the current results (dimmed via
    `isRefreshing`) instead of flashing skeletons, pagination prefetches on hover/focus, and
    hovering a card prefetches that product's detail into the product-details cache entry.
    The contract is unit-tested in `tests/browse-cache.test.ts`.
  - Search is debounced (400ms) and committed with `replace: true`, so typing doesn't pile up
    history entries.
- **Product Details (Feature 05)** — route `/product/$slug` (a slug *or* numeric id; the backend
  resolves both, so `productIdSchema` validates rather than assumes a number). `route.tsx` exports
  `productRouteOptions` and `src/routes/product.$slug.tsx` just spreads them.
  - `index.tsx` is composition only. All logic lives in `components/schema.ts` (modes, rental
    window, quantity clamping, cart payload, stock state, specs, review summary — all unit-tested)
    and `query.ts` (`useProductActions` owns the guest→login guard, cart mutation, checkout
    hand-off and the pending button id shared by the desktop and mobile action bars).
  - Listing mode comes from `supportedModes`/`resolveListingMode`, so a rent-only item never shows
    a Buy tab; the chosen mode is transient React state (not in the URL). Rental duration options
    are derived from the product's own min/max window via `buildRentalOptions`.
  - The detail fetch is the shared `productDetailQueryOptions` in `lib/query/products.ts` — the
    same entry Browse prefetches on hover, so a visited product renders from cache instantly. Do
    not add a second detail fetch in the feature's `api.ts`.
  - Availability for the selected rental window comes from `GET /api/products/:id/availability`
    (the same engine checkout uses); `Available`/`Limited`/`Out of stock` map to `stockState`.
  - A 404 renders `ProductDetailsEmpty` (not the error state); other failures render
    `ProductDetailsError`, whose retry refetches the query — never a page reload.
- **Categories (Feature 06)** — `/categories` and `/categories/$categorySlug`. Directory routes:
  `src/routes/categories/index.tsx` (id `/categories/`) and `src/routes/categories/$categorySlug.tsx`.
  `route.tsx` exports `categoriesRouteOptions` + `categoryDetailRouteOptions`; the detail route's
  `validateSearch` is the category-scoped parser.
  - **The taxonomy is a real two-level tree in the database.** `drizzle/0002_*` adds `image_url`,
    `icon`, `parent_id` (self-FK, `ON DELETE SET NULL`), `sort_order`, `is_featured`, `is_active`,
    `updated_at` to `categories` (all nullable/defaulted, so it is a safe additive migration), plus
    an index on `parent_id`. **The migration is required — the API selects these columns.**
    `pnpm db:seed` rebuilds the taxonomy: 9 parents (electronics, furniture, home, fashion, gaming,
    sports, music, tools, vehicles) and 6 children (laptops/phones/cameras/audio under electronics,
    appliances under home, outdoor under sports). Every original slug survives, so
    `seed-products.ts`'s `CATEGORY_META` still resolves. `imageUrl` is taken from the committed
    `server/data/product-images.json` pools (real Unsplash URLs); categories without a pool keep
    `imageUrl = null` and fall back to their icon.
  - **`icon` is a whitelist key, never a component name.** `CategoryIcon` maps `"sofa"`/`"camera"`/
    `"washing-machine"`/… through `ICON_BY_IDENTIFIER`, then falls back to `ICON_BY_NAME` (the 12
    legacy names), then to `Package`. An unknown or hostile string can only reach the fallback.
    Rendering the lookup inside a component body trips the React Compiler's
    `react-hooks/static-components` rule, so the resolution happens in a plain helper
    (`renderCategoryGlyph`) that returns the element.
  - **Endpoints** (`server/routes/products.ts`, `categoriesRoute`): `GET /api/categories`
    (active only, ordered by `sortOrder` then name, every row carrying `productCount` +
    `subcategoryCount`; `?featured=true` returns the curated rail),
    `GET /api/categories/:idOrSlug` (numeric id or slug; `404` when unknown or inactive; includes
    `parent` so breadcrumbs need one request), `GET /api/categories/:idOrSlug/subcategories`.
    `productCount` counts ACTIVE products via one `GROUP BY` and **rolls up descendants** in memory
    over the handful of category rows (never a product list in JS). Product search now also requires
    the matched category to be active, so a retired category matches nothing.
  - **Category products reuse the products endpoint**: `GET /api/products?category=<slug>`, already
    filtered/sorted/paginated server-side. A subcategory filter is a category one level down, so
    `toProductFilters(search, pageSize, categorySlug)` lets `subcategory` REPLACE the route's
    category rather than stacking.
  - **Query keys**: `categoryKeys.list === queryKeys.categories` (the entry Home and Browse already
    populate, so Home → Categories → a category → back never refetches the list),
    `["categories","detail",slug]`, `["categories","subcategories",slug]`,
    `["categories","featured"]`, and **`categoryKeys.products(filters) === queryKeys.products(filters)`**
    — a category page *is* a scoped product request, so there is one product key namespace, not two.
    Categories are 10 min fresh / 60 min retained; results 5/30 with `placeholderData: previous`.
    `useCategoryProducts(filters, enabled)` exists so an unknown slug never fires a doomed request.
  - `parseCategorySearch` deliberately **drops `?category=`**: the route owns the category, so a
    hand-edited link cannot point the results at a different category than the page claims.
    `parseCategorySlug` validates the route param (lowercase-hyphen or numeric) and yields
    `undefined` for anything else, which renders the not-found state without calling the API.
  - Error handling: 404 → `CategoryNotFound`; anything else → `CategoryErrorState` whose retry
    refetches only that query. `/categories` loads categories only (no products); hovering a card
    prefetches that one category's detail + subcategories, never a product grid.
  - Home still links its category chips to `/browse?category=<slug>` (deliberate choice) —
    `/categories` is reachable from the breadcrumb, the featured rail's "All categories" link and
    direct URL.
  - Tests: `tests/categories-{schema,api,cache,components,products,page}.test.tsx` with
    `tests/support/category-fixtures.ts`. Route/`Link` mocks substitute `params` into `href`
    (so hrefs are asserted for real) and forward `...rest` (so hover prefetch is exercised).
- **Favorites / Wishlist (Feature 07)** — `/favorites`, plus the heart that appears on every
  product card. **There is exactly one favorite system; do not add a second.**
  - **The one state source is `src/lib/query/favorites.ts`.** It is a `lib/` module (not a
    feature) precisely because Home, Browse, Categories, Product Details, Related products and
    the wishlist all consume it. Components never hold their own favorite `useState`.
  - **One control: `features/favorites/components/FavoriteButton.tsx`.** It exports
    `FavoriteButton` (creates its own controller) and `FavoriteControl` (presentational, for a
    page that owns one controller and renders it in two places — the product page's header heart
    and its mobile bar). `components/shared/product-card.tsx` renders the central button, so Home,
    Browse, Categories and Related get it for free. The old
    `product-details/components/FavoriteButton.tsx` was **deleted** — do not resurrect it.
  - **No N+1, by two mechanisms.** (1) `GET /api/products` (+ detail, + related) return
    `isFavorited` inline via a correlated `EXISTS` (`isFavoritedColumn` / `normalizeProductCard`
    in `server/routes/products.ts`), so a card is correct on first paint. (2) Every heart then
    reads the one shared `queryKeys.favoriteIds` entry (`GET /api/favorites/ids`). A 20-card grid
    makes **zero** extra requests. `api.ts`'s `checkFavorite` exists for single-product callers
    only — calling it per card is the anti-pattern.
  - **Keys** hang off the `["favorites"]` prefix, which is what `privateQueryKeys` evicts on
    logout — so one user can never inherit another's saved items. `favoritesList(filters)` embeds
    filters + sort + page, so pages never share a cache entry.
  - **Optimistic with real rollback.** `useFavoriteMutation` snapshots ids + every list page in
    `onMutate`, writes the new state, and on failure **restores the snapshot** (`restoreListPages`
    — do *not* re-apply the removal to the already-emptied page). Removal is spliced out of the
    visible page; an *addition* is never spliced in, because the new product may not match the
    page's filters — the list is refetched instead. The product-detail `favoriteCount` is written
    only on success, so a failed save must not decrement it.
  - **Guests** see the heart; clicking it fires no request and shows a sign-in toast whose action
    navigates to `/login?redirect=<current href>`, preserving the product.
  - Server: `GET/POST/DELETE /api/favorites`, `GET /api/favorites/ids`, `GET
    /api/favorites/:productId`, `DELETE /api/favorites` (clear all). All behind `requireUser`;
    the owner is always `c.get("user")!.id` — a `userId` is never accepted from a client. POST
    requires an `ACTIVE` product and is idempotent (a lost concurrent insert race is re-checked
    and treated as success, so the `favorites_user_product_unique` index can never 500 a
    double-tap). `listingType` on the wire is Browse's `mode`.
  - `src/lib/query/cart.ts` is the shared `useAddToCart` (Product Details and the wishlist card
    both add to the cart — one implementation, one cart invalidation).
  - Tests: `tests/favorites-{schema,api,cache,page}.test.tsx` and `tests/favorite-button.test.tsx`
    with `tests/support/favorite-fixtures.ts`. The cache helpers (`toggleFavoriteId`,
    `removeFavoriteFromPage`, `withFavoriteFlag`) are exported purely so cache transitions are
    testable without a QueryClient.
- **Cart (Feature 08)** — `/cart` plus the drawer, the badge and the floating dock. **There is
  exactly one cart system.**
  - **All cart HTTP lives in `features/cart/api.ts`** and all cache/mutation logic in
    `lib/query/cart.ts`. The navbar, floating dock, drawer, cart page, Product Details and the
    wishlist card consume those — none of them fetch or cache a cart of their own. (Checkout
    imports the types + `clearCartRequest` from `lib/query/cart` so it never imports the cart
    *feature*; features must not import each other.)
  - **The drawer open-state lives in `lib/cart/drawer.tsx`**, not in the cart feature, because
    the navbar, the floating dock and any add-to-cart all open it. `CartDrawerProvider` is mounted
    once in `__root.tsx` alongside `CartDrawerHost`.
  - **One cache entry, `queryKeys.cart`, holds the whole `Cart`** — lines *and* the server totals.
    `useCartCount()` is *derived* from it (`select`), not fetched separately: a second count
    endpoint would be a second number that can drift from the page. (The standalone
    `/api/cart/count` endpoint exists for a caller that genuinely needs it alone — do **not** wire
    the badge to it.)
  - **The server owns money.** `GET /api/cart` returns each line's `pricing` (unitPrice, lineTotal,
    rentalCharge, securityDeposit, depositTotal, days) and the cart `totals`, all computed by
    `server/lib/cart.ts` from the product row. A deposit is never inside a rental charge; it is
    its own field and only added into `estimatedTotal`. No client ever sends a price.
  - **`RENT_AND_BUY` never reaches the cart.** It is a product capability; a line is always `BUY`
    or `RENT` (`CartListingType`), and `CartItem` is a discriminated union on it. Rent-to-own is a
    later workflow.
  - **What counts as "the same line"** is defined once, in `isSameConfiguration` (server): same
    product + mode + rental window + saved-for-later. So a second 7-day rental merges into
    quantity 2, a 30-day rental is a separate row, and a BUY + RENT of one product are two rows.
    Dates compare by **day** only (the column is day-precision). There is deliberately **no** DB
    unique index for this: MySQL treats `NULL != NULL`, so it would dedupe rentals and silently
    not dedupe BUY lines. The merge runs in `mergeCartItem` inside a transaction that locks the
    cart row `for update`, which is correct for both modes and under concurrent adds.
  - **`unitPriceSnapshot`** (migration `0003`) is not a price source — it exists only so the cart
    can say "was ₹499, now ₹549" instead of silently charging a different amount. Totals are
    always recomputed from `products`.
  - **Every write re-checks the line against the product as it is now** — stock, mode and (for a
    rental) the same `assertRentalAvailability` engine order creation uses. A quantity patch is as
    capable of going stale as a mode change, so there is no "it was valid when it was added"
    exemption. The last two of those checks were added after an end-to-end run caught a PATCH
    accepting quantity 99 on a listing with 5 in stock.
  - **Checkout is gated by `CartActions`**, which calls `validateCart()` and only navigates when
    the answer is clean. Creating an order, a rental or a payment is Checkout's job, not this
    feature's.
  - `src/features/cart/query.ts` is a thin re-export of the `lib` hooks, not a second
    implementation. Components import from `@/lib/query/cart`.
  - Tests: `tests/cart-{schema,api,cache,drawer,page}.test.tsx` with
    `tests/support/cart-fixtures.ts`. `tests/setup.ts` stubs `IntersectionObserver` (the cart page
    uses one to swap the summary column for a sticky mobile bar) as well as `ResizeObserver`.

- **Product filter vocabulary** is shared, never redefined: `src/lib/types.ts` for the client
  (ListingMode/ProductCondition/ProductAvailability/ProductSort/Category/CategoryDetail) and
  `server/lib/product-filters.ts` for the API (pure, unit-tested normalizers).
  `tests/browse-search.test.ts` asserts the UI options are exactly the values the API whitelists.
  `GET /api/products` also accepts `seller=<id>` (used by the public seller profile).
- **Search params are JSON-parsed** by TanStack Router, so `?page=2` arrives as the **number** 2, not
  `"2"`. `src/lib/browse-search.ts` accepts both shapes (`asNumber`/`asPage`) — validate only strings
  and numeric params silently fall back to their defaults (page 1, etc.).
- **MariaDB has no `ILIKE`** — use drizzle's `like`, which is case-insensitive under the
  `utf8mb4_unicode_ci` collation. `ilike` emits `col ilike ?` and every keyword search 500s.
- **API shapes**: `GET /api/cart` returns a `Cart` object — `{id, items, totals}` — **not** a bare
  `CartItem[]`. The lines and the server-computed totals arrive in one response on purpose, so the
  cart page, the drawer and the badge can never render two different totals. The badge is *derived*
  from that entry via `select`, never fetched separately; `GET /api/cart/count` exists but the UI
  must not be wired to it.
- Server `rateLimit()` keys off `x-forwarded-for` (Node has no `c.env.remoteAddr`) — behind a local
  proxy all requests share one "unknown" bucket, so raise limits if login 429s in dev.

## Payment & order creation (Feature 10)

- **The provider is an interface, not a dependency.** `server/lib/payments/types.ts` defines
  `PaymentProvider`; nothing outside that folder imports a concrete provider. `server/lib/payments/index.ts`
  resolves one from `PAYMENT_PROVIDER`. Adding Razorpay means writing one adapter file and setting
  the env var — no caller changes.
- **The development mock is loud on purpose.** It is `isProductionReady: false`, the API surfaces
  that flag so the UI prints a "Development mode" banner, and `getPaymentProvider` **refuses to
  return it when `NODE_ENV=production`**. A real provider name with no keys is a 503, not a silent
  fallback to the mock — falling back would let a half-configured deployment quietly take fake
  payments. Its intent store is per-instance and in-memory, so an intent from a previous process
  cannot be completed (a restart invalidates outstanding dev payments; that is correct, not a bug).
- **One function decides the amount.** `buildCheckoutQuote` (`server/lib/checkout.ts`) is used by
  `GET /api/payments/summary` to *display* and by order creation to *charge*. Two implementations
  would let a price change between rendering and pressing Pay charge a different amount than the
  customer agreed to. It reuses `priceCartLine`, so the order total and the cart total can never
  diverge (the old `POST /api/orders` did diverge for multi-unit rentals — it never multiplied the
  rental subtotal by quantity).
- **Verification is the server asking the provider, not the browser answering.** `POST
  /payments/:id/verify` sends a **strict** zod object — there is no `amount`, `total`, `success` or
  even `signature` field to set, and an unknown key is a 400. The route then calls
  `provider.verifyPayment(...)` and acts only on that answer. A real adapter may additionally need
  a proof from its own UI; that is the route's business, never the browser's.
- **Terminal vs retryable failure.** `VerifyPaymentResult.isTerminal` separates "the provider has
  definitively declined/expired this" (mark the transaction `FAILED`) from "you did not present
  valid proof" (leave it `PENDING`). Marking the payment failed on a bad proof would make one
  interrupted attempt permanently unpayable.
- **Payment is committed before the order, deliberately.** `/verify` records the settled payment as
  `PROCESSING` and commits; only then does `createOrderFromPayment` run in its own transaction. The
  reverse order would leave a customer charged with no order — the exact failure this structure
  exists to prevent. If order creation fails, the `PROCESSING` transaction is a real, reconcilable
  record and a retry or the webhook finishes it.
- **Two independent idempotency guards.** `transactions.idempotency_key` (unique) means one checkout
  attempt → one order; `provider_idempotency_key` (unique) means one intent per attempt. Both are
  nullable, and MySQL treats NULL as distinct, so legacy rows coexist and only real keys are
  constrained. The transaction row is locked `for update` and re-read inside the order transaction,
  and it returns the existing `orderId` if set — so a double-clicked Pay, a client retry and a
  replayed webhook all produce exactly one order.
- **Deadlock avoidance**: order creation locks the cart's product rows with `FOR UPDATE` in
  ascending id order, so two checkouts touching the same products queue instead of deadlocking. The
  rental-availability helpers take an optional `executor` so those reads join the same transaction —
  before that, `overlappingRentalCount` read through the global `db` and two customers could both
  pass the check for the last unit.
- **Purchases decrement stock; rentals do not.** A rental holds its unit via the `rentals` row for a
  date window, which the availability engine already reads. Permanently decrementing on a rental
  would make the listing unsellable for dates nobody booked. (The e2e run asserts this.)
- **Rental order items split the money**: `rentalCharge` and `securityDeposit` are separate columns
  and `lineTotal = rentalCharge + securityDeposit`. A deposit is never folded into a subtotal, and
  `rentals.deliveryFee` is 0 because delivery is charged once per order.
- **Webhooks answer 2xx once the signature is accepted.** An amount mismatch or missing checkout
  context returns `{handled: false, reviewRequired: true}` and marks the transaction `FAILED` with a
  reason, rather than a 409 — providers retry every non-2xx forever and a mismatch never resolves
  itself. Signature is checked over the **raw body** before parsing; replayed event ids are stored in
  `processed_event_ids` and are a no-op.
- **The webhook runs the real order path.** `reconcileSettledTransaction` accepts a `PENDING`
  transaction, because the customer may have closed the tab and the provider is the authority. It
  drives the payment to `PROCESSING` and then calls the same `createOrderFromPayment` the browser
  path uses, so a webhook-created order is identical to a clicked one.
- **`GET /api/orders` now returns `orderNumber` and `paymentStatus`.** The customer-facing id is
  `RV-<year>-<6 chars from a 32-symbol alphabet>` (`server/lib/payments/order-number.ts`) — never the
  auto-increment `id`, which leaks order volume. 30 bits means collisions are possible, so order
  creation retries on a duplicate key rather than assuming otherwise.
- **Checkout no longer places orders.** It collects the choices (address, delivery method) and
  navigates to `/payment`; the server clears the purchased cart lines inside the order transaction
  instead of a second browser call that could succeed while the order failed.
- `verifyPaymentSchema` and the server's `verifySchema` are both **strict**. Zod strips unknown keys
  by default, which would let `amount: 1` sit in a body looking accepted.
- Tests: `tests/payment-{provider,schema,api,order,page}.test.tsx|ts` plus
  `tests/support/payment-fixtures.ts`. The DB-backed paths (order creation, webhook reconciliation,
  ownership) are covered by scripted end-to-end runs against the live API, not by vitest — the suite
  has no database.

## Orders, history & details (Feature 11)

- **`/orders` and `/orders/$orderId`, both behind `requireAuth`.** The list state lives entirely in
  the URL (`search`, `status`, `type`, `sort`, `page`, `from`, `to`), so a filtered view is
  shareable and the back button undoes a filter. Changing a filter resets to page 1 — staying on
  page 7 of a narrower result set is how a customer meets an empty page.
- **All filtering, sorting and pagination happen in SQL** (`server/lib/order-queries.ts`). Search
  matches the order number *and* `order_items.title_snapshot`, never `products.title` — a customer
  searching for what they bought must still find that order after the listing is renamed or
  removed. "Do not download the history and filter in the browser" is a real requirement here: order
  history grows without bound.
- **`exists()` needs its own parentheses.** Drizzle renders `exists <expr>` with no wrapping, so a
  raw subquery must be written `sql\`(SELECT 1 FROM ...)\``. Without them the generated SQL is a
  syntax error and *every* search and rental-status request 500s. This shipped broken through the
  whole unit suite — the tests cover the resolver, not the emitted SQL — and was caught only by the
  end-to-end run.
- **The rental status filter is namespaced `RENTAL_*`.** `CONFIRMED` is both an order status and a
  rental status, in different columns, and an order can hold both at once. A flat vocabulary would
  render two chips with the same value, one of which could never match.
- **Ownership is part of the identifier predicate**, so another customer's order returns the *same*
  404 as a non-existent one. A 403 would confirm the order number is real, which is exactly what an
  IDOR probe is looking for.
- **`GET /api/orders/:id` accepts the public `RV-2026-XXXXXX` number or a legacy numeric id.** The UI
  always links with the number: a URL is user-visible and shareable, and a sequential id leaks order
  volume. Invalid input is a local "not found" in the page — no request is made.
- **Order items are `leftJoin`ed to products and the snapshot is displayed.** An inner join would
  make a line vanish the moment its product row was removed, turning a historical receipt into a
  partial one. `imageUrl` prefers `imageSnapshot` and only falls back to the live image; `slug`,
  `condition` and `listingType` are live and used solely for navigation and context.
- **The address snapshot is parsed on the server** and returned as an object, so a malformed value
  degrades to "no address shown" rather than throwing during render.
- **The order payload has no `userId`,** and `transactions` is selected column by column — there is
  no card number, CVV or provider secret in the query to leak. Sellers are `id/name/avatarUrl/
  verified` and nothing more.
- **The timeline is built from verified facts only** (`buildOrderTimeline`). The schema records the
  order's *current* status, not when each status was reached, so fulfilment steps render with no
  timestamp rather than an invented one. `createdAt` and the payment's own `createdAt` are real and
  are used. The component takes a plain array, so a future event table changes only the builder.
- **Actions are only real navigations.** No "Track shipment" (no carrier integration), no
  "Return item" / "Cancel rental" (rental lifecycle is a separate feature), no "Contact seller"
  (messaging is its own), no "Buy again" (no re-order endpoint). A button that leads nowhere is worse
  than its absence.
- **"No orders" and "no orders match" are different screens.** Telling someone with forty orders they
  have none, because a filter is applied, is the classic empty-state bug; the variant is chosen from
  whether any filter is active.
- **`statusLabel` keeps acronyms intact** (`UPI`, not `Upi`) via an explicit map, and humanises
  anything it does not recognise — statuses live in a `varchar`, so an unknown one is reachable the
  moment a future feature writes it, and must render rather than blank.
- **`privateQueryKeys` used `["order", "*"]`, which evicted nothing.** TanStack Query matches query
  keys by *prefix*; a literal `"*"` element only ever matches a key that literally contains `"*"`.
  One customer's order details therefore stayed in the cache for the next one to sign in. Fixed by
  adding real prefix keys, `orderAll: ["order"]` and `conversationAll: ["conversation"]`. Prefer a
  real prefix over `"*"` in any eviction list.
- Tests: `tests/orders-{query-params,schema,api}.test.*` and `tests/orders{,-details}-page.test.tsx`
  with `tests/support/order-fixtures.ts`. Authorization, IDOR, pagination, filters, sorting and
  snapshot stability are covered by a scripted end-to-end run against the live API, since the vitest
  suite has no database.

## Rentals & lifecycle (Feature 12)

- **`/rentals` was a public "Popular rentals" browse page** and is now "My Rentals". Browsing
  rent-capable products moved to `/browse?mode=rent`, which is the identical query the old page made
  (`type=RENT&sort=most_viewed`) and is the canonical browse surface. The nav "Rentals" link, the
  home rental section and every "Browse rentals" empty state were repointed there.
  `/dashboard/rentals` (the `seller-rentals` feature) is deliberately **left alone**: it is the
  *owner-side* view, so it is a different scope rather than a duplicate.
- **`GET /api/rentals` now defaults to `role=renter`** ("the ones I booked"). The dashboard surfaces
  that predate this feature show both sides of the table, so they pass `role=all` **explicitly** —
  `seller-rentals/query.ts` and `seller-dashboard/index.tsx`. Silent fallback was the trap here: the
  endpoint changed meaning and two unrelated pages were reading it.
- **Pagination on `/api/rentals` is opt-in.** A caller that passes `page`/`pageSize` gets a page and
  a `pagination` block; a caller that passes neither gets the whole list, exactly as before. Capping
  the pre-existing callers at one page would have dropped rows with no visible error.
- **`UPCOMING` and `EXPIRED` are deliberately not stored statuses.** A confirmed booking whose
  window has not opened is `CONFIRMED` with a future `startDate`; storing a second label for the same
  fact invites the two to disagree, so tabs are derived from real dates. A rental past its end
  without a return is `OVERDUE` — the same information as `EXPIRED` but actionable — and no code
  path could produce `EXPIRED`, so a filter for it could only ever return nothing.
- **Status transitions are the server's, reconciled from dates on read**
  (`reconcileRentalStatuses`): a `CONFIRMED` rental whose start day has arrived becomes `ACTIVE`, and
  an `ACTIVE` one whose end day has passed becomes `OVERDUE`. Idempotent and bounded — the WHERE
  clauses mean a second call updates nothing. This is why a countdown may never write state: a
  customer leaving a tab open at midnight would otherwise promote their own rental.
- **`bucket`, `isInHand`, `days`, `daysRemaining` and `depositStatus` are all server-computed** and
  sent on every row. The client renders them; it never derives them from dates.  - **`rental_events` (migration `0006`) is the rental's recorded history.** `recordRentalEvent`
    appends the step that actually happened (`CONFIRMED`, `STARTED`, `RETURN_REQUESTED`, `RETURNED`,
    `COMPLETED`, `CANCELLED`); `(rental_id, type)` is **unique**, so each type can occur at most once
    and a retried request or a second reconciliation cannot append a duplicate — callers insert
    without checking first and the database is the arbiter. Only a duplicate-key error is swallowed;
    anything else propagates, because a dropped event is an invisible gap in a customer's history.
    `OVERDUE` deliberately records **no** event (it is derived from dates, and an event implies a
    recorded moment), and `DELIVERY_COMPLETED` is declared but never written — no logistics
    integration exists, so it must not render as a permanent "waiting" step.
    `GET /api/rentals/:id` returns `timeline`, built by `buildRentalTimeline` from those rows with
    `createdAt` as the `CONFIRMED` fallback for rentals that predate the table.
  - **`buildRentalTimeline` gives a step a timestamp only when one exists.** A step with no recorded
    time is **omitted** while nothing before it happened, or shown as "waiting" once a later step is
    still ahead; cancellation is moved to the end and marked `cancelled`, because it ends the story.
  - **The deposit is derived, not stored, and is never `RELEASED`.** With no deposit ledger and no
  refund execution in this feature, only `HELD` (item out) and `RELEASE_PENDING` (returned) are
  reachable. Claiming the money is back when no refund has run is the exact claim to avoid.
- **A rental's end date is never extended without payment.** `POST /:id/extension-request`
  validates status, maximum duration, the product's real availability (via
  `assertRentalAvailability`, excluding the rental itself) and computes the price of the extra days
  at the effective rate for the *new* total length — then **records** the request
  (`extensionRequestedAt`/`extensionRequestedDays`) and returns the quote. Applying it would hand out
  free rental time, because there is no approval or settlement flow to charge for it yet.
- **The extension schema is `.strict()` on the server as well as the client.** A plain zod object
  *strips* unknown keys, so a body carrying `additionalCost` was silently discarded and the request
  looked accepted — the worst possible outcome for a field a client is trying to dictate. Found only
  by the end-to-end run.
- **Ownership lives in the lookup predicate, not in a check after it.** `extension-request` and
  `return-request` select `WHERE id = ? AND renter_id = userId` and answer 404, so a 403 can never
  confirm that a probed id is real. The pre-existing `POST /:id/return` leaked the same way and was
  fixed to match.
- **Rental dates are day-precision**, so the countdown counts days on UTC boundaries
  (`startOfDay`/`rentalDaysUntil` in `src/lib/pricing.ts`, the one client/server-shared file). A
  *signed* difference matters: "due back **today**" and "was due yesterday" are different and need
  different words — clamping both to zero made a rental due today render nothing.
- The return dialog has **no method picker**: nothing in the backend acts on a return method, so a
  radio group there would be a control that looks meaningful and changes nothing.
- Tests: `tests/rental-{lifecycle,query-params,schema,api}.test.*`,
  `tests/rentals{,-details}-page.test.tsx` and `tests/support/rental-fixtures.ts`. Authorization,
  IDOR, filters, the extension quote and the return transition are covered by a scripted end-to-end
  run against the live API.

## The listing lifecycle (Feature 13 foundation)

- **The vocabulary lives in two files, kept honest by a test.**
  `server/lib/product-status.ts` is the server's source of truth and
  `src/lib/types.ts` mirrors it (the same duplication the product-filter vocabulary uses,
  because `src/lib/pricing.ts` is the only `src/` file in `tsconfig.server.json`).
  `tests/listing-status.test.ts` asserts the two lists, the seller-settable subset and the
  public subset are identical — so a status can never exist on one side of the wire only.
- **`DRAFT` is the column default, deliberately.** A row inserted without an explicit
  status is invisible until someone publishes it, so no future code path can leak a
  half-finished listing into Browse by forgetting a field.
- **`OUT_OF_STOCK` is publicly visible but not purchasable.** That distinction is the whole
  reason `isPubliclyVisible` and `isPurchasable` both exist and are not interchangeable: a
  listing that ran out is still a listing, and hiding it would drop it out of Browse along
  with its views and its collected favourites. Cart writes and `searchProducts` therefore
  use *different* predicates on purpose.
- **`SOLD` was removed.** It was accepted by `PATCH /api/admin/products/:id/status` and
  understood by no other code, so a product set to it became invisible and uneditable.
- Any new public query must filter with `PUBLIC_PRODUCT_STATUSES`, never a hard-coded
  `status === "PUBLISHED"` — otherwise a sold-out listing disappears without anyone
  deciding it should.

## Seller order scoping (Feature 14 foundation)

- **Fulfillment is per line, not per order.** `orders.status` is one value for the whole
  order, and an order can contain lines from several sellers — so one order status cannot
  express "Seller A has shipped, Seller B has not". Seller actions write
  `order_items.fulfillment_status` (null = "this seller has not acted", read as the order's
  own status), and `orders.status` is never written by a seller. Without this, Seller A's
  "Mark shipped" would speak for Seller B and would rewrite what the customer sees for
  goods nobody has touched.
- **The seller's order state is a rollup: the *least advanced* line wins.** A partly-shipped
  order is not "shipped". `CANCELLED` ranks above everything so it only wins when every line
  is cancelled. Implemented once in `server/lib/seller-order-queries.ts` and shared by the
  list filter (as a `HAVING MIN(rank)`) and the detail response.
- **Ownership is in the WHERE clause, never a check afterwards.** The list joins
  `order_items` filtered by `seller_id` (so the item count and the subtotal come from that
  seller's lines only), and the detail reaches the order *through* its items — so another
  seller's order is the same 404 as a non-existent one. A 403 would confirm the order
  number is real, which is what an IDOR probe wants.
- **A seller's subtotal is summed from `order_items.line_total`**, never the order total and
  never current product prices — so a later price change cannot alter history.
- **Search predicates must be order-level, not row-level.** A predicate mentioning
  `order_items.title_snapshot` that is evaluated per joined row would drop the seller's
  *other* lines out of the `SUM`, silently under-reporting the subtotal. It is therefore
  written as an `EXISTS` over the seller's own lines. Search also never matches another
  seller's `title_snapshot`, or a seller could find an order by typing a competitor's
  product name.
- **The transition table is a real state machine** (`server/lib/order-fulfillment.ts`), and
  it reuses the *existing* order vocabulary rather than inventing near-synonyms
  (`READY_FOR_PICKUP` is this codebase's "ready"; there is deliberately no
  `OUT_FOR_DELIVERY`, because no code path could produce it). `COMPLETED` and `CANCELLED`
  are terminal, cancellation is refused once goods have shipped, and an unpaid order
  (`PENDING_PAYMENT`) cannot be worked at all. A refused transition is a **409** — the
  request is well-formed, the state forbids it.
- **Money is never touched here.** Cancellation records a reason
  (`order_items.cancellation_reason`, per line for the same multi-seller reason) and no
  refund logic reads it: the payment architecture owns financial handling, and a seller
  action must not be able to move money.
- **Customer data is an explicit projection** (`toFulfillmentAddress` in
  `server/lib/address-snapshot.ts`): name, phone and the address lines only. A snapshot is
  written from whatever the customer's address form held, so passing it through wholesale
  would leak any field a future form adds. The same module is used by the customer's
  receipt — extracted from `routes/orders.ts` so the two can never disagree about what a
  malformed value means. It rejects arrays (`typeof [] === "object"` was letting one through).

## Image storage (`server/lib/storage/` + `src/lib/storage/`)

- **The provider is an interface**, exactly like payments: `StorageProvider` in
  `server/lib/storage/types.ts`, with a Supabase adapter (`supabase.ts`) and a local-disk
  development adapter (`dev.ts`). Nothing outside that folder imports a concrete provider;
  adding one is a new adapter file plus `STORAGE_PROVIDER`.
- **The dev adapter is loud, not silent.** It is `isProductionReady: false`, the API
  surfaces that flag so the seller UI can say so, and `getStorageProvider` **refuses** to
  return it under `NODE_ENV=production`. A real provider name with no keys is a 503, never a
  fallback to local disk — falling back would accept uploads onto an ephemeral filesystem
  and lose them on the next restart. Dev bytes land in `server/uploads/` (gitignored).
- **The object key is a security boundary**, not a naming convention:
  `products/<sellerId>/<random>.<ext>`, validated by `OBJECT_KEY_PATTERN` on mint, on upload
  and on delete. Upload targets are minted from the *authenticated* seller id, never from the
  request body, so this endpoint cannot be used to write into another seller's prefix.
- **The extension comes from the MIME type, never the filename**, and the MIME type is
  whitelisted (`image/jpeg|png|webp|avif`, 5 MB, 8 per listing) on the client *and* again on
  the server. The dev sink checks `Content-Length` *before* reading the body so an enormous
  PUT is refused rather than buffered.
- **No binary ever touches MariaDB** — the row stores a URL. `allowedImageHosts()` restricts
  those URLs to the configured bucket plus `images.unsplash.com` (the seeded catalogue), so a
  listing cannot point a product page at an arbitrary third-party host.
- **Uploads use `XMLHttpRequest`, the one place in the app that does.** `fetch` cannot report
  upload progress and a 5 MB phone photo is exactly where silence reads as broken. It is
  confined to `src/lib/storage/index.ts` — components still call a function, and `src/`
  components never touch a bucket directly.
- `api.delete` in `src/lib/api/client.ts` takes an optional body (deleting a stored image
  names the object); omitting it behaves exactly as before.

## Conventions & gotchas
- **Two tsconfigs**: `tsconfig.app.json` (`src/`) and `tsconfig.server.json` (`server/` +
  `src/lib/pricing.ts`). `pnpm build` runs both with `--noEmit` — errors block the build.
- Strict TS: `verbatimModuleSyntax` (use `import type`), `noUnusedLocals`/`noUnusedParameters`.
- **Drizzle mysql2 inserts do NOT return rows** — use `.$returningId()` and re-select, or
  `result[0].affectedRows` for deletes. `db.transaction(async (tx) => ...)` for multi-step writes.
- **Hono**: use `app.onError(handler)` for async route errors — an `app.use()` error-catcher
  middleware does NOT catch handler throws. Status codes need `ContentfulStatusCode` cast.
- **TanStack Table is v8** (v9 was pulled and reverted — its API broke; if upgrading, rewrite the
  products table against the v9 API deliberately). `useReactTable` triggers a benign React Compiler
  lint warning (react-hooks/incompatible-library) — known, ignorable.
- MariaDB runs on the **non-default port 3307**.
- Keep client/server validation limits in sync with `server/schema.ts` column lengths.
- Never trust client totals: orders recompute prices, days, availability server-side.
- `.env` is gitignored. Seed password is documented in README as development-only.
- **Bulk product seeding**: `node scripts/harvest-unsplash.mjs` builds per-category pools of real
  direct CDN URLs in `server/data/product-images.json` (committed). `server/seed-products.ts` reads
  that file and deterministically (seeded mulberry32) generates products on top of the base seed —
  it needs the existing sellers + categories, so run `pnpm db:seed` first. Image 0 = primary, rest =
  alt images with `altText`. `CLEAR_PRODUCTS=1` deletes products but FAILS on the demo products
  referenced by `order_items`/`rentals` (FK `restrict`) — just append instead.
- When adding a route: create the feature module first, then a thin file in `src/routes/`; the
  routeTree regenerates on `pnpm dev`/`pnpm build` (or run `pnpm generate:routes`).
- A file or folder in `src/routes/` whose name starts with **`-`** is **not** a route
  (`routeFileIgnorePrefix` in `tsr.config.json`) — use it for route co-located helpers.
- Lint: unused vars *and* args must be named with a leading `_` (`varsIgnorePattern: "^_"`).
  `no-explicit-any` is only a warning. `prettier --check` is not in the gate, but match
  `printWidth: 100`, double quotes, semicolons, trailing commas.
