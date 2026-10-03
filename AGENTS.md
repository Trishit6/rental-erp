# Revaro Agent Guide

## ⚠️ Critical Workflows

### ✅ Mandatory Command Order
1. `pnpm typecheck` (blocks build)
2. `pnpm lint` (ESLint with _varsIgnorePattern)
3. `pnpm test` (Vitest with no DB/network)
4. `pnpm build` (type-checks both tsconfigs)

### 🔄 Database Lifecycle
```bash
pnpm db:create      # First run only
pnpm db:generate    # Before migrate
pnpm db:migrate     # After schema changes
pnpm db:seed        # TRUNCATEs tables
pnpm db:seed:products  # Appends products
pnpm db:seed:history   # Additive volume data
```

## 📌 Repo-Specific Constraints

### 🐍 MariaDB
- Port: 3307, DB: `reloop`
- `.env` credentials: **never** prefix with `VITE_`
- `DATABASE_URL` overrides `DB_*` vars
- Data migrations (0007, 0009) rewrite `products.status`

### 📁 Architecture
- Feature modules: `src/features/<name>/` with:
  - `api.ts` (HTTP endpoints)
  - `query.ts` (TanStack Query hooks)
  - `types.ts`
  - `route.tsx` (route options)
- **No feature imports**; shared code in `components/shared/` or `lib/`
- Private collections use `orderAll`/`conversationAll` query keys

### 🧪 Testing
- Vitest config in `vite.config.ts` with `environment: "jsdom"`
- Mock `react-router` with plain `<a>` tags
- Fixtures in `tests/support/*-fixtures.ts`

## ⚠️ Traps
- **Never** use `fetch()` in components
- **Always** use `src/lib/query/keys.ts` prefixes
- **No** CI workflow - verify locally
- **Never** trust client-side pricing calculations

## 🚀 Dev Commands
```bash
pnpm dev           # Vite :5173 + tsx :3001
pnpm format        # Prettier (100 width, double quotes)
pnpm generate:routes  # Regenerate `routeTree.gen.ts`
```

**Note:** Payment/image storage use interface-based providers (`server/lib/payments/types.ts`)