# Revaro — agent notes

Rent/buy/sell marketplace. React 19 + Vite + TanStack (Router/Query/Form/Table/DB) SPA in `src/`,
Hono + Drizzle + **MariaDB** API in `server/` (run by `tsx`, no server build step). pnpm. INR, all
money stored as **integer paise**.

## Commands

```bash
pnpm install
pnpm db:create && pnpm db:migrate && pnpm db:seed   # first run; seed TRUNCATEs every table
pnpm dev            # Vite :5173 + tsx watch API :3001; Vite proxies /api/* -> :3001
pnpm typecheck      # tsc app + server, --noEmit
pnpm lint           # eslint flat config
pnpm test           # vitest, 49 files / 831 tests, ~30s
pnpm exec vitest run tests/pricing.test.ts    # single file (add -t "name")
```

Also: `pnpm start:api` (API only), `pnpm build` (type-checks both tsconfigs, then `vite build`),
`pnpm format`, `pnpm generate:routes`, `pnpm db:studio`, `pnpm db:seed:products`,
`pnpm db:seed:history`, `pnpm db:harvest-images`, `pnpm test:watch`.

- Verify in the order **typecheck → lint → test**. `pnpm build` type-checks both tsconfigs before
  `vite build`, so type errors block the build.
- MariaDB runs on the **non-default port 3307**, database `reloop`. Credentials in `.env` (from
  `.env.example`, already present locally). Never prefix a secret with `VITE_` — that is public.
  `DATABASE_URL` wins over the `DB_*` vars if both are set (`drizzle.config.ts`), so a stale
  `DATABASE_URL` silently overrides edits to `DB_PORT`/`DB_NAME`.
- Schema change flow: edit `server/schema.ts` → `pnpm db:generate` → `pnpm db:migrate`. Migrations
  in `drizzle/` are `0000`–`0009`; `0007` (product status lifecycle) and `0009` are **data**
  migrations too — it rewrites every `products.status` row (`ACTIVE`→`PUBLISHED`, `SOLD`→`ARCHIVED`),
  so skipping it makes the whole catalogue invisible to public queries. `pnpm db:push` exists but
  writes **no** migration file, so it silently diverges from the committed `drizzle/` history — don't
  use it here.
- `src/routeTree.gen.ts` is generated. Never edit it; it regenerates on `dev`/`build`, or
  `pnpm generate:routes`.
- A file or folder in `src/routes/` whose name starts with `-` is **not** a route
  (`routeFileIgnorePrefix` in `tsr.config.json`) — use it for route co-located helpers.
- ESLint: unused vars **and** args must be named with a leading `_` or they are errors
  (`varsIgnorePattern: "^_"`). `no-explicit-any` is only a warning. `prettier --check` is not in
  the gate, but match `printWidth: 100`, double quotes, semicolons, trailing commas.
- Git repo exists (branch `main`, remote GitHub); **no CI workflow** — verification is local only.

## Architecture

- **Feature modules**: `src/features/<name>/` with `components/` (+ `schema.ts` when the feature has
  forms), `api.ts` (all HTTP), `query.ts` (TanStack Query hooks), `types.ts`, `index.tsx`, or
  `route.tsx` for single-route features (exports the route options that `src/routes/*.tsx` spreads).
  Routes stay thin: `createFileRoute` + component + guards.
- **Feature-to-feature imports are forbidden.** Shared code goes in `src/components/shared/`
  (incl. `product-filters/`, `GoToTop.tsx`) or `src/lib/` (incl. `lib/product-search/`, the one
  canonical product-search URL schema + filter vocabulary).
- **No `fetch()` in components** — `features/*/api.ts` → `src/lib/api/client.ts`. Envelope is
  `{success, data, error, pagination}`; the client throws `ApiError(code, message, status)`. Paths
  are relative `/api/...`.
- **Data flow is one-way: MariaDB → Hono → TanStack Query → TanStack DB → UI.** `src/lib/tanstack-db/`
  (`client/collections/schemas/sync`) is a *derived* in-memory store, not a second source of truth:
  every collection is `localOnlyCollectionOptions`, written only from query-cache data the session
  user already fetched. Never put rows in a collection that the user's own API responses did not
  contain (no tokens, payment credentials, other users' data), and never fetch just to feed a
  collection. **`collection.insert` throws on a key the collection already holds** — always
  update-then-insert in `sync.ts`; a private list syncs with *replace* semantics (a row that left
  the page must leave the store) while public catalogues *merge* (no single surface owns the whole
  catalogue). `clearPrivateCollections()` must be wired into the same logout path that evicts
  `privateQueryKeys`, or one customer's orders stay readable to the next.
- **Query keys: always use `src/lib/query/keys.ts`.** `privateQueryKeys` are evicted on logout;
  public data (products, categories) is intentionally kept cached. **Eviction entries must be a real
  key *prefix*** — TanStack matches by prefix, so `["order", "*"]` evicts nothing and leaves one
  user's private data in the cache for the next; that is why `orderAll`/`conversationAll` exist.
  `src/lib/query/favorites.ts` is the app's *single* favourite system and `src/lib/query/cart.ts`
  the *single* cart system (one cache entry holds the lines **and** the server totals; the badge is
  derived from it, never fetched separately). Features consume these; they never re-implement them,
  and a feature that needs another feature's *state* must import the shared `lib/` module — features
  must not import each other. Shared UI state that several features open lives in `lib/` too
  (`lib/cart/drawer.tsx` owns the cart drawer's open state).
- **Listing status is a vocabulary with consequences** (`server/lib/product-status.ts`):
  `DRAFT → PUBLISHED ⇄ PAUSED`, plus `OUT_OF_STOCK` (derived from inventory, still publicly visible)
  and `ARCHIVED`. **`DRAFT` is the column default**, so a row inserted without a status is invisible
  — public queries opt rows *in* via `PUBLIC_PRODUCT_STATUSES`. A seller may only set
  `SELLER_SETTABLE_STATUSES` (never `OUT_OF_STOCK`). The client mirrors this list in
  `src/lib/types.ts`; `tests/listing-status.test.ts` asserts the two agree rather than sharing a
  module across tsconfigs — the same trick is used for the filter vocabulary, so a server-side
  vocabulary change can fail a *client* test.
- **Orders are historical.** Order list filtering, sorting, search and pagination run in SQL
  (`server/lib/order-queries.ts`); never download a history and filter in the browser. Search
  matches `order_items.title_snapshot`, not `products.title`, and order items are `leftJoin`ed to
  products so a removed listing cannot delete a line from a receipt. Order ownership belongs in the
  same WHERE as the identifier so another customer's order is a 404, never a 403.
- **Order status vocabulary is `ORDER_STATUSES`** in `server/lib/order-queries.ts`:
  `PENDING_PAYMENT → CONFIRMED → PROCESSING → READY_FOR_PICKUP → SHIPPED → DELIVERED → COMPLETED`,
  plus `CANCELLED` (`PAID` is legacy). There is deliberately **no `PACKED` / `OUT_FOR_DELIVERY`** —
  a state nothing can produce is a filter that can only ever return nothing. Order *types* are
  `PURCHASE | RENTAL | MIXED`, not BUY/RENT/RENT_AND_BUY. Fulfillment is **per line**
  (`order_items.fulfillment_status`, `server/lib/order-fulfillment.ts`) because an order can span
  sellers; the customer's view reads the same vocabulary via `order-cancellation.ts`
  (`CUSTOMER_CANCELLABLE_FROM`; a refusal is a 409 with a branchable code). Both are transition
  tables with terminal states — a stale tab cannot walk an order backwards.
- **The customer-facing order id is `orders.orderNumber`**, never the auto-increment `id` — a URL and
  a receipt are both public, and a sequential id leaks order volume. `/orders/$orderId` accepts the
  number (legacy numeric ids still work).
- **Rentals: the backend owns the lifecycle, not React.** `server/lib/rental-lifecycle.ts` holds the
  status vocabulary (`CONFIRMED → ACTIVE → RETURN_PENDING → RETURNED → COMPLETED`, plus `OVERDUE`,
  `CANCELLED`, `DISPUTED`), the tab buckets and the date-driven reconciliation; `GET /api/rentals`
  sends `bucket` / `isInHand` / `daysRemaining` / `depositStatus` so the client renders state instead
  of inferting it. `UPCOMING` and `EXPIRED` are deliberately *not* stored — they duplicate a fact
  dates already hold. One-shot events (return requested, completed, extension requested) are rows in
  `rental_events`, which is `UNIQUE(rental_id, type)` — a table of events *that happened*, never a
  prediction, and never a second row for the same event. `GET /api/rentals` defaults to
  `role=renter`; the owner-side dashboard surfaces pass `role=all` explicitly, and its pagination is
  opt-in so it keeps receiving the whole list.
- **An endpoint that changes meaning needs its existing callers checked.** Making `/api/rentals`
  renter-scoped silently changed what two seller pages rendered until they were told to ask for
  `role=all`. Likewise `/rentals` moved from a public browse page to "My Rentals"; browsing rentals
  is now `/browse?mode=rent`.
- **Auth has one source of truth**: `authMeQuery()` (`["auth","me"]`) in `features/auth/query.ts`.
  `lib/auth/auth-context.tsx` is a thin derived context — do not add a second auth store. Guards
  (`lib/auth/guards.ts`) run in `beforeLoad` and bounce to `/login?redirect=…` or `/auth-check`.
- **Money**: `src/lib/pricing.ts` is imported by client *and* server (it is the only `src/` file in
  `tsconfig.server.json`) — keep it dependency-free. Orders recompute totals, rental days and
  availability server-side; never trust client numbers.
- **Payment is server-authoritative, in both directions.** `server/lib/checkout.ts`'s
  `buildCheckoutQuote` is the *only* thing that decides an amount — it both displays it
  (`GET /api/payments/summary`) and charges it, so the two can never disagree. Never add a client
  path that computes a total, and never add a field to a payment request: `POST
  /api/payments/:id/verify` takes a **strict** zod object with no `amount`/`total`/`success`, so an
  extra key is a 400 rather than something silently stripped. Orders are created **only** after the
  provider verifies, never from a browser assertion. `POST /api/orders` still exists and still
  creates a `PAID` order directly — it is the rent-to-own path, and is not the checkout path.
- **Payment and image storage are both interfaces** (`server/lib/payments/types.ts`,
  `server/lib/storage/types.ts`). Nothing outside those folders imports a concrete provider. The dev
  mocks (`mock` payment, `dev` storage) are refused under `NODE_ENV=production`; a real provider name
  with no keys is a 503, never a silent fallback. `allowedImageHosts` refuses any image host that is
  not the configured bucket or `images.unsplash.com`, so a listing cannot point at a tracker's URL.
  Never prefix a `PAYMENT_*` or `SUPABASE_*` secret with `VITE_`.
- **Theme**: tokens are CSS vars in `src/styles.css` (`:root` + `.dark`). Never hardcode shadow
  hexes in components.

## Gotchas

- Two tsconfigs: `tsconfig.app.json` (`src/`) and `tsconfig.server.json` (`server/` +
  `src/lib/pricing.ts`). `verbatimModuleSyntax` → `import type`; `noUnusedLocals`/`noUnusedParameters`.
- **MariaDB has no `ILIKE`** — use drizzle's `like` (case-insensitive under `utf8mb4_unicode_ci`).
  `ilike` emits `col ilike ?` and every keyword search 500s.
- **Drizzle's `exists()` adds no parentheses** — it emits `exists <expr>`, so a raw subquery must be
  written `sql\`(SELECT 1 FROM ...)\``. Without them the SQL is a syntax error and every request
  that touches the filter 500s; unit tests over a pure resolver will not catch it.
- **Drizzle + mysql2 inserts do not return rows** — use `.$returningId()` and re-select, or
  `result[0].affectedRows` for deletes. `db.transaction()` for multi-step writes.
- **Hono**: errors are handled by `app.onError(onErrorHandler)` already wired in `server/index.ts`;
  an `app.use()` error middleware does **not** catch handler throws. Status codes need a
  `ContentfulStatusCode` cast.
- TanStack Router **JSON-parses search params**, so `?page=2` arrives as the number `2`, not `"2"`.
  Parsers must accept both shapes and never throw (see `parseProductSearch`).
- URL prices are **rupees**; `GET /api/products` takes **paise** — convert with `rupeesToPaise`
  inside `toProductFilters`, never pass a URL price straight through.
- `GET /api/cart` returns a `Cart` object — `{id, items, totals}` — **not** a bare `CartItem[]`. The
  lines and the server-computed totals arrive in one response on purpose, so the page, the drawer
  and the badge can never render two different totals. `CartItem` is a union discriminated on
  `PurchaseCartItem | RentalCartItem`; a deposit is never inside a rental charge.
- Server `rateLimit()` keys off `x-forwarded-for`; behind a local proxy all requests share one
  bucket, so login can 429 in dev.
- TanStack Table is pinned at **v8** (v9 was pulled and reverted). `useReactTable` emits one known
  `react-hooks/incompatible-library` warning — expected, not a regression.
- **Seed in three stages, in this order**: `db:seed` (demo world, **TRUNCATEs** every table),
  `db:seed:products` (20k bulk products, appends), `db:seed:history` (volume data — ~340 orders,
  ~600 lines, ~150 rentals, reviews, favourites, carts, conversations, notifications across 12
  months). The last two *require* the first and are **additive**, so re-running one adds another
  block rather than replacing it — to reset, re-run all three. `HISTORY_SCALE=0.2` shrinks the
  volume pass. History seed data is generated from a fixed RNG seed and must stay that way: it
  is derived data, so a real order's status follows its age and a rental's status follows its
  dates (`server/lib/order-fulfillment.ts` / `rental-lifecycle.ts` read both back).
- `db:seed`'s truncate list runs with foreign-key checks off, so **TRUNCATE does not cascade** —
  every table must be named explicitly, children first (`rental_events` before `rentals`), or the
  next run's inserts hit orphaned rows and unique-index conflicts.
- `CLEAR_PRODUCTS=1` deletes products but fails on the demo products referenced by
  `order_items`/`rentals` (FK restrict) — append instead.
- The Loop chatbot LLM is optional: set `CHATBOT_API_KEY` (Groq default) or it answers from the
  built-in knowledge base; the route must never 500 on a provider failure.

## Testing

- Vitest config lives **inside `vite.config.ts`** (`environment: "jsdom"`,
  `setupFiles: ./tests/setup.ts`). There is no `vitest.config.ts`. No DB or network in tests —
  API behaviour is covered through pure normalizers and fixtures.
- Component tests `vi.mock("@tanstack/react-router", …)` with a plain `<a>`; the `Link`/route mocks
  substitute `params` into `href` and forward `...rest` so hrefs and hover-prefetch are asserted for
  real. Follow that pattern.
- Shared fixtures live in `tests/support/*-fixtures.ts`. Keep logic in `components/schema.ts` and
  `lib/*` so it stays unit-testable without rendering.
- A page test that fails with `Failed to resolve import "@/components/ui/…"` is a **missing
  component**, not a test bug — check that `src/components/ui/` actually has the primitive before
  debugging the test.

## Read before deep work

- `knowledge.md` — per-feature architecture and hard-won gotchas (browse, categories,
  product-details, auth, chatbot, cart, payment, orders, rentals, browse/category caching). Most
  content here is condensed from it.
- `README.md` — setup, env vars, demo logins (`buyer@revaro.local` / `revaro-dev-2026`), deploy notes.
- `server/schema.ts` — the 22-table relational schema; keep client/server validation limits in sync
  with the column lengths.