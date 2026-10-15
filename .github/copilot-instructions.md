# Copilot instructions

Revaro is a React 19 + TypeScript marketplace frontend with an Express 5 API and MariaDB database. Follow the existing feature boundaries and keep business-critical decisions on the server.

## Build, test, and lint

- Install dependencies with `pnpm install`.
- Run checks in this order: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`. The build type-checks both client and server before bundling.
- Run one test file with `pnpm test -- tests/<name>.test.ts` (or the matching `.test.tsx` path). Vitest uses jsdom; tests should use fixtures and avoid database or network access.
- `pnpm dev` starts Vite on port 5173 and the API on port 3001; Vite proxies `/api` to the API. `pnpm start:api` starts only the API.
- `pnpm generate:routes` regenerates the TanStack Router tree after route-file changes.
- Database workflow: update `server/schema.ts`, run `pnpm db:generate`, inspect the generated SQL, then run `pnpm db:migrate` and `pnpm db:verify:migrate` as appropriate. Never run seed commands against production; seeds truncate data.

## Architecture

- This is a single pnpm package. The browser app is in `src/`, the API and database code in `server/`, and Vitest tests in `tests/`.
- The frontend uses file-based TanStack Router routes in `src/routes/`; those routes compose feature modules in `src/features/<feature>/`. Feature modules keep API calls, query logic, types, and UI together. Shared frontend code belongs in `src/lib/` or `src/components/shared/`, not in another feature.
- Frontend requests go through the shared API client and feature `api.ts` / `query.ts` modules. TanStack Query keys are defined centrally in `src/lib/query/keys.ts`; consult `docs/invalidation-map.md` when changing mutations or cache behavior.
- `server/index.ts` configures and mounts the Express 5 API; endpoint handlers live in `server/routes/` and use shared server libraries for HTTP behavior, auth, validation, and business logic.
- MariaDB access uses Drizzle and `mysql2`. `server/schema.ts` is the schema source of truth; `drizzle/` contains migrations. `src/lib/pricing.ts` is shared by client and server.

## Repository conventions

- Keep features isolated: avoid cross-feature imports; put reusable UI and client utilities in the shared directories. Follow existing feature module patterns rather than moving code into a new global layer.
- Never hand-edit `src/routeTree.gen.ts` or Drizzle-generated journal/snapshot files. Regenerate them with the corresponding project command.
- Use the central query-key factory. TanStack Query matches keys by prefix, not wildcard; follow the existing key patterns and mutation invalidation/rollback conventions.
- The API validates inputs server-side. Do not trust client-supplied identity, prices, totals, permissions, order state, or availability. Authorization and ownership checks belong on the server; ownership failures use `404`.
- Authentication uses HttpOnly session cookies. Do not put auth tokens or server secrets in browser storage, client code, or logs. `VITE_` environment variables are public.
- Rental availability and checkout/order creation must be revalidated on the server and handled transactionally. Store money as integer paise and percentages as basis points.
- Add named rate-limit budgets for new endpoints; rate-limited responses include `429` and `Retry-After`. Follow the shared budget definitions in `server/lib/rate-limit.ts`.
- Keep payment and image-storage integrations behind their existing provider/storage abstractions.
- Tailwind v4 tokens and utilities live in `src/styles.css`. `.inset-surface` and `.raised-surface` are unlayered; avoid nesting the `Input` component (which applies `.inset-surface`) inside another inset/raised surface.
- For database changes, migrations must be additive and safe for populated databases. Inspect generated SQL before applying it; see `docs/database.md`.
- For route naming and project-specific safety workflows, consult `AGENTS.md`. The full architecture and setup context is in `README.md`.
