# Revaro agent guide

## Checks and commands

- Single package: browser app in `src/`, Express 5 API in `server/`, Vitest tests in `tests/`; client entry is `src/main.tsx`, API entry is `server/index.ts`.
- Run required checks in this order: `pnpm typecheck` → `pnpm lint` → `pnpm test` → `pnpm build`. CI uses Node 22 and pins pnpm 10; local `pnpm-workspace.yaml` contains the pnpm 11 settings.
- Focused checks: `pnpm test -- tests/<name>.test.ts[x]`; API startup only: `pnpm test:startup`; browser smoke tests: `pnpm test:e2e` (Playwright Chromium, starts `pnpm dev`).
- `pnpm dev` runs Vite on `5173` and the API on `3001`; Vite proxies `/api` to the API. `pnpm start:api` runs only the API. `pnpm preview` serves the built SPA.
- After adding or renaming `src/routes/**/*.tsx` route files, run `pnpm generate:routes`; never edit `src/routeTree.gen.ts` by hand.

## Data and migrations

- MariaDB defaults are host `localhost`, port `3307`, database `reloop`; `DATABASE_URL` overrides `DB_*`. Keep credentials and server secrets out of `VITE_` variables.
- Schema source is `server/schema.ts`. For schema changes: edit it → `pnpm db:generate` → inspect the generated SQL for additive/populated-database safety → `pnpm db:migrate` → `pnpm db:verify:migrate` when validating a fresh database. Never hand-edit Drizzle journal/snapshots or drop production data.
- `pnpm db:seed` and its stage commands truncate data and refuse `NODE_ENV=production`; `pnpm db:reset -- --confirm reloop` is destructive and local-only. Seed passwords come from `ADMIN_PASSWORD`/`DEMO_PASSWORD` or gitignored `.seed-credentials.local`.
- Money is integer paise; percentages are basis points. Checkout, rental availability, delivery, prices, totals, identity and status are server-authoritative and must be rechecked transactionally where state can race.

## Boundaries that matter

- TanStack Router is file-based under `src/routes`; feature code lives in `src/features/<name>` with `api.ts`, `query.ts`, `types.ts`, and UI components. Reusable client code belongs in `src/lib` or `src/components/shared`; do not create a second auth/API/storage system.
- Frontend requests go through `src/lib/api/client.ts` and feature `api.ts`/`query.ts`; do not add direct `fetch()` calls in components. Query keys come from `src/lib/query/keys.ts`; TanStack Query matches prefixes, not wildcard segments. Check `docs/invalidation-map.md` for mutation invalidation.
- The API uses Express behind the Hono-shaped adapter `server/lib/http.ts`; route handlers are in `server/routes/`. Auth is HttpOnly-cookie sessions with CSRF protection; authorization and ownership checks stay server-side, and ownership failures use `404`.
- Payment and object storage are provider abstractions under `server/lib/payments/` and `server/lib/storage/`. Local payment/storage adapters are development-only; production must use configured providers. Storage keys are owner-scoped; sensitive evidence must use controlled access and never be logged.
- New state-changing endpoints need a named budget in `server/lib/rate-limit.ts`, with `429` and `Retry-After` behavior covered by tests. Admin routes require the corresponding permission from `server/lib/permission-catalogue.ts`; sensitive decisions should use the audit helper in `server/lib/audit.ts`.
- Public catalogue queries must use `server/lib/product-status.ts`; today only `PUBLISHED` and `OUT_OF_STOCK` are public. Preserve that filter across browse, search, category, seller-storefront, related-product, cart, delivery and checkout paths, while keeping historical order records intact.

## Generated and local-only files

- Do not hand-edit `src/routeTree.gen.ts`, `drizzle/meta/*`, `dist/`, `.tanstack/`, `.seed-credentials.local`, or `server/uploads/`.
- Read `README.md` for product/setup context, `docs/database.md` for migration constraints, `docs/deploy/VPS.md` and `.github/workflows/work.yml` for release/rollback behavior, and tests for executable behavior.