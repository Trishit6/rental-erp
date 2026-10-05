# Revaro Agent Guide

## Critical Workflows
- **Command order (must follow):** `pnpm typecheck` → `pnpm lint` → `pnpm test` → `pnpm build` (build also type-checks both tsconfigs).
- **Verify before pushing:** run the full sequence locally. No CI workflow exists.

## Dev Commands
```bash
pnpm dev              # Vite :5173 + API server (Hono/tsx) :3001; Vite proxies /api/* to :3001
pnpm typecheck        # TypeScript checks (both tsconfig.app.json + tsconfig.server.json)
pnpm lint             # ESLint (uses _varsIgnorePattern)
pnpm test             # Vitest (no DB/network, jsdom)
pnpm build            # Production build (type-checks both tsconfigs + vite build)
pnpm format           # Prettier (100 width, double quotes)
pnpm generate:routes  # Regenerate routeTree.gen.ts from file-based routes
pnpm db:studio        # Drizzle Studio to browse DB
pnpm start:api        # Run API only (tsx server/index.ts)
```

## Database (MariaDB)
- **Local DB:** port `3307`, database `reloop`. Never prefix DB credentials with `VITE_`. `DATABASE_URL` overrides `DB_*` vars.
- **Lifecycle:**
  ```bash
  pnpm db:create        # First run only
  pnpm db:generate      # Before migrate (Drizzle codegen)
  pnpm db:migrate       # Apply schema changes
  pnpm db:seed          # TRUNCATEs tables
  pnpm db:seed:products # Appends products
  pnpm db:seed:history  # Additive volume data
  ```
- **Migrations:** `0007_*.sql` and `0009_*.sql` rewrite `products.status`. Inspect generated SQL before applying, verify it's non-destructive, and never drop existing data. Always modify schema first, then generate → inspect → migrate.

## Architecture
- **Feature modules:** `src/features/<name>/` with `api.ts`, `query.ts`, `types.ts`, `route.tsx`. No cross-feature imports. Shared code only in `src/components/shared/` or `src/lib/`.
- **Routing:** TanStack Router (file-based). Regenerate `routeTree.gen.ts` after adding/modifying `route.tsx`. Do not hand-edit it.
- **Data layer:** TanStack Query + TanStack DB. Always use query key prefixes from `src/lib/query/keys.ts`. Private collections use `orderAll`/`conversationAll` keys.
- **Providers:** payment and image storage use interface-based providers (`server/lib/payments/types.ts`). Do **not** hardcode a specific payment provider.
- **Entry points:** client `src/main.tsx` (Vite), API `server/*` (tsx).
- **Schemas:** Drizzle schema in `server/schema.ts` (single source). Component-level Zod schemas live under `src/features/*/components/schema.ts`. Never duplicate tables/enums.

## Checkout, Orders & Payments (Critical)
- **Server-authoritative pricing:** Never trust client prices, totals, user/seller IDs, or payment status. Recompute final amounts from DB at validation and order creation time. Validate cart items against DB (exists, active, available, quantity valid, current prices, rental dates available, seller/listing active).
- **Transactions & consistency:** Create orders (Order + OrderItems + Payment + Rental if applicable + Inventory updates) inside a DB transaction. On failure, leave no partial data. Verify availability again at finalization (prevent oversell, overlap for rentals).
- **Payment flow:** Reaching a "success" page is not sufficient. Payment confirmation must come from the authoritative payment/data flow. Support PENDING/PROCESSING/PAID/FAILED/CANCELLED/REFUNDED (and PARTIALLY_REFUNDED if schema supports).
- **Idempotency & UX:** Prevent double submissions (idempotency key/checkout attempt guard). Show loading/disabled states, inline errors, progress. If payment succeeds but order creation fails, do not silently report success—preserve recoverable info; if navigation fails, order still exists (Profile → My Orders).
- **Schema reuse:** Inspect `server/schema.ts` and existing enums before adding fields. Only add missing relationships/fields. Rental/RT-O behavior must match existing business rules (identify missing DB fields before implementing).
- **State sync:** Use TanStack DB for reactive checkout/order state (cart, checkout, selected address, order/rental status) but never store payment secrets/sensitive details. Synchronize/invalidate TanStack Query after mutations.

## Notifications, Messaging & Activity
- **Existing schema:** `notifications`, `conversations`, `conversationParticipants`, `messages` already exist in `server/schema.ts`. Do not duplicate tables; extend as needed.
- **Feature location:** Use `src/features/notifications/` (or existing equivalent). Follow feature conventions (`index.tsx`, `components/`, `schema.ts`, `query.ts`, `types.ts`, mutations).
- **Auth & authorization:** Authoritative user comes from authenticated session. Never trust client-supplied user IDs. For conversations, verify participant membership at the data layer (do not trust `conversationId` alone).
- **Server-authoritative:** Notification counts, unread badges, and feeds must come from real data (no hardcoded values). Notification clicks must deep-link to the relevant entity when one exists.
- **UX:** Use skeletons, clear empty/error states ("You're all caught up", "No conversations yet"), optimistic updates for read states with rollback on failure. Prevent duplicate notifications and duplicate message submissions. Keep accessible labels, proper z-index with the floating controls.
- **Privacy/security:** Never expose private message contents to admins beyond what existing rules allow. No secrets in client state. Email notifications must be provider-independent and work gracefully if no provider is configured.

## Testing
- **Config:** Vitest (`vite.config.ts`, `environment: "jsdom"`). React Router mocked with plain `<a>` tags. Fixtures in `tests/support/*-fixtures.ts`. No DB/network.
- **Single test:** `pnpm test -- <path/to/test>` (or filter by name).

## Constraints & Traps
- **No `fetch()` in React components:** use feature `api.ts` + TanStack Query.
- **Query keys:** always use `src/lib/query/keys.ts` prefixes.
- **Secrets:** never expose DB credentials, payment secrets, private keys, or admin passwords to the client.
- **Extensibility:** extend existing features/routes. Do not rebuild/redesign auth, user profile, admin workspace, seller dashboard, product management, existing cart UI, wishlist, hero, logo system, TanStack DB architecture, or MariaDB/Drizzle setup.
- **Safety:** never auto-reset DB. Checkout must handle cart items becoming unavailable (show message, don't silently remove) and only allow cancellations in cancellable states with confirmation. 
- **Generated artifacts:** `routeTree.gen.ts` is generated—do not hand-edit.
- **Keep consistent:** match surrounding code style, naming, and structure.