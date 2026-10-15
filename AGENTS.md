# Revaro — agent guide

React 19 + Vite frontend (`src/`) talking to a Hono-compatible Express 5 API (`server/`) backed by MariaDB, orchestrated through TanStack Router / TanStack Query / TanStack DB + Drizzle ORM. pnpm 11 (settings in `pnpm-workspace.yaml`, not the package.json `pnpm` field).

## Critical workflows

- **Command order (must run, in this order):** `pnpm typecheck` → `pnpm lint` → `pnpm test` → `pnpm build`. The build re-runs both TS configs and bundles.
- **Single test:** `pnpm test -- <path>` (or `pnpm test -- <name-filter>`); Vitest, jsdom, no DB/network.
- **DB seeds truncate tables** — never run `pnpm db:seed*` against production. Seeds hard-refuse `NODE_ENV=production`.
- **Regenerate routes after adding/modifying `route.tsx` files** with `pnpm generate:routes`; never hand-edit `src/routeTree.gen.ts`.
- **DB schema changes:** modify `server/schema.ts` first, then `pnpm db:generate` → inspect the generated SQL in `drizzle/` → `pnpm db:migrate` → `pnpm db:verify:migrate`. Do not drop data; inspect generated SQL before applying.
- **Keep `admin@revaro.local` password-only in dev.** It retains `must_change_password` / `must_enroll_mfa` flags from the seed. Dev MFA bypass flows via `isDevMfaBypass`.

## Dev commands

```bash
pnpm dev            # Vite :5173 + API (tsx) :3001; /api/* proxied to :3001
pnpm typecheck      # both tsconfig.app.json + tsconfig.server.json (parallel)
pnpm lint           # ESLint (ignore pattern _vars)
pnpm test           # vitest run
pnpm test:watch     # vitest
pnpm format         # prettier 100 width, double quotes
pnpm generate:routes # tsr generate (file-based router)
pnpm start:api      # API only
pnpm db:studio      # Drizzle Studio
pnpm preview        # preview production build
```

DB lifecycle: `pnpm db:create` (first run), `db:generate`, `db:migrate`, then `db:seed` (full pipeline). Also `db:seed:products`, `db:seed:history`, `db:seed:admin`, `db:sync:rbac`.

## Architecture

- **Single package.** Client in `src/`, server in `server/`, tests in `tests/`. Entry points: client `src/main.tsx`; API `server/index.ts`; root schema `server/schema.ts` (single source).
- **Feature modules:** `src/features/<name>/` expose `api.ts`, `query.ts`, `types.ts`, `route.tsx` (windows shape). No cross-feature imports; shared code only in `src/components/shared/` / `src/lib/`.
- **Routing:** TanStack Router (file-based from `src/routes/`). Generated artifact: `src/routeTree.gen.ts` (never hand-edit).
- **Data:** TanStack Query + TanStack DB. Query keys from `src/lib/query/keys.ts`. Server-derived only—never trust client-supplied identity, prices, totals, status.
- **Providers:** payment + image storage behind abstractions (`server/lib/payments/types.ts`), don't hardcode a specific provider.
- **Tailwind v4** with `@utility`/tokens in `src/styles.css`. `.inset-surface`/`.raised-surface` are unlayered classes — they defeat Tailwind utilities. Don't nest `Input` (which hard-codes `.inset-surface`) inside a surface that already has its own; use a raw `<input>`.
- **Trailing-underscore siblings:** routes named `x_.$param.tsx` are siblings of `x.tsx` (preferred when parent is a page, not a layout) so the URL stays the same without rendering under a missing `<Outlet/>`. `support_.$ticketId.tsx` was the precedent.

## Security / non-negotiables

- No secrets in client code or logs. Redaction via `server/lib/logger.ts` (`redactError`); `server/lib/storage/types.ts` keys use `crypto.randomBytes`, not `Math.random`.
- `server/db-*`, `server/lib/env.ts`: production refuses `root`/empty-password DB configs; migrations use the `MIGRATE_DB_*` credentials and `db-migrate.ts`.
- Missing budgets: named rate-limit budgets per endpoint return `429`+`Retry-After`; `guarded(...)` wraps handlers. Single named budgets table at top of `server/lib/rate-limit.ts`.
- `POST /api/*` and admin mutations budgeted globally via `admin.mutation` routed at `adminRoute.use('*')`.
- After successful auth, JWTs never stored; session via HttpOnly cookies.
- Server-authoritative checkout/repeat purchase flows must happen inside DB transactions with re-verified availability.
- Frontend must never use `fetch()` directly; use feature `api.ts` + TanStack Query.

## Networking/config quirks

- Ports: Vite 5173, API `server/index.ts` 3001, MariaDB 3307, DB name `reloop`.
- Vite proxies `/api/*` to 3001.
- Credentials come from env (or `.env`); never prefix DB credentials with `VITE_`.
- App URL: `APP_URL` (canonical), `APP_BASE_URL` accepted as deprecated fallback (one-time warning via `server/lib/env.ts#appBaseUrl`).
- Seed credentials: `ADMIN_PASSWORD`/`DEMO_PASSWORD` or generated into `.seed-credentials.local` (gitignored, 0600). `resolveSeedCredentials()` in `server/lib/seed-credentials.ts`.
- Local seed accounts printed only to the terminal that ran `pnpm db:seed`; credentials never broadcast to UI.

## Testing quirks

- Vitest jsdom. React Router mocked with plain `<a>` tags pattern.
- Tests must not hit DB/network; fixtures in `tests/support/*-fixtures.ts`.
- `tests/no-client-secrets.test.ts` enforces that client source/bundle contains no password literal patterns.
- password checksum tests must be deterministic (digest + salt both tamper).
- New endpoints need 429 + `Retry-After` assertions (pattern in `tests/rate-limit-budgets.test.ts`), and ownership failures are expected to be `404`, not `403`.

## Generated / do-not-edit artifacts

- `src/routeTree.gen.ts` (tsr generate).
- `drizzle/meta/_journal.json`, snapshot files (via `db:generate`).
- `dist/` build output.
- `.seed-credentials.local`.

## R4 outcomes (quick reference)

Rate-limit budgets in `RATE_LIMITS` (single const at top of `server/lib/rate-limit.ts`); db least-privilege SQL at `docs/deploy/db-least-privilege.sql`; error logging redacted via `redactError` in `server/lib/logger.ts`; `orders.ts` buy endpoint returns `404` on ownership; admin status/report handlers use zod schemas `adminProductStatusSchema` / `adminReportStatusSchema` exported from `server/routes/admin.ts`.

## Sources

- `docs/PROJECT_ANALYSIS.md` — prior read-only audit (findings).
- `.github/workflows/work.yml` + `docs/deploy/VPS.md` + `docs/deploy/revaro-api.service` — deployment flow (verify → deploy with release folders + rollback).
- See tests under `tests/` as executable documentation of behavior.
