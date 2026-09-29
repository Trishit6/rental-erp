# Revaro — agent notes

Rent/buy/sell marketplace. React 19 + Vite + TanStack (Router/Query/Form/Table) SPA in `src/`,
Hono + Drizzle + **MariaDB** API in `server/` (run by `tsx`, no server build step). pnpm. INR, all
money stored as **integer paise**.

## Commands

```bash
pnpm install
pnpm db:create && pnpm db:migrate && pnpm db:seed   # first run; seed TRUNCATEs every table
pnpm dev            # Vite :5173 + tsx watch API :3001; Vite proxies /api/* -> :3001
pnpm typecheck      # tsc app + server, --noEmit
pnpm lint           # eslint flat config
pnpm test           # vitest, 44 files / 772 tests, ~25s
pnpm exec vitest run tests/pricing.test.ts    # single file (add -t "name")
```

- Verify in the order **typecheck → lint → test**. `pnpm build` type-checks both tsconfigs before
  `vite build`, so type errors block the build.
- MariaDB runs on the **non-default port 3307**, database `reloop`. Credentials in `.env` (from
  `.env.example`, already present locally). Never prefix a secret with `VITE_` — that is public.
  `DATABASE_URL` wins over the `DB_*` vars if both are set (`drizzle.config.ts`), so a stale
  `DATABASE_URL` silently overrides edits to `DB_PORT`/`DB_NAME`.
- Schema change flow: edit `server/schema.ts` → `pnpm db:generate` → `pnpm db:migrate`.
  Migration `drizzle/0002_*` (category taxonomy) is **required**, or `/api/categories` 500s — the
  API selects those columns. `drizzle/0003_*` adds `cart_items.unit_price_snapshot` (price-change
  detection only, never a price source) and the two `updated_at` columns. `drizzle/0004_*` adds
  `orders.order_number` (unique, public `RV-YYYY-XXXXXX`) and `orders.payment_status`, the
  `transactions` idempotency/ledger columns, and per-line `order_items.rental_charge` /
  `security_deposit` snapshots. `drizzle/0005_*` adds the rental lifecycle timestamps
  (`return_requested_at`, `completed_at`, `extension_requested_at`/`_days`) — all nullable and all
  recording an *event that happened*, never a predicted one.
  `pnpm db:push` also exists but applies the schema directly and writes **no** migration file, so
  it silently diverges from the committed `drizzle/` history — don't use it here.
- `src/routeTree.gen.ts` is generated. Never edit it; it regenerates on `dev`/`build`, or
  `pnpm generate:routes`.
- A file or folder in `src/routes/` whose name starts with `-` is **not** a route
  (`routeFileIgnorePrefix` in `tsr.config.json`) — use it for route co-located helpers.
- ESLint: unused vars **and** args must be named with a leading `_` or they are errors
  (`varsIgnorePattern: "^_"`). `no-explicit-any` is only a warning. `prettier --check` is not in
  the gate, but match `printWidth: 100`, double quotes, semicolons, trailing commas.
- No git repo and no CI here — verification is local only.

## Architecture

- **Feature modules**: `src/features/<name>/` with `components/` (+ `schema.ts` when the feature has
  forms), `api.ts` (all HTTP), `query.ts` (TanStack Query hooks), `types.ts`, `index.tsx`, or
  `route.tsx` for single-route features (exports the route options that `src/routes/*.tsx` spreads).
  Routes stay thin: `createFileRoute` + component + guards.
- **Feature-to-feature imports are forbidden.** Shared code goes in `src/components/shared/`
  (incl. `product-filters/`) or `src/lib/` (incl. `lib/product-search/`, the one canonical
  product-search URL schema + filter vocabulary).
- **No `fetch()` in components** — `features/*/api.ts` → `src/lib/api/client.ts`. Envelope is
  `{success, data, error, pagination}`; the client throws `ApiError(code, message, status)`. Paths
  are relative `/api/...`.
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
- **Orders are historical.** Order list filtering, sorting, search and pagination run in SQL
  (`server/lib/order-queries.ts`); never download a history and filter in the browser. Search
  matches `order_items.title_snapshot`, not `products.title`, and order items are `leftJoin`ed to
  products so a removed listing cannot delete a line from a receipt. Order ownership belongs in the
  same WHERE as the identifier so another customer's order is a 404, never a 403.
- **The customer-facing order id is `orders.orderNumber`**, never the auto-increment `id` — a URL and
  a receipt are both public, and a sequential id leaks order volume. `/orders/$orderId` accepts the
  number (legacy numeric ids still work).
- **Rentals: the backend owns the lifecycle, not React.** `server/lib/rental-lifecycle.ts` holds the
  status vocabulary, the tab buckets and the date-driven reconciliation; `GET /api/rentals` sends
  `bucket` / `isInHand` / `daysRemaining` / `depositStatus` so the client renders state instead of
  inferring it. `UPCOMING` and `EXPIRED` are deliberately *not* stored — they duplicate a fact
  dates already hold. `GET /api/rentals` defaults to `role=renter`; the owner-side dashboard surfaces
  pass `role=all` explicitly, and its pagination is opt-in so it keeps receiving the whole list.
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
- **Payment provider is an interface** (`server/lib/payments/types.ts`). Nothing outside that folder
  imports a concrete provider. The dev mock is `isProductionReady: false` and is refused under
  `NODE_ENV=production`; a real provider name with no keys is a 503, never a silent fallback to the
  mock. Never prefix a `PAYMENT_*` secret with `VITE_`.
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
- `pnpm db:seed:products` appends 20k bulk products and needs `pnpm db:seed` first (existing sellers
  + categories). `CLEAR_PRODUCTS=1` deletes products but fails on the demo products referenced by
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

## Read before deep work

- `knowledge.md` — per-feature architecture and hard-won gotchas (browse, categories,
  product-details, auth, chatbot, cart, payment, orders, rentals, browse/category caching). Most
  content here is condensed from it.
- `README.md` — setup, env vars, demo logins (`buyer@revaro.local` / `revaro-dev-2026`), deploy notes.
- `server/schema.ts` — the 21-table relational schema; keep client/server validation limits in sync
  with the column lengths.
