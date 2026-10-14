# Revaro — Project Analysis (read-only due diligence)

Audited: 2026-10-13 · Repo: `D:\projects\React-Ts\rental-erp` · Branch: `main` · HEAD: `e8c6e67` (uncommitted working tree).

Method: read-only inspection (`git`, `rg`/`Select-String`, file reads) plus the mandated gates (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm audit`). No file was modified except this document; no migration/seed/reset was run. Secrets are named only, never printed. Where a claim could not be confirmed it is marked **UNVERIFIED** with the reason.

---

## SECTION 1 — SNAPSHOT

### 1.1 Repo and git
- Path: `D:\projects\React-Ts\rental-erp` · branch `main` · HEAD `e8c6e67`.
- Last 15 commits (newest first):
  `e8c6e67 feat: add admin routes for coupons, disputes, revenue, and support` ·
  `9e55656 Add tests for support page, routes, undo window, UPI payment, and user blocks` ·
  `6d3262e feat(auth): sessions, MFA, RBAC and account state (PROMPT 3)` ·
  `b8a146c feat(seed): deterministic full-stack seed pipeline (PROMPT 2)` ·
  `628e41b feat(db): finish PROMPT 1 schema — migration repair, docs, tests` ·
  `0ba0c64 feat(admin): add system status component and related pages` ·
  `cdc8769 feat(dashboard): add dashboard components and queries` ·
  `b506fd7 feat: add authenticated routes for user and seller dashboards` ·
  `9048f49 feat: add SessionsCard component for managing user sessions` ·
  `6893a40 Add step to copy project files to server in CI workflow` ·
  `57a09b5 Add SSH setup and deployment steps in CI workflow` ·
  `cb6caaf chore: update workflow to use pnpm for caching and dependency installation` ·
  `572b279 chore: update CI workflow to use pnpm for dependency installation` ·
  `5624448 Add CI/CD workflow for deployment` ·
  `b9b3a26 Add comprehensive tests for profile page, site header, storage scope, and source scanning`.
- `git status`: **53 modified + 6 untracked** files.
  - Modified (33 source/tests): `docs/database.md`, `drizzle/meta/_journal.json`, `server/lib/{checkout,coupon-admin,enums,order-creation}.ts`, `server/lib/payments/checkout-context.ts`, `server/routes/{admin,payments}.ts`, `server/schema-zod.ts`, `server/schema.ts`, `server/seed-products.ts`, `src/components/layout/{AuthenticatedTopbar,site-header}.tsx`, `src/components/shared/{GoToTop,product-card}.tsx`, `src/components/ui/button.tsx`, `src/features/admin/api.ts`, `src/features/admin/components/AdminCouponDialog.tsx`, `src/features/admin/pages/AdminCouponsPage.tsx`, `src/features/auth/{components/LoginForm,components/PasswordField,components/RegisterForm,route}.tsx`, `src/features/dashboard/components/QuickActions.tsx`, `src/features/favorites/components/FavoriteProductCard.tsx`, `src/features/home/components/{FloatingActions,HeroSection,RentToOwnSection,schema}.tsx`, `src/features/payment/{api,query,types}.ts`, `src/features/payment/components/PaymentPage.tsx`, `src/features/product-details/components/ProductGallery.tsx`, `src/features/reviews/components/ReviewImages.tsx`, `src/features/seller-listings/components/ProductImages.tsx`, `src/features/seller-orders/components/BulkActionsBar.tsx`, `src/features/support/components/TicketList.tsx`, `src/lib/auth/guards.ts`, `src/lib/floating/mobile-action-bar.tsx`, `src/routes/__root.tsx`, `src/styles.css`, `tests/{admin-coupons,auth-guards,db-schema,payment-order}.test.ts`.
  - Untracked: `drizzle/0029_true_squirrel_girl.sql`, `drizzle/meta/0029_snapshot.json`, `server/lib/coupon.ts`, `src/features/payment/components/CouponField.tsx`, `src/lib/utils/focus-first-invalid.ts`, `tests/coupon-engine.test.ts`.
- Pre-existing artifacts at repo root (not part of source): `dbg.mjs`, `dash.log`, `dev.log`, `tests-baseline.log`, `knowledge.md`.

### 1.2 Runtime and scripts
- Node **v24.16.0**, pnpm **11.25.0**. `type: module`, package name `revaro-marketplace`.
- Scripts (`package.json:6-32`): `dev` (concurrently vite + `tsx watch server/index.ts`), `build` (`tsc` both tsconfigs + `vite build`), `preview`, `start:api`, `typecheck`, `lint` (eslint only), `test` (`vitest run`), `test:watch`, `format` (prettier), `generate:routes` (`tsr generate`), `db:create`, `db:generate`, `db:migrate`, `db:push`, `db:verify:migrate`, `db:verify:constraints`, `db:reset`, `db:seed` (4-stage), `db:seed:history`, `db:seed:products`, `db:seed:admin`, `db:sync:rbac`, `db:studio`, `db:repair-demo-images`, `db:harvest-images`.

### 1.3 Dependencies (names + versions only)
**dependencies** — @radix-ui/react-avatar ^1.2.6, react-checkbox ^1.3.11, react-dialog ^1.1.23, react-dropdown-menu ^2.1.24, react-label ^2.1.15, react-popover ^1.1.23, react-radio-group ^1.4.7, react-select ^2.3.7, react-separator ^1.1.15, react-slot ^1.2.3, react-tabs ^1.1.21, react-tooltip ^1.2.16; @tanstack/db ^0.9.2, react-form ^1.33.5, react-query ^5.103.3, react-router ^1.120.5, react-table ^8.21.3; bcryptjs ^3.0.3, class-variance-authority ^0.7.1, clsx ^2.1.1, date-fns ^4.4.0, dotenv ^18.0.4, drizzle-orm ^0.44.2, express ^5.1.0, framer-motion ^13.4.4, jose ^6.2.12, lucide-react ^0.468.0, mysql2 ^3.14.1, qrcode ^1.5.4, react ^19.1.0, react-dom ^19.1.0, sonner ^2.0.8, tailwind-merge ^3.3.1, zod ^3.25.67.

**devDependencies** — @eslint/js ^10.0.1, @tailwindcss/vite ^4.1.11, @tanstack/router-cli ^1.167.38, router-plugin ^1.168.40, @testing-library/jest-dom ^7.0.1, react ^16.3.3, user-event ^14.6.7, @types/express ^5.0.3, @types/node ^22.16.5, @types/qrcode ^1.5.6, @types/react ^19.1.8, @types/react-dom ^19.1.7, @vitejs/plugin-react ^4.7.0, concurrently ^9.2.0, drizzle-kit ^0.31.4, eslint ^10.11.0, eslint-plugin-react-hooks ^7.1.1, eslint-plugin-react-refresh ^0.5.7, globals ^17.12.0, jsdom ^30.1.1, prettier ^3.9.9, tailwindcss ^4.1.11, tsx ^4.19.2, typescript ~5.8.3, typescript-eslint ^8.70.1, vite ^6.3.5, vitest ^5.0.2.

Notes: **no duplicates**. `bcryptjs` is still a dependency although `server/lib/password.ts` uses Node `scrypt` and only keeps bcrypt for verifying legacy hashes (`password.ts:35,254-259`) — still required. `express` is real (the API migrated off Hono; see `server/lib/http.ts:1-35`). No obviously unused production package. `dotenv` is used only server-side.

### 1.4 AGENTS.md rules (summary)
Command order `pnpm typecheck → lint → test → build`; DB on port 3307, database `reloop`, never prefix DB creds with `VITE_`, `DATABASE_URL` overrides `DB_*`; schema-first (`db:generate` → inspect → `db:migrate`), never drop data; feature-module layout `src/features/<name>/` with no cross-feature imports; shared code only in `src/components/shared` or `src/lib`; TanStack Router file-based routes, regenerate `routeTree.gen.ts`, never hand-edit; TanStack Query keys from `src/lib/query/keys.ts`; provider-interface payments/storage, no hardcoded provider; server-authoritative pricing/validation; DB transaction for order creation; no `fetch()` in components; never expose secrets; do not redesign stable surfaces; generated artifacts not hand-edited.

### 1.5 Folder tree (depth 3, excluding node_modules/dist/.git)
```
.agents/  .github/  .impeccable/  .opencode/  .tanstack/
docs/  drizzle/  drizzle/meta/  public/  public/images/  scripts/
server/  server/data/  server/lib/  server/lib/email/  server/lib/payments/  server/lib/storage/  server/routes/
src/  src/components/  src/components/layout/  src/components/shared/  src/components/shared/product-filters/  src/components/ui/
src/features/  (activity, admin{components,pages}, auth{components}, browse{components}, cart{components}, categories{components},
  checkout{components}, dashboard{components}, favorites{components}, home{components}, how-it-works, messages{components},
  notifications{components}, orders{components}, payment{components}, pre-loved, product-details{components}, profile{components},
  rentals{components}, reviews{components}, safety{components}, seller-dashboard{components}, seller-listings{components},
  seller-orders{components}, seller-rentals, seller-wallet{components}, settings, support{components})
src/lib/  (api, auth, cart, floating, product-search, query, storage, tanstack-db, theme, utils)
src/routes/  (admin/, categories/, seller/, _auth/, _authenticated/)
tests/  tests/support/
```
Placement: frontend `src/` (Vite, React 19, Tailwind v4, TanStack Router/Query/DB); backend `server/` (Express 5, tsx); shared schema `server/schema.ts`; migrations `drizzle/`; seeds `server/seed*.ts`; tests `tests/`; CI `.github/workflows/work.yml`.

### 1.6 Environment variables
Names used in code (`process.env.`): ADMIN_EMAIL, ADMIN_PASSWORD, API_PORT, APP_BASE_URL, APP_URL, AUTH_ALLOWED_ORIGINS, AUTH_COOKIE_SECURE, BCRYPT_ROUNDS, CLEAR_PRODUCTS, DATABASE_URL, DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USER, DEMO_PASSWORD, HISTORY_PASSWORD, HISTORY_SCALE, HISTORY_SEED, MFA_BYPASS_EMAILS, MFA_ENCRYPTION_KEY, NODE_ENV, PAYMENT_PROVIDER, PLATFORM_RENTAL_FEE_PERCENT, PLATFORM_SALE_FEE_PERCENT, PRODUCT_COUNT, RATE_LIMIT_STORE, SEED, SEED_ADMIN, UPI_PAYEE_NAME, UPI_PAYEE_VPA.

Names in `.env.example` (20 keys): DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, NODE_ENV, API_PORT, ADMIN_EMAIL, ADMIN_PASSWORD, SESSION_SECRET, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, MFA_ENCRYPTION_KEY, APP_URL, API_URL, PAYMENT_PROVIDER, PLATFORM_SALE_FEE_PERCENT, PLATFORM_RENTAL_FEE_PERCENT, STORAGE_PROVIDER, and a second `PAYMENT_PROVIDER` line (duplicate).

Mismatches / findings:
- `.env.example` duplicates `PAYMENT_PROVIDER` (two lines).
- `.env.example` ships `SESSION_SECRET` (and `README.md:669`), a **stale variable no longer referenced by code** (the old Hono session cookie was replaced by JWTs; `auth.ts:70-73`). Harmless but confusing.
- Used-but-not-documented: AUTH_ALLOWED_ORIGINS, AUTH_COOKIE_SECURE, BCRYPT_ROUNDS, RATE_LIMIT_STORE, MFA_BYPASS_EMAILS, UPI_PAYEE_VPA/NAME, and all `AUTH_*_TTL/LOGIN_*` tunables (read with defaults in `server/lib/env.ts`).
- `APP_BASE_URL` (code) vs `APP_URL`/`API_URL` (example) — `security.ts:101-104` reads APP_URL/API_URL; `APP_BASE_URL` appears in seed/mail code. Both accepted, but the naming is inconsistent.
- `import.meta.env.*` usage in `src/`: **none** (no `VITE_` variables; verified by grep).

---

## SECTION 2 — HEALTH CHECKS

| Command | Result | Evidence |
|---|---|---|
| `pnpm typecheck` (both tsconfigs) | **PASS**, 0 errors | log `TYPECHECK_EXIT=0` |
| `pnpm lint` (eslint) | **PASS**, 0 errors/warnings | log `LINT_EXIT=0` |
| `pnpm test` (vitest run) | **FAIL** — 1 failed / 2037 passed, 116 files | log `TEST_EXIT=1` |
| `pnpm build` | **PASS**, 0 errors | log `BUILD_EXIT=0` |
| `pnpm audit` | **FAIL** — 4 vulnerabilities (1 critical, 2 high, 1 moderate) | log `AUDIT_EXIT=1` |

**Test failure (single):**
`tests/password.test.ts > password hashing (scrypt) > refuses a tampered hash without throwing` (`tests/password.test.ts:54-56`): `expected true to be false`. The test builds `hash.slice(0,-2) + (hash.endsWith("aa") ? "bb" : "cc")`; for a ~86-char base64url digest the last group has padding bits, and when the two replacement characters coincide with the originals the "tampered" string is byte-identical, so the correct password still verifies. Ran in isolation 5×: **14/14 passed every time** — i.e. **flaky / nondeterministic** (it depends on the random salt). The suite is therefore not reproducibly green, which any CI that runs tests would surface ~intermittently.

**`pnpm audit` detail:**

| Severity | Package | Vulnerable | Patched | Path |
|---|---|---|---|---|
| Critical | shell-quote | >=1.8.4 <1.11.0 | >=1.11.0 | `.>concurrently>shell-quote` (dev) |
| High | drizzle-orm | <0.45.2 | >=0.45.2 | `.>drizzle-orm` (runtime) — GHSA-gpj5-g38j-94v9 (identifier escaping) |
| High | source-map-js | >=1.0.0 <1.2.2 | >=1.2.2 | tailwind/vite/postcss chain (dev/build) |
| Moderate | esbuild | <=0.24.2 | >=0.25.0 | `drizzle-kit>@esbuild-kit/...>esbuild` (dev) |

**Build output:** vite v6.4.3, "3234 modules transformed", built in **16.25 s**, **no source maps**.
- `dist/index.html` 1.63 kB (gzip 0.79 kB)
- `dist/assets/index-*.css` 95.70 kB (gzip 15.38 kB)
- `dist/assets/index-*.js` **3,167.52 kB** (gzip 660.19 kB) — Vite emits a chunk-size warning ("Adjust chunk size limit…"); one monolithic JS chunk, no route-level code splitting.

---

## SECTION 3 — ARCHITECTURE

### 3.1 Backend
- Entry: `server/index.ts`. Framework: **Express 5** wrapped by a Hono-compatible `Router`/`Ctx` shim in `server/lib/http.ts` (route files still call `c.req.param()`, `c.json()`, `router.route(prefix, sub)`).
- Middleware order (`server/index.ts:90-105`): `securityHeaders` → `requestId` → `cors` → `requestLogger` → (`/api`) `originGuard` → (`/api`) `csrfProtection` → (`/api`) `beforeApi` = `attachUser`; then routes; then `router.onError(onErrorHandler)`; then a JSON 404 handler; `x-powered-by` disabled.
- Body parsers (`http.ts:662-684`): `express.json({limit:"2mb", verify: captureRawBody})`, `urlencoded(1mb)`, `raw({type:()=>true, limit:"1mb"})` (uploads/webhook raw body).
- Logging: single structured JSON logger with key-based + shape-based redaction (`server/lib/logger.ts`); one line per request with a redacted URL (`server/index.ts:54-67`), bodies never logged.
- Rate limiting: named budgets in `server/lib/rate-limit.ts` (per-IP + per-account, `Retry-After`), in-memory in dev/test, MariaDB table in production unless `RATE_LIMIT_STORE=memory`.
- Authn/z: `attachUser` resolves the session from the access cookie only (`auth.ts:532-567`); `requireUser/requireAdmin/requireRole` (`auth.ts:734-757`), `requirePermission/requireAnyPermission/requireSystemRole/requireMfaEnrolment/assertOwnership` (`permissions.ts`).
- Errors: `onErrorHandler` (`server/lib/api.ts:62-82`) → generic `INTERNAL_ERROR` for unknown throws, `HttpError` codes passed through; `notFound` JSON envelope.
- Route registration: `router.route(prefix, sub)` for each feature router (`server/index.ts:165-195`), plus `/api/health` and `/api/stats` inline.

### 3.2 API inventory
Mounts from `server/index.ts:165-195`. "Own" = ownership/scope check. Validation = zod schema name (NONE if absent). RL = rate-limit budget. Tx = DB transaction. Loc = file:line.

**Global middleware:** securityHeaders, requestId, cors, requestLogger (`index.ts:95-99`); `/api`: originGuard, csrfProtection, attachUser (`:103-105`). Extra per-router middleware: `auth.use(limitBody 32KB)` (`auth.ts:167`) and per-path rate limits (`auth.ts:169-183`); `productsRoute.use(rateLimit("search"))` (`products.ts:26`); `storageRoute.use(rateLimit("storage.upload"))` (`storage.ts:26`); `favorites/cart/addresses/orders/rentals/messages/notifications/activity/support` use `requireUser` (`market.ts:35,272,617`; `orders.ts:71,903`; `messages.ts:50`; `notifications.ts:34`; `activity.ts:28`; `support.ts:39`); `sellerOrders/wallet` use `requireSeller` (`seller-orders.ts:32`, `wallet.ts:54`); `admin` uses `requireAdmin`+`requireMfaEnrolment` plus a permission map (`admin.ts:183-188,226-327`).

**Root (`index.ts`)**

| M | Path | Loc | Auth | Guard | Own | Valid | RL | Tx |
|---|---|---|---|---|---|---|---|---|
| GET | /api/health | 109 | pub | - | - | - | - | - |
| GET | /api/stats | 127 | pub | - | - | - | - | - |

**/api/auth (`auth.ts`)**

| M | Path | Loc | Auth | Guard | Own | Valid | RL | Tx |
|---|---|---|---|---|---|---|---|---|
| GET | /csrf | 196 | pub | - | - | - | - | - |
| POST | /register | 200 | pub | - | - | registerSchema | auth.register | - |
| POST | /login | 244 | pub | - | - | loginSchema | auth.login | - |
| POST | /mfa/challenge | 363 | pub | - | - | mfaChallengeSchema | auth.mfa | - |
| POST | /logout | 417 | pub | - | - | - | - | - |
| POST | /refresh | 426 | pub | - | - | - | auth.refresh | - |
| POST | /logout-all | 431 | ses | requireUser | own | - | - | - |
| POST | /forgot-password | 454 | pub | - | - | forgotPasswordSchema | auth.forgot | - |
| POST | /reset-password | 490 | pub | - | - | resetPasswordSchema | auth.reset | - |
| POST | /change-password | 510 | ses | requireUser | own | changePasswordSchema | auth.password | - |
| GET | /me | 557 | ses | requireUser | own | - | - | - |
| PATCH | /me | 562 | ses | requireUser | own | selfEditableProfileFields.strict | - | - |
| GET | /sessions | 571 | ses | requireUser | own | - | auth.sessions | - |
| DELETE | /sessions/:id | 578 | ses | requireUser | own | - | auth.sessions | - |
| GET | /mfa/status | 592 | ses | requireUser | own | - | - | - |
| POST | /mfa/setup | 604 | ses | requireUser | own | - | auth.mfa | - |
| POST | /mfa/verify | 612 | ses | requireUser | own | mfaCodeSchema | auth.mfa | - |
| POST | /mfa/disable | 624 | ses | requireUser | own | mfaDisableSchema | auth.mfa | - |
| POST | /mfa/recovery-codes | 648 | ses | requireUser | own | passwordOnlySchema | auth.mfa | - |

**/api/categories (`products.ts`)**

| M | Path | Loc | Auth | Guard | Own | Valid | RL | Tx |
|---|---|---|---|---|---|---|---|---|
| GET | / | 155 | pub | - | - | categoryListQuerySchema | - | - |
| GET | /:idOrSlug/subcategories | 162 | pub | - | - | - | - | - |
| GET | /:idOrSlug | 174 | pub | - | - | - | - | - |
| POST | / | 192 | adm | requireUser + inline `role==="ADMIN"` | - | categorySchema | - | - |
| PATCH | /:id | 201 | adm | requireUser + inline role | - | categorySchema.partial | - | - |
| DELETE | /:id | 215 | adm | requireUser + inline role | - | - | - | - |

**/api/cms (`cms.ts`)** — public: `GET /banners` 22, `GET /blocks` 29, `GET /blocks/:key` 34.

**/api/products (+ `/api/products/search`) (`products.ts`)** — router RL `search`:

| M | Path | Loc | Auth | Valid | RL |
|---|---|---|---|---|---|
| GET | / | 499 | pub | productSearchSchema | search |
| GET | /:idOrSlug | 593 | pub | - | search |
| GET | /:idOrSlug/related | 675 | pub | - | search |
| GET | /:idOrSlug/availability | 714 | pub | availabilityQuerySchema | search |

**/api/favorites (`market.ts`)** (requireUser): GET `/` 84, GET `/ids` 149, GET `/:productId` 163, POST `/:productId` 177, DELETE `/:productId` 221, DELETE `/` 240 (tx 249). All scoped by `favorites.userId`.

**/api/cart (`market.ts`)** (requireUser): GET `/` 380, GET `/count` 389, GET `/validate` 404, POST `/items` 421 (addCartItemSchema), PATCH `/items/:id` 485 (patchCartItemSchema, scoped), DELETE `/items/:id` 587, DELETE `/` 595.

**/api/addresses (`market.ts`)** (requireUser): GET `/` 622, POST `/` 628 (addressSchema), PATCH `/:id` 638 (addressSchema.partial, scoped), DELETE `/:id` 653 (scoped).

**/api/orders (`orders.ts`)** (requireUser): POST `/` 87 → **410** (creation moved to payments); GET `/` 109 (scoped); GET `/:id` 175 (scoped); POST `/:id/cancel` 378 (cancelOrderSchema, RL checkout.order, tx 426); POST `/:id/again` 680 (orderAgainSchema).

**/api/rentals (`orders.ts`)** (requireUser): GET `/` 922; GET `/:id` 1008 (renter‖owner); POST `/:id/return-request` 1118 (tx 1144); POST `/:id/extension-request` 1205 (extensionRequestSchema, tx 1267); POST `/:id/return` 1294 (tx 1314); POST `/:id/cancel` 1356 (tx 1371); POST `/:id/buy` 1430 (tx 1461).

**/api/payments (`payments.ts`)** (per-handler requireUser): GET `/methods` 114; GET `/summary` 138 (summaryQuerySchema); POST `/coupon` 170 (couponPreviewSchema, RL coupon.apply); POST `/intents` 204 (createIntentSchema, RL payments.intent+coupon.apply); GET `/:id` 322; POST `/:id/verify` 364 (verifySchema, RL); POST `/:id/cancel` 492 (RL); **POST `/webhook` 543 — public, HMAC header verified at `:548`**.

**/api/reviews (`reviews.ts`)**: GET `/product/:idOrSlug` 234 (pub); POST `/` 365 (requireUser, reviewCreateSchema, scoped); GET `/:id{[0-9]+}` 488 (pub); PATCH `/:id` 510 (scoped); DELETE `/:id` 558 (scoped); POST `/:id/helpful` 588 (tx); POST `/:id/reply` 667 (seller reply); GET `/mine` 711; GET `/seller` 753; GET `/moderation` 822 (admin); PATCH `/:id/moderation` 860 (admin); DELETE `/:id/moderation` 893 (admin).

**/api/reports (`reports.ts`)**: POST `/` 18 (requireUser, reportInputSchema, RL reports.create).

**/api/support (`support.ts`)** (requireUser): GET `/help-topics` 56; GET `/tickets` 63; POST `/tickets` 71 (createTicketSchema, RL); GET `/tickets/duplicate` 85; GET `/tickets/:id` 92 (404 if not own); POST `/tickets/:id/messages` 101 (RL); POST `/tickets/:id/reopen` 112 (RL); POST `/tickets/:id/rating` 121 (ticketRatingSchema, RL).

**/api/users (`social.ts`)**: GET `/me` 30; PATCH `/me` 52 (requireUser, selfEditableProfileFields.strict, RL auth.password); GET `/blocked` 98; POST `/:id/block` 121 (blockBodySchema, RL social.block); DELETE `/:id/block` 144 (RL).

**/api/conversations (`messages.ts`)** (requireUser): GET `/` 58; GET `/context` 72; GET `/:id/messages` 89 (requireParticipation); POST `/:id/read` 96; POST `/:id/messages` 116 (sendMessageSchema, RL messages.send); POST `/` 167 (startConversationSchema, RL).

**/api/notifications (`notifications.ts`)** (requireUser): GET `/` 46; GET `/unread-count` 61; GET `/preferences` 74; PATCH `/preferences` 106; POST `/read-all` 122; PATCH `/:id/read` 138; DELETE `/:id` 150.

**/api/activity (`activity.ts`)** (requireUser): GET `/` 33.

**/api/seller/orders (`seller-orders.ts`)** (requireSeller): GET `/` 39; GET `/:id` 49; PATCH `/:id/fulfillment` 67 (tx 97); PATCH `/bulk-fulfillment` 182 (tx 232); POST `/:id/cancel` 282 (tx 302).

**/api/seller/wallet (`wallet.ts`)** (requireSeller): GET `/overview` 74; GET `/transactions` 125; GET `/transactions/:id` 132; GET `/payouts` 139; GET `/payouts/:ref` 158; POST `/payouts` 194 (payoutRequestSchema); GET `/methods` 232; POST `/methods` 237 (payoutMethodSchema); DELETE `/methods/:id` 244.

**/api/seller (`seller.ts`)**: GET `/onboarding` 72 (requireUser); POST `/onboarding` 111 (requireUser, tx 115); GET `/summary` 191, `/alerts` 207, `/analytics` 222, `/products` 239, `/products/:id` 258, POST `/products` 350 (tx 438), PATCH `/products/:id` 518 (tx 567), PATCH `/products/:id/inventory` 702, PATCH `/products/:id/status` 751, POST `/products/:id/duplicate` 837, POST `/products/:id/archive` 920, DELETE `/products/:id` 948 — all requireSeller with `sellerId` scoping; GET `/profile` 1011, PATCH `/profile` 1022, GET `/earnings` 1056, GET `/transactions` 1089 (requireSeller); POST `/reports` 1129 (requireUser, RL reports.create).

**/api/sellers (`sellers.ts`)** — public shopfront: GET `/:id{[0-9]+}` 27.

**/api/storage (`storage.ts`)** (RL storage.upload): GET `/config` 36 (pub); POST `/upload-target` 82 (requireUser, uploadTargetSchema); PUT `/upload` 120 (requireUser); GET `/local` 173 (pub); DELETE `/object` 209 (requireUser, deleteSchema).

**/api/admin (`admin.ts`)** — every route admin + MFA-enrolment; guard = permission from `ADMIN_ROUTE_PERMISSIONS` (`:226-316`). Writes wrap `withAudit`. Highlights (rel path): `GET /me` 339 (deliberate no permission); `GET /stats` 370 (dashboard.view); products 447-680 (`products.view/moderate`); orders 683-931 (`orders.view/manage/refund`); rentals 948-1114 (`rentals.view/manage`); disputes 1116-1197; users 1199 (`users.view`); sellers 1222-1274 (`vendors.view/manage`); finance/transactions 1276-1318 (`payouts.view`); refunds 1320-1384 (`refunds.view/approve` + step-up on decision); revenue/reconciliation 1386-1403; reviews 1405-1454; categories 1456-1526; product-images 1528-1730; audit-log 1732 (`audit.view`); payouts 1748-1826 (`payouts.approve`); moderation 1828-1929; reports 1931-1968; support 1970-2076; coupons 2079-2198; RBAC 2199-2770 (`rbac.manage`, step-up on writes); users/:id/status 2692 (`users.manage`+step-up); categories write 2776-2872; CMS 2874-3080; product relations/bulk 3081-3140.

### 3.3 Frontend — route table
No route declares a TanStack `loader`; all data is client-side TanStack Query. Layouts: `__root`, `_auth`, `_authenticated`, `admin.tsx`, standalone.

| Path | Route file | Layout | beforeLoad guard | Data hooks (query keys) | Status | Evidence |
|---|---|---|---|---|---|---|
| / | index.tsx | root | - | stats/categories/products/cms | WORKING | index.tsx:4 |
| /how-it-works | how-it-works.tsx | root | - | none | WORKING | - |
| /browse | browse.tsx | root | - | products, categories | WORKING | browse/index.tsx:62-65 |
| /pre-loved | pre-loved.tsx | root | - | products | WORKING | pre-loved.tsx:6 |
| /product/$slug | product.$slug.tsx | root | - | product, related, availability, favorites, reviews | WORKING | product-details/index.tsx:60-89 |
| /categories | categories/index.tsx | root | - | categories | WORKING | - |
| /categories/$categorySlug | categories/$categorySlug.tsx | root | - | category/subcategories/products | WORKING | - |
| /seller/$id | seller.$id.tsx | root | - | seller(public), products | WORKING | seller-dashboard/profile.tsx:32-35 |
| /checkout | checkout.tsx | root | requireAuth | cart, addresses | WORKING | checkout/index.tsx:14-19 |
| /payment | payment.tsx | root | requireAuth | payment*, intents | WORKING | payment/route.tsx |
| /list | list.tsx | root | requireSeller + redirect | none | WORKING | list.tsx:18-20 |
| /auth-check | auth-check.tsx | root | - | invalidate + history.back | WORKING | auth-check.tsx:15-20 |
| /login /register /forgot /reset | _auth/* | auth | requireGuest | auth mutations | WORKING | _auth.tsx:19 |
| /cart | _authenticated/cart.tsx | workspace | requireAuth | cart | WORKING | cart/index.tsx:26-30 |
| /dashboard | _authenticated/dashboard.tsx | workspace | requireAuth | role panels | WORKING | dashboard/index.tsx:29 |
| /favorites | _authenticated/favorites.tsx | workspace | requireAuth | favoritesList, favoriteIds | WORKING | - |
| /messages | _authenticated/messages.tsx | workspace | requireAuth | conversations, messages | WORKING | - |
| /notifications | _authenticated/notifications.tsx | workspace | requireAuth | notifications* | WORKING | - |
| /orders | _authenticated/orders.tsx | workspace | requireAuth | ordersList | WORKING | orders/index.tsx:43,73-78 |
| /orders/$orderId | _authenticated/orders.$orderId.tsx | workspace | requireAuth | order | **BROKEN** — parent `OrdersPage` renders no `<Outlet/>` | orders/index.tsx:43 |
| /rentals | _authenticated/rentals.tsx | workspace | requireAuth | rentalsList | WORKING | rentals/index.tsx:49 |
| /rentals/$rentalId | _authenticated/rentals.$rentalId.tsx | workspace | requireAuth | rental | **BROKEN** — parent no `<Outlet/>` | rentals/index.tsx:49 |
| /profile | _authenticated/profile.tsx | workspace | requireAuth | auth, addresses, sessions, mfa, myReviews | WORKING | profile/index.tsx:26-59 |
| /profile/{orders,rentals,wishlist,activity} | profile.*.tsx | workspace | requireAuth | orders/rentals/favorites/activity | **BROKEN** ×4 — `ProfilePage` no `<Outlet/>` | profile/index.tsx |
| /settings | _authenticated/settings.tsx | workspace | requireAuth | notification prefs, theme | WORKING | - |
| /support | _authenticated/support.tsx | workspace | requireAuth | supportTickets, helpTopics | WORKING | - |
| /support/$ticketId | support_.$ticketId.tsx | workspace | requireAuth | supportTicket | WORKING (`support_` = sibling, avoids trap) | support_.$ticketId.tsx:7-11 |
| /admin/* (22 pages) | admin/*.tsx | admin | requireAdmin | admin-* keys | WORKING except below | admin.tsx:31 |
| /admin/reviews/sellers | admin/reviews.sellers.tsx | admin | requireAdmin | admin-reviews | **BROKEN** — parent no `<Outlet/>` | AdminReviewsPage.tsx:53 |
| /seller/* (13 pages) | seller/*.tsx | standalone | requireSeller (reviews/messages/become = requireAuth, intentional) | seller*/wallet* | WORKING except below | guards.ts:200 |
| /seller/products/new | seller/products.new.tsx | standalone | requireSeller | create hooks | **BROKEN** — parent no `<Outlet/>` | seller-listings/index.tsx:43 |
| /seller/products/$productId/edit | seller/products.$productId.edit.tsx | standalone | requireSeller | sellerProduct, update | **BROKEN** — same | seller-listings/index.tsx:43 |

Root cause: a family of page routes are parents in the generated tree but render **no `<Outlet/>`** (`grep Outlet in src/features` = 0 hits), so their children are unreachable. `support_.$ticketId.tsx` documents the hazard and works around it; the trap is unfixed for 11 routes above.

### 3.4 Data layer
- API client: `src/lib/api/client.ts` (fetch wrapper, CSRF echo, 401→session-expiry).
- Query-key factory: `src/lib/query/keys.ts` — one `queryKeys` object of `as const` arrays plus list-key functions; `privateQueryKeys` (`keys.ts:387-452`) enumerates user-scoped prefixes evicted on logout (public products/categories/stats/cms deliberately excluded).
- Query client defaults (`src/lib/query/client.ts:29-50`): `staleTime 60 s`, `gcTime 10 min`, `retry 1`, `refetchOnWindowFocus false`, `refetchOnReconnect true`, plus `QueryCache.onError` 401 mapping to `reportSessionExpired()`.
- TanStack DB: all `localOnlyCollectionOptions` in-memory, derived from Query via `sync.ts` (single writer). Collections: authUser, orders, orderItems, rentals, products, categories, reviews, sellerProducts, walletTransactions, walletPayouts, notifications, conversations, messages. Private ones are cleared by `clearPrivateCollections` (`sync.ts:421-463`); no token is ever stored. `reviews` collection stores only a public projection (no user id/order/reply).
- Invalidation: query-key prefixes; mutations invalidate, TanStack DB syncs. Optimistic updates: favorites, cart, notification read states, review helpful (with rollback).
- Full-page navigation: only review images / ticket attachments (`target="_blank"`) and the admin coupon CSV download (`AdminCouponsPage.tsx:94`); `window.location.href` is **read** once for the product share URL (`product-details/index.tsx:131`). No `location.reload/assign/replace` anywhere.

### 3.5 Framer Motion
Used in ~57 files (full list available via grep). Predominantly `motion` + `useReducedMotion` for enter/exit/fade (hero, cards, drawers, timelines, toasts, favorites grid, admin layout). `AnimatePresence` in `site-header.tsx`, `sheet.tsx`, `GoToTop.tsx`, `FloatingActions`/`CartDrawer`, `HeroSection`, `FavoritesGrid`, `NotificationBell`, `AuthError`. No layout-affecting animation was identified beyond drawer/sheet slide-in (which lock scroll). Reduced motion is respected in most (`useReducedMotion`) but **not all** (`categories/CategoriesSection`, `home/CategoryCard`, `home/HowItWorks`, `home/RentToOwnSection`, `home/SellerCTA`, `admin/AdminLayout`, `seller-dashboard/*`, `categories/FeaturedCategories` uses it, `orders/OrderDetailsTimeline` uses it). Several `motion` imports without `useReducedMotion` rely on simple opacity/translate.

---

## SECTION 4 — DATABASE

### 4.1 Conventions
- PK: `int AUTO_INCREMENT` signed (not unsigned) unless noted. Varchar PKs: `sessions.id varchar(64)`, `platform_settings.key varchar(80)`, `rate_limit_counters.bucket_key varchar(190)`. Natural PKs: `notification_preferences.user_id`, `seller_profiles.user_id`, `user_mfa.user_id`. Composite PKs: `product_tags`, `review_helpful_votes`, `conversation_participants`, `role_permissions`, `user_roles`.
- **Money is integer paise** in `int` columns (signed on `wallet_transactions`); no decimal/float money. Percents are **basis points** (`commission_rules.percent_bp`, `coupons.discount_value` for PERCENT). `double` only for lat/long/ratings.
- Status/mode columns are **varchar**, never MySQL ENUM (`server/lib/enums.ts:8-17`).
- Every FK declares an explicit `ON DELETE` (cascade/restrict/set null); **no FK is left at NO ACTION**.

### 4.2 Tables (compact)
Full per-table columns/FKs/unique/index/check detail was extracted; representative + all tables:

| Table | Loc | Key columns | FKs (col→ref:ondelete) | Unique / notable indexes |
|---|---|---|---|---|
| users | 21 | name,email,password_hash,phone,role,status,verified,must_change_password,must_enroll_mfa | - | users_email_unique; role_idx, created_at_idx |
| sessions | 73 | id varchar(64),refresh_token_hash,previous_refresh_token_hash,expires_at,revoked_at,device_label,ip,user_agent,last_seen_at,mfa_verified_at | user_id→users:C; revoked_by→users:S | refresh_token_hash_idx, user_id_idx, previous_hash_idx |
| addresses | 148 | name,phone,lines,city,state,postal_code,country,is_default | user_id→users:C | user_id_idx |
| categories | 179 | name,slug,description,icon,parent_id,sort_order,is_featured,is_active | parent_id→categories:S | slug_unique; parent_id_idx |
| products | 205 | seller_id,title,slug,description,category_id,condition,specifications,listing_type,status,location,lat,long, purchase/rent-day/week/month prices,security_deposit,min/max_days,rent_to_own,rent_credit_pct/cap,quantity,available_quantity,view/favorite counts,rating*,search_text,allows_delivery/pickup | seller_id→users:C; category_id→categories:R | slug_unique; status/category/created/listing/seller/status-category/title idx; 16 CHECKs |
| product_images | 325 | url,alt_text,sort_order | product_id→products:C | product_id_idx |
| product_tags | 344 | tag (product_id,tag PK) | product_id→products:C | tag_idx |
| favorites | 361 | - | user_id→users:C; product_id→products:C | user_product_unique; product_id_idx |
| carts | 381 | - | user_id→users:C | user_id_unique |
| cart_items | 394 | mode,quantity,start/end_date,saved_for_later,unit_price_snapshot | cart_id→carts:C; product_id→products:C | cart_id_idx, product_id_idx; CHECKs |
| orders | 439 | order_number,order_type,status,payment_status,subtotal,delivery_fee,deposit_total,discount,tax,total,currency,delivery_method,delivery_address_id,snapshot,tracking,payment_provider,payment_reference | user_id→users:R; delivery_address_id→addresses:S | order_number_unique; user/status/created/user-created/status-created idx |
| order_items | 520 | mode,fulfillment_status,cancellation_reason,quantity,unit_price,rental_charge,security_deposit,line_total,title/slug/image snapshots,start/end_date,rental_days,rent_credit_applied | order_id→orders:C; product_id→products:R; seller_id→users:R | order/product/seller/(seller,order) idx |
| rentals | 634 | start/end_date,actual_return_date,daily_rate,rental_subtotal,security_deposit,delivery_fee,total,rent_credit_applied,status,return_requested_at,completed_at,extension_requested_at/days | order_id→orders:C; order_item_id→order_items:C; product_id→products:R; renter_id→users:R; owner_id→users:R | 11 indexes incl. product_start_end, renter/owner status |
| rental_events | 741 | type,metadata | rental_id→rentals:C | (rental_id,type) unique |
| reviews | 770 | purchase_type,rating,title,comment,is_verified_purchase,status,is_edited,helpful_count,images,seller_reply | user/product/seller→users/products:C; order/order_item/rental:S | order_item_unique; (user,order,product) unique; product_status_created idx |
| review_helpful_votes | 867 | (review_id,user_id PK) | review_id→reviews:C; user_id→users:C | user_id_idx |
| conversations | 905 | product_id,order_id,rental_id,last_message_at | product/order/rental:S | last_message_at_idx |
| conversation_participants | 929 | (conversation_id,user_id PK),last_read_at | →conversations/users:C | user_id_idx |
| messages | 958 | body | conversation_id→conversations:C; sender_id→users:C | conversation_id_idx, conversation_created_idx |
| notifications | 1008 | type,title,body,link,related_entity_type/id,metadata,event_key,read_at | user_id→users:C | event_key_unique; user/read/user-created/entity idx |
| notification_preferences | 1094 | per-channel booleans (user_id PK) | user_id→users:C | - |
| reports | 1120 | reason,details,status,action,action_note,resolved_at | reporter/product/reported_user/review/message/order/rental:C; resolved_by:S | status_created_idx |
| user_blocks | 1190 | reason | blocker_id/blocked_id→users:C | (blocker,blocked) unique; blocked_id_idx; CHECK blocker<>blocked |
| seller_profiles | 1215 | bio,location,response_rate_hours,verified,total_sales/earnings_paise,listings_count,rating* | user_id→users:C | PK user_id |
| transactions | 1254 | type,amount,currency,status,provider,provider_transaction_id,provider_idempotency_key,idempotency_key,payment_method,processed_event_ids,metadata,failure_reason | user_id→users:R; order_id→orders:S | idempotency_key_unique, provider_idempotency_key_unique, provider_reference_unique; status_created_idx |
| admin_audit_log | 1357 | action,entity_type,entity_id,details,actor_role,reason,ip,user_agent,request_id,before/after_state | admin_id→users:R | admin_created_idx, entity_idx, (actor_role,created_at) |
| seller_payout_methods | 1436 | type,account_holder,masked_label,is_default | seller_id→users:C | seller_id_idx |
| payouts | 1484 | payout_number,amount,currency,status,method_label,note,failure_reason,idempotency_key,reviewed/…_at | seller_id→users:R; method_id→seller_payout_methods:S; reviewed_by→users:S | payout_number_unique, idempotency_key_unique; seller/status/(seller,status)/requested idx |
| wallet_transactions | 1576 | type,amount signed,currency,status,description,reference,idempotency_key | seller/order/order_item/rental/payout refs | idempotency_key_unique; 9 indexes |
| order_events | 1681 | type,from/to_status,actor_role,note,metadata,event_key | order_id→orders:C; actor_id→users:S | event_key_unique; (order,created) |
| stock_reservations | 1724 | quantity,rental_start/end,expires_at,status | product_id→products:C; user_id→users:C; order_id→orders:S | product_expires_idx, status_expires_idx; CHECKs |
| idempotency_keys | 1779 | scope,key,request_hash,status_code,response_body,expires_at | user_id→users:C | (scope,key) unique; expires_at_idx |
| payment_webhook_events | 1828 | provider,event_id,provider_payment_id,event_type,payload,signature_verified,status,error_message,processed_at | - | (provider,event_id) unique; status_created_idx, provider_payment_idx |
| platform_settings | 1885 | key varchar(80) PK,value JSON,description | updated_by→users:S | PK |
| search_history | 1905 | term,result_count | user_id→users:C | (user_id,term) unique; user_created_idx; CHECK trim(term)>0 |
| roles | 1940 | name,description,is_system | - | name_unique |
| permissions | 1965 | key,description,group_key | - | key_unique; group_key_idx; CHECK key LIKE '%.%' |
| role_permissions | 1987 | (role_id,permission_id PK) | →roles/permissions:C | permission_id_idx |
| user_roles | 2004 | (user_id,role_id PK),granted_by | →users:C; role_id→roles:R; granted_by→users:S | role_id_idx |
| user_mfa | 2026 | secret_encrypted,enabled_at,last_used_at (user_id PK) | user_id→users:C | PK |
| mfa_recovery_codes | 2049 | code_hash,used_at | user_id→users:C | code_hash_unique; user_used_idx |
| password_reset_tokens | 2075 | token_hash,used_at,expires_at,requested_ip | user_id→users:C | token_hash_unique; user_created_idx |
| login_attempts | 2108 | identifier,ip,user_agent,success,failure_reason | user_id→users:S | identifier_created_idx, ip_created_idx, user_created_idx |
| security_events | 2141 | type,ip,user_agent,details | user_id→users:S | user_created_idx, type_created_idx |
| cms_banners | 2168 | placement,title,subtitle,image_url,link_url,sort_order,status,starts_at,ends_at | created_by→users:S | placement_status_sort_idx, status_starts_idx |
| cms_blocks | 2203 | block_key,content,status | created_by→users:S | block_key_unique |
| support_tickets | 2232 | ticket_number,subject,status,priority,sla_due_at,resolved/closed_at,resolution_rating/comment | user_id→users:R; assignee/order/rental:S | ticket_number_unique; status_created/assignee_status/user_created/sla idx |
| ticket_messages | 2292 | body,is_internal | ticket_id→support_tickets:C; author_id→users:R | (ticket,created) |
| ticket_attachments | 2321 | file_name,url,mime_type,size_bytes | ticket_message_id→ticket_messages:C | message_id_idx |
| refunds | 2344 | refund_number,amount,currency,reason,status,provider_reference,idempotency_key | order_id→orders:R; order_item/transaction:S; user_id→users:R; created_by:S | number_unique, idempotency_key_unique; order/status/user idx |
| disputes | 2390 | dispute_number,status,reason,description,resolution,resolved_at | order_id→orders:R; opened_by/against_user/resolved_by | number_unique; status/order/user idx |
| commission_rules | 2429 | scope,percent_bp,fixed_fee_paise,effective_from/to | category/seller/created_by:S | (scope,category,seller,effective_from) unique; CHECKs |
| seller_verifications | 2497 | status,document_type,document_ref_hash,submitted/reviewed_at,rejection_reason | seller_id→users:R; reviewed_by:S | seller_status_idx, status_created_idx |
| coupons | 2541 | code,description,discount_type,discount_value,max_discount/minimum_order_paise,usage_limit,per_user_limit,used_count,starts/ends_at,status,applies_to,stackable,allow_deposit_discount | category/seller/product/created_by:S | code_unique; status_starts/category/seller/product idx; many CHECKs |
| coupon_redemptions | 2636 | discount_paise | coupon_id→coupons:C; user_id→users:R; order_id→orders:R | (coupon,order) unique; user/coupon idx |
| feature_flags | 2667 | key,description,enabled,rollout_percent,audience | created_by:S | key_unique; enabled_idx |
| app_config | 2692 | config_key,value | updated_by:S | config_key_unique |
| export_jobs | 2714 | job_key,type,scope,status,file_url,error_message,row_count,expires_at | requested_by→users:R | job_key_unique; user/status idx |
| rate_limit_counters | 3475 | bucket_key varchar(190) PK,count,window_started_at,expires_at | - | expires_idx |

### 4.3 Enums
All `as const` varchar vocabularies, re-exported through `server/lib/enums.ts`. Highlights (name → values @ loc): PRODUCT_STATUSES DRAFT/PUBLISHED/OUT_OF_STOCK/PAUSED/ARCHIVED (`product-status.ts:22`); ORDER_STATUSES PENDING_PAYMENT/CONFIRMED/PROCESSING/READY_FOR_PICKUP/SHIPPED/DELIVERED/COMPLETED/CANCELLED (`order-queries.ts:25`) + legacy PAID (`:43`); RENTAL_STATUSES CONFIRMED/ACTIVE/RETURN_PENDING/OVERDUE/RETURNED/COMPLETED/CANCELLED/DISPUTED (`rental-lifecycle.ts:31`); USER_ROLES USER/SELLER/ADMIN (`enums.ts:89`); SYSTEM_ROLES SUPER_ADMIN/ADMIN/SUPPORT/FINANCE/MODERATOR/CONTENT_MANAGER (`:200`); TICKET/REFUND/DISPUTE/CMS/COUPON/COMMISSION/EXPORT/SECURITY enums at `enums.ts:218-336`. No MySQL ENUM types anywhere.

### 4.4 Required-list comparison
EXISTS: users, sessions, addresses, categories (parent_id tree), tags (product_tags), products, product_images, favorites, carts, cart_items, orders, order_items (price snapshots ✓), order_events, rentals, rental_events, stock_reservations, idempotency_keys, transactions, payment_webhook_events, refunds, disputes, coupons, coupon_redemptions, commission_rules, payouts, seller_profiles, seller_verifications, reviews, reports, conversations, conversation_participants, messages, notifications, notification_preferences, support_tickets, ticket_messages, roles, permissions, role_permissions, user_roles, user_mfa, login_attempts, security_events, audit_logs (= admin_audit_log), platform_settings, feature_flags, app_config, cms_banners, cms_blocks, export_jobs, search_history.
**MISSING: brands (brands + products.brand_id), attribute_definitions, product_attribute_values, collections (+items).**
PARTIAL: categories supports only parent→child (no explicit depth/path columns, no 3-level guarantee); products.brand is a free-text column; tags exist but are free-form strings.

### 4.5 Migrations
30 `.sql` files in `drizzle/`; last is `0029_true_squirrel_girl.sql` (untracked, for the coupon work). `drizzle/meta/_journal.json` is modified (uncommitted). A hand-written FULLTEXT index lives only in `drizzle/0019_fulltext_search_backfill.sql:21` on `products.search_text` (drizzle-kit cannot express FULLTEXT); `products_title_idx` is the prefix-LIKE fallback (`schema.ts:302`). `drizzle/0016_*.sql:89,111` dropped an index and added `transactions_provider_reference_unique`. No destructive `DROP TABLE`/`RENAME` was found in the reviewed migrations. **UNVERIFIED**: a full drift check between `schema.ts` and the generated snapshot was not run (no migration application performed, per read-only rule).

### 4.6 Indexes / FULLTEXT
Heavy index coverage on products/rentals/orders/wallet/transactions (listed above). FULLTEXT only the hand-written `products_search_fulltext`. Potential gaps: `reviews` listing sorts by `product_status_created` (covered); admin filters over many columns rely on composite indexes partially; `conversation_participants`/`messages` have conversation-scoped indexes.

### 4.7 Seed
Pipeline `pnpm db:seed` = `seed.ts` (demo) → `seed-products.ts` (~20k products) → `seed-history.ts` (volume orders/rentals/reviews) → `seed-admin.ts` (staff, RBAC, audit, tickets, refunds, disputes, coupons, CMS, payouts, sessions/security). Deterministic hand-rolled PRNG (no faker), **refuses to run when `NODE_ENV=production`** (`seed.ts:164-170`; other seeders likewise), TRUNCATEs first (`server/lib/seed-truncate.ts`). Default credentials are read from env with dev fallbacks (`config.ts:35-37`): `admin@revaro.local` / `revaro-dev-2026` / shared `DEMO_PASSWORD`; seeds also set `must_change_password` / `must_enroll_mfa`. **`seed.ts:1899-1901` prints the admin + demo passwords to stdout** (logged credential). Realism checks: buy prices 8–30× daily rent and deposits 10–25% of buy (`seed-products.ts`); products 4–8 subcats, 30+ brands (as free-text), 40+ tags, 25+ attribute defs are **not** present (no attribute tables); `search_history`, `feature_flags`, `app_config`, `export_jobs`, `seller_verifications`, `commission_rules` are seeded but have **no runtime readers**.

---

## SECTION 5 — FEATURE STATUS MATRIX

Legend: VBT = verified-by-test, WORK = implemented, PART = partial, 0% = absent.

### Customer
| Feature | Status | Gap / evidence |
|---|---|---|
| Homepage / hero | WORK | Hero, rails, CMS banners (`home/components/HeroSection.tsx`, `cms.ts:22`) |
| Categories | WORK | 2-level tree, featured flag (`schema.ts:179`) |
| Browse / filters | VBT | Server-side search/filter/sort/page, fulltext (`products.ts:499`, `tests/browse-search.test.ts`) |
| Search + suggestions | PART | Debounced field only; **no suggestions/autocomplete**, `search_history` unwritten by app (`schema.ts:1905`; routes searched → NOT FOUND) |
| Product details | VBT | Detail/related/availability (`products.ts:593,675,714`) |
| Favorites | VBT | DB-backed, unique, optimistic (`market.ts:84-241`) |
| Cart | VBT | Server pricing, save-for-later, rental dates (`market.ts:380-596`) |
| Checkout / addresses | WORK | **tax hardcoded 0** (`checkout.ts:310`) |
| Payments + QR | PART | Mock only; real provider throws 501 and mock refused in prod; in-memory intent store (`payments/index.ts:50-76`, `mock-provider.ts:106`) |
| Orders | VBT | List/detail/cancel/re-order/timeline (`orders.ts:109-680`) |
| Rentals / extensions | PART | **Extension recorded but not charged** (`rental-admin.ts:490-523`) |
| Dashboard | WORK | Stats + quick actions |
| Profile | VBT | Details/avatar/password/sessions/MFA |
| Notifications | VBT | Feed/unread/prefs/dedupe (`notification-events.ts`) |
| Messaging | VBT | Participant-scoped threads, blocks |
| Reviews | VBT | Product/mine/seller/moderation/replies/helpful |
| Reports (user) | VBT | `reports.ts:18`, `tests/report-routes.test.ts` |
| Support tickets | VBT | Create/thread/rate, internal notes hidden |
| Coupons (customer) | PART | Redemption at checkout only; no coupons centre |

### Seller
| Feature | Status | Gap / evidence |
|---|---|---|
| Onboarding | VBT | USER→SELLER, idempotent (`seller.ts:72-179`) |
| Listings CRUD + images | WORK | Full CRUD + provider uploads; Supabase path unverified live |
| Seller orders | VBT | Fulfillment transitions, bulk + undo (`seller-orders.ts`) |
| Seller rentals | WORK | Route + feature wired |
| Payouts / wallet | VBT | Ledger, balance, payout lifecycle, methods (`wallet.ts`) |
| Seller dashboard / analytics | WORK | Summary/alerts/period analytics |

### Admin (16) + product management + taxonomy
| # | Module | Status | Gap / evidence |
|---|---|---|---|
| - | Product management | WORK | Paged catalogue, bulk, relations, per-image desk (`admin.ts:447-680,1528-1730`) |
| 1 | Users | WORK | Directory + suspension (`admin.ts:1199,2692`) |
| 2 | Content mgmt | WORK | Banners/blocks CRUD/order (`admin.ts:2874-3078`) |
| 3 | Payments/refunds/commission | WORK | Finance, txns, refund queue + step-up; **commission_rules unused at runtime** (`schema.ts:2429`) |
| 4 | Notifications/announcements | PART | Admin sees own feed; **no broadcast composer** (searched → NOT FOUND) |
| 5 | Reports/exports | PART | Moderation + **coupon CSV only**; `export_jobs` seed-only |
| 6 | Roles/permissions | VBT | RBAC + catalogue, asserted complete (`admin-permissions.test.ts`) |
| 7 | Orders/disputes | WORK | State machines, notes, forced status, disputes |
| 8 | Support tickets | VBT | Staff inbox/replies/status |
| 9 | Live analytics | PART | Live SQL aggregates only; **no SSE/WebSocket** (grep NOT FOUND) |
| 10 | Audit logs | WORK | Immutable audit + reader (`admin.ts:1732`) |
| 11 | Feature flags/config | PART | Tables exist + seeded, **no API/UI**; `/admin/settings` placeholder (`AdminSettingsPage.tsx:20-44`) |
| 12 | Coupons | VBT | CRUD, redemptions, CSV |
| 13 | Vendor mgmt | PART | List + verification toggle only; `seller_verifications` unused |
| 14 | Content moderation | WORK | Queue/decisions/flag-words (`moderation.ts`) |
| 15 | Sessions/devices | PART | **Self-service only**; no admin session/device mgmt (`auth.ts:571-590`) |
| 16 | Versioning/maintenance | PART | CMS history via audit; **maintenance mode absent** (`app_config` unread) |
| - | **Taxonomy** | PART | Category tree WORK, tags WORK (free-form); **brands = free text, attributes & collections MISSING** |

### 5.1 "Everything is connected" end-to-end trace
Trace: `seller.ts:350` create → `products.ts:499` browse → `market.ts:421` cart → `payments.ts:204` intent → `payments.ts:364` verify → `order-creation.ts:82` order → `orders.ts:922` rentals → `seller-orders.ts:39` → `admin.ts:683`. Happy path is coherent; break points found:
1. **Tax is always zero** — `server/lib/checkout.ts:310` (`const tax = 0`); `orders.tax` supported but never calculated.
2. **Rent-to-own buy bypasses the payment pipeline** — `orders.ts:1430-1513` writes an order with `status:"PAID"` (legacy value, not in `ORDER_STATUSES`), leaves `paymentStatus` at default `PENDING`, no `orderNumber`, `transactions.provider` hardcoded `"mock"`, and **does not re-check rental status** (can "buy" a returned/cancelled rental).
3. **Rental cancellation fabricates a refund** — `orders.ts:1382-1390` inserts a `REFUND` transaction `provider:"mock"` with a timestamp id, never calling `provider.refundPayment` (non-idempotent, no real money).
4. **Extension approved without charging** — renter request records the ask (`orders.ts:1205-1292`); admin approval shifts `endDate` and quotes but collects nothing (`rental-admin.ts:490-523`). Status gate mismatch: request allows `ACTIVE|CONFIRMED` (`orders.ts:1218`) while approval allows any non-closed status (`rental-admin.ts:470`).
5. **Production payments impossible** — `payments/index.ts:71-75` returns 501 for any real provider; mock refused in production; mock intent store is an in-memory `Map` lost on restart (`mock-provider.ts:106-107,170-184`).
6. **Replayed order reports `rentalCount: 0`** — `order-creation.ts:113`.
7. **RTO/cancel paths emit no order events/notifications** (`orders.ts:1430-1513`, `:1356-1426`) vs `order-creation.ts:355-466` — admin order-health and activity feeds miss them.

---

## SECTION 6 — SECURITY AUDIT (20 checks)

| # | Check | Verdict | Evidence / fix |
|---|---|---|---|
| 1 | SQL injection | PASS | Drizzle builder throughout; ORDER BY is whitelist-mapped (`admin-products.ts:53-60`, `order-queries.ts:223`, `products.ts:459-478`); `sql.raw` only over a hardcoded table list in `seed.ts:176`; no request-reachable raw identifiers. (But see #20.) |
| 2 | XSS | PASS | No `dangerouslySetInnerHTML`/`innerHTML` in `src`; URLs validated (`validation.ts:45-56`, `cms.ts:46-58`, `image-urls.ts:20-34`) |
| 3 | CSRF | PASS | Double-submit cookie + `X-CSRF-Token`, constant-time compare (`security.ts:287-353`), SameSite=Lax (`auth.ts:99-107`) |
| 4 | File uploads | PASS | MIME allowlist without SVG, magic-byte sniff, extension from MIME, size check, owner-prefixed keys (`storage/types.ts:19-39,84-86,167-173`, `magic.ts:58-83`, `storage.ts:141-155`); dev sink refused in prod (`dev.ts:65-71`). Minor: key suffix uses `Math.random()` (`types.ts:208`) |
| 5 | IDOR / object authz | PASS | Ownership in the predicate → 404 (`orders.ts:219,395,1064,1127`; `market.ts:508,648`; `seller.ts:1169`; `messaging.ts:301,365`; `support.ts:98`). Cosmetic: `rentals/:id/buy` 403s elsewhere 404s (`orders.ts:1433`) |
| 6 | Rate limiting | PARTIAL | Budgets defined but **many mutating endpoints unbudgeted**: reviews, favorites, cart, addresses, notifications, rental actions, order-again, wallet methods, seller-orders fulfillment, seller product writes. Emulated: add budgets via `guarded(...)`. Stale comment `env.ts:155` references a removed global limiter |
| 7 | JWT secrets | PASS | Env-only, ≥32 chars, no fallback (`env.ts:90-103,163-179`); HS256 pinned + issuer/audience (`jwt.ts:88-122`). Stale `SESSION_SECRET` in `.env.example`/README |
| 8 | Exposed secrets (source + history) | PASS | `git log --all -S` on secret names matched only `.env.example` (empty) and source; `sk_live` none; `AKIA`/`-----BEGIN` only a vendored binary in `.opencode/`. `.env` gitignored |
| 9 | Password hashing | PASS | scrypt N=2^15 r=8 p=1, 16-byte salt, 64-byte key, `timingSafeEqual`; legacy bcrypt upgrade-on-login (`password.ts:38-51,244-281`) |
| 10 | MFA | PASS | `requireMfaEnrolment` on admin/staff (`permissions.ts:175-202`, `admin.ts:183-188`); TOTP secrets AES-256-GCM (`mfa.ts:36-81`); recovery codes hashed; replay blocked (`mfa-service.ts:183-194`); step-up on money/RBAC |
| 11 | CORS | PASS | Origin allowlist, no `*`, credentials only for verified origins, `Vary: Origin` (`security.ts:245-271`) |
| 12 | Tokens in browser storage | PASS | None in localStorage/sessionStorage/IndexedDB/TanStack DB; only theme + a session-sync broadcast timestamp (`theme-utils.ts`, `session-sync.ts:61`); tokens are HttpOnly cookies |
| 13 | Client-only permission enforcement | PASS | Server enforces everywhere; React `beforeLoad` is UX only (`admin.tsx:31`, `_authenticated.tsx:25`) |
| 14 | Missing row-level security | PASS (app-level) | Session-derived scoping in predicates; `selfEditableProfileFields` whitelist prevents mass-assignment (`auth.ts:808-847`). No MariaDB RLS (architectural residual) |
| 15 | Webhook signatures | PASS (mock caveat) | HMAC verified before parse (`payments.ts:543-551`), constant-time (`mock-provider.ts:56-65`), replay idempotent (`payments.ts:579-584`). Mock key is a dev constant; no production provider ships |
| 16 | SSRF | PASS | Only server fetch targets configured `SUPABASE_URL` (`storage/supabase.ts:48,86`); image URLs validated for the browser, not fetched |
| 17 | Exposed source maps | PASS | `vite.config.ts:17-19` `sourcemap:false`; no `.map` in `dist` |
| 18 | Default credentials | PARTIAL | `config.ts:35-37` + `.env.example:23-25` publish `admin@revaro.local`/`revaro-dev-2026`; mitigated by seed prod-guard, no `VITE_`, prod-disabled MFA bypass. Residual: dev-seeded DB promoted to prod keeps a published password. Fix: require env or force rotation on first login (`must_change_password` exists) |
| 19 | Sensitive data in logs | PARTIAL | Redacting logger (`logger.ts`), bodies never logged. But `seed.ts:1899-1901` prints passwords; `payments.ts:699` logs raw error object; `index.ts:114,158` log DB errors. Fix: drop password from seed output; log `error.message` |
| 20 | Vulnerable dependencies | FAIL | `pnpm audit`: critical shell-quote (dev), high drizzle-orm <0.45.2 (runtime; identifier-escaping SQLi — this code passes no raw identifiers, so exposure is low but upgrade is required), high source-map-js (dev), moderate esbuild (dev) |

Extra: security headers PASS (`security.ts:51-71`: CSP default-src 'none', HSTS, nosniff, referrer, permissions, X-Frame-Options, X-Powered-By removed); cookie flags PASS (httpOnly/SameSite=Lax/secure-in-prod, `auth.ts:75-117`); session revocation PASS (`auth.ts:586-699`, reuse detection `:375-381`); account suspension PASS (`attachUser` treats non-ACTIVE as no session `:551-563`, `suspendUser` deletes sessions `:716-723`); admin route protection server-side PASS; error leakage PASS (`api.ts:62-82`); **least-privilege DB FAIL** — `server/db.ts:19-28`/`db-credentials.ts:24-30` default to `DB_USER=root` empty password and production only requires *some* DB config (`env.ts:235-240`).

---

## SECTION 7 — AUTH AND PERMISSIONS DETAIL

- **Registration/login** (`routes/auth.ts`): register validates `registerSchema`, policy-checks the password (`password.ts`), hashes with scrypt, creates the user, then `issueSession`; login validates `loginSchema`, loads the user, `verifyAndRehash` (upgrades legacy bcrypt), `assertAccountActive`, and either issues a session or returns an MFA ticket (`auth.ts:363` challenge). Login throttling is both the `auth.login` budget and the durable `login_attempts` lockout (`env.ts:159-161`, `security-log.ts`).
- **Where redirect goes (`src/features/auth/route.tsx:18-21`)**: `getPostAuthTarget(redirect)` resolves the `redirect` search param; default **`/dashboard` for every role**; only safe internal paths are honoured (single `/`, not `//`, no scheme/backslash/`@`/control chars/encoded variants, ≤200, not `/login|/register`). Tests: `tests/auth-guards.test.ts` (exact table). Login/Register navigate `replace:true` after seeding the user into the Query cache; `beforeLoad` on `_auth` uses `requireGuest` (signed-in → `/dashboard`). **Open-redirect risk: PASS.**
- **Logout cleanup**: `revokeCurrentSession` deletes the session row and clears all auth cookies (`auth.ts:462-473`); client clears the auth query + private TanStack DB collections + sensitive caches.
- **Password hashing**: Node **scrypt** N=2^15, r=8, p=1, salt 16B, key 64B, versioned `scrypt$N$r$p$keylen$salt$digest`; `timingSafeEqual`; legacy bcrypt (bcryptjs) verifies once then rehashes (`password.ts:38-51,179-281`). `BCRYPT_ROUNDS` (default 12, clamp 10–15) is retained for the legacy path (`config.ts:92-95`).
- **Tokens**: access = JWT HS256, TTL **15 min** (env `AUTH_ACCESS_TTL_SECONDS`), claims `{sub,sid,role,iat,exp}`; refresh = opaque 32-byte token, TTL **7 days**, stored SHA-256 in `sessions`, single-use with 60 s rotation grace and reuse-kill (`auth.ts:290-450`, `env.ts:37-69`). Both in `HttpOnly; SameSite=Lax; Path=/; Secure`-in-prod cookies. The client never sees a token; `role` in the JWT is never trusted for authorization.
- **Session table usage**: every request re-reads the `sessions` row (existence, not revoked, not expired) and the `users` row (ACTIVE), so role change/delete/suspend takes effect immediately (`auth.ts:532-567`).
- **Role model**: coarse `users.role` (`USER|SELLER|ADMIN`) plus RBAC tables (`roles/permissions/role_permissions/user_roles`, system roles incl. SUPER_ADMIN). Permission resolution is DB-backed with a 30 s per-process cache, invalidated on writes (`permissions.ts:38-118`).
- **Server permission decision**: router middleware (`requireAdmin`/`requireMfaEnrolment`/`requirePermission`) + ownership predicates using session-derived ids; the JWT role claim and request bodies are never trusted (`permissions.ts:1-27,130-217`).
- **MFA state**: `user_mfa` (encrypted TOTP secret, `enabled_at`, `last_used_at`), `mfa_recovery_codes` (hashed). MFA ticket between password and code has a distinct audience and 5-min TTL (`jwt.ts:145-193`). Dev bypass allowlist, hard-off in production (`config.ts:58-68`).
- **Password reset**: `forgot` mints a hashed `password_reset_tokens` row (TTL 1 hour) and emails an `APP_URL` link; `reset` consumes it; both rate-limited per IP and per account (`auth.ts:454-509`, `env.ts:148`).

---

## SECTION 8 — UI/UX AUDIT

- **Tokens**: `src/styles.css` (738 lines). Colours `--color-*` light (`:11-47`) + dark (`:161-186`); theme via `.dark` overrides and Tailwind v4 `@theme` mapping (`:343-364`); fonts `--font-sans "DM Sans"`, `--font-heading "Nunito"` (`:365-366`); radii incl. `--radius-4xl 2rem` (`:367`). Elevation scale: `--elev-0/1/2/pressed` light (`:148-153`) and dark (`:199-201`), plus legacy named shadows `--elev-inset/card/card-hover/raised/floating/modal/sheet/drawer/header` (`:103-124`, dark `:205-209`), exposed as Tailwind `@utility elev-*` (`:246-281`). Neu­morphic shadow colours `--shadow-color-dark/light` (`:59-60,189-190`).
- **Components**: `src/components/ui/` — badge, button, card, dialog, dropdown-menu, input, native-select, sheet, skeleton, table, textarea, tooltip. Shared — auth-gate, avatar, empty-state, GoToTop, pagination, product-card, product-grid, product-image (+ `product-filters/`). Layout — site-header/footer, AuthenticatedLayout/Sidebar/Topbar/ProfileMenu/MobileNav, nav config.
- **Button**: one cva family (`button.tsx`) with variants primary/default/secondary/accent/danger/destructive/ghost/inset/chip/icon and sizes sm 32 / default 40 / lg 48 / icon 40; `loading` with `aria-busy`; accent focus ring; `btn-compact` raises min-height to 44 on coarse pointers. Measured contrast (light/dark): primary 4.80/5.14, secondary 11.83/15.96, accent tonal 9.70/12.03, danger solid 5.25/4.92, chip 8.73/12.02, ghost/inset/icon 11.83/15.96, legacy `destructive` 3.94/4.33 (unchanged, palette-bound).
- **Glow audit**: no `rgba(255…)` white halos on controls; `.inset-surface` uses `--elev-pressed` with a 1-px `--inset-border` (no light rim); dark `.dark-inset` is inset-only (`styles.css:649-683`). Remaining legacy named shadows exist but are used by modal/sheet/drawer/header. No ad-hoc `shadow-sm/md/lg/xl/2xl` utilities remain in `src`. `--elev-2` retains a light highlight (≤35%) for cards, per the elevation spec.
- **Search**: `ProductFiltersBar`-adjacent `src/components/shared/product-filters/SearchBar.tsx` (400 ms debounce), `HeroSearch.tsx`, `OrdersSearch.tsx`, `RentalsSearch.tsx`, `AdminSearch.tsx`. Navbar search is a separate inline `<form class="relative w-56">` in `site-header.tsx:115` and a second form at `:198` (mobile). **Defect: navbar search and hero search are both visible on desktop (two bars); no shared `SearchBox` abstraction; no suggestions/trending; `/browse` reads a `search` param (`site-header.tsx:62`)**.
- **Navbar / hero**: nav labels can wrap (no `whitespace-nowrap`); below 1024 px the menu button/panel is now `lg:hidden` (fixes the 768–1023 dead zone). Hero chips are absolutely positioned inside the image frame with hard-coded offsets (overlap risk at 360/390 not programmatically clamped). Floating rail reduced to cart-only (fades in after 400 px) + `GoToTop` (threshold 400), hidden on `/_auth/*`, `/cart`, `/checkout*`, `/payment*` (`__root.tsx`).
- **Product card**: equal-height footer implemented (`flex h-full flex-col`, `flex-1`, `mt-auto grid-cols-[1fr_auto]`, `min-h-12`), 4/3 image, sentence-case 2-line clamp title, location row. Price helper: `src/lib/pricing.ts` (one INR formatter to reuse).
- **Responsiveness**: hard-coded widths exist (e.g. navbar `w-56`, hero chip offsets); tables have no dedicated mobile layout (admin tables rely on horizontal scroll); tap-target heights are handled by `btn-compact` on coarse pointers.
- **Accessibility**: icon-only controls generally carry `aria-label`/tooltips (GoToTop, FloatingActions, menu, MFA); focus-visible ring is accent. Gaps: some `motion` blocks ignore `useReducedMotion` (Section 3.5); heading order not audited per page; colour contrast computed above; nav label wrapping.
- **Loading/empty/error states**: skeletons + empty/error states exist across browse/favorites/orders/rentals/notifications/messages/support/admin; `/admin/settings` is a placeholder; some list pages (brochure-style) lack explicit error states.
- **Images**: `product-image.tsx` + `image-urls.ts` provide fallbacks/aspect ratios/lazy loading; admin/seller galleries use `elev-*`; Supabase adapter unverified live.

---

## SECTION 9 — PERFORMANCE

- **Bundle**: a single ~3.17 MB JS chunk (660 kB gzip) with no route-level `React.lazy`/code splitting — biggest render/network hotspot. `framer-motion`, `@tanstack/*`, Radix and all admin pages are in the initial chunk.
- **N+1 suspects**: seller-admin list/detail queries (`admin.ts` order/rental detail dialogs) and notification fan-out (`notification-events.ts`, 815 lines) should be reviewed; order/rental listing endpoints use joins (`order-queries.ts`, `rental-queries.ts`) rather than lazy per-row loads. **UNVERIFIED** without DB access/EXPLAIN.
- **Pagination**: product/order/rental/admin list endpoints accept page params; some admin list endpoints return full result sets for small tables. Coupon CSV export capped 5,000 rows.
- **Indexes**: strong coverage (Section 4.6); FULLTEXT search via migration 0019.
- **Over-fetching / refetching**: global `staleTime 60 s`, no window-focus refetch; TanStack DB derives from Query with a single writer; optimistic updates on favourites/cart/notification-read.
- **Images**: lazy loading + provider URLs; dev disk sink serves via `/api/storage/local`.
- **Render hotspots**: large admin pages (`AdminContentPage.tsx` 1206 lines, `AdminProductsTable.tsx` 811) and admin `query.ts`/`api.ts` (1857 lines) are the largest UI files.

---

## SECTION 10 — TESTS, CI/CD, OPERATIONS

- **Tests**: 127 files under `tests/` (116 counted by vitest run; the extra are fixtures/support). Areas: auth/security (`auth-jwt`, `auth-session`, `auth-session-rotation`, `auth-guards`, `password`, `totp`, `mfa`, `mfa-ticket`, `client-token-hygiene`, `no-client-secrets`, `dev-credentials`, `api-security`, `security-layer`, `api-client-csrf`, `http-routing`); authorization (`admin-permissions`, `admin-authorization`, `admin-nav-permissions`, `permissions-guards`, `admin-separation`, route suites); payments (`payment-api/-order/-provider/-page/-schema`, `upi-payment`, `upi-qr-panel`); pricing (`pricing`, `coupon-engine`, `wallet-ledger`); state machines (`rental-lifecycle`, `orders-*`, `seller-order-fulfillment`, `seller-bulk-fulfillment`, `admin-orders`, `admin-refunds`, `wallet-payout`, `activity-timeline`, `undo-window`); admin (`admin-*`, `cms`, `db-schema`, `seed-truncate`, `tanstack-db-sync`).
- **Untested / weak**: no server integration or DB tests (everything is pure/jsdom); RTO buy (`orders.ts:1430`), rental-extension charging (`rental-admin.ts:452`), tax (`checkout.ts:310`) untested; no migration tests; no concurrency test for the rental-overlap race; no feature-flag/app-config tests; no email delivery tests; no live Supabase adapter tests; no E2E/browser tests.
- **CI/CD**: single workflow `.github/workflows/work.yml`, job `Rental-erp-deploy`, **on push to `main` only**: checkout → pnpm setup → node 22 → `pnpm install --frozen-lockfile` → `npm run build` → SSH key/host → `rsync -avz --delete` the repo to the host → `ssh … "cd $SSH_PATH"` and **stop** (`work.yml:46-48`).
  - **No tests, no lint, no typecheck** in CI (only build). AGENTS.md's mandated order is not enforced.
  - **No migration step**, **no rollback**, **no backup**, **no hot reload/restart** (the deploy step is effectively a no-op after `cd`; a "successful" run may not start the new build).
  - **Health check**: none in CI; app exposes `GET /api/health` (`server/index.ts:109`).
  - **Logging/monitoring**: app logger only; no APM/alerting.
- **Deployment target**: rsync + SSH (no container/artifacts).

---

## SECTION 11 — CODE QUALITY AND DEBT

- **Largest files**: `server/schema.ts` 3332, `server/routes/admin.ts` 2872, `src/features/admin/api.ts` 1857, `server/seed.ts` 1852, `src/routeTree.gen.ts` 1676 (generated), `server/lib/wallet.ts` 1588, `src/features/admin/query.ts` 1467, `server/routes/orders.ts` 1391, `AdminContentPage.tsx` 1206, `server/seed-history.ts` 1174, `server/routes/seller.ts` 1069, `server/lib/support.ts` 929, `server/seed-admin.ts` 927.
- **`any` / suppressions**: effectively zero. ~76 `as any` only in generated `routeTree.gen.ts`; 0 `@ts-ignore`/`@ts-expect-error`; 2 `eslint-disable` (1 intentional in `ProductFiltersBar.tsx:68`, 1 generated).
- **TODO/FIXME/HACK**: 0 genuine (matches are `XXXX` number placeholders and the support keyword `"hacked"`).
- **`console.*` in server**: ~141, almost all in ops/seed scripts (`seed.ts:16`, `seed-history.ts:34`, `seed-admin.ts:28`, `db-verify-constraints.ts`, `db-reset.ts`, `repair-demo-images.ts`). Runtime logging centralised in `logger.ts`, `index.ts:215`, `auth.ts:533`. `src` has 0 stray logs.
- **Duplicated / bypassed logic**: payment-provider literals hardcoded in `orders.ts:1388,1473,1506` and `schema.ts:490`; RTO/cancel paths re-implement order/transaction writes instead of `order-creation.ts` (duplicated money logic).
- **Dead-but-seeded tables** (zero runtime readers): `feature_flags`, `app_config`, `export_jobs`, `search_history`, `seller_verifications`, `commission_rules`. `/admin/settings` is a stub.
- **Repo hygiene**: `README.md` has unresolved merge-conflict markers at lines 1, 74, 645, 651, 764, 976; `.env.example` declares `PAYMENT_PROVIDER` twice; root clutter `dbg.mjs`, `dash.log`, `dev.log`, `tests-baseline.log`.
- **Naming/consistency**: money consistently paise; ids via `newSessionId`/`reference-numbers.ts`; statuses as varchar; `provider` literals are the main inconsistency.
- **Circular imports**: none detected; no `madge`/`dependency-cruiser` config. **UNVERIFIED** beyond `tsc` passing both projects.
- **Docs**: `AGENTS.md`, `PRODUCT.md`/`DESIGN.md` (untracked), `docs/database.md` (modified), `knowledge.md`.

---

## SECTION 12 — TOP PROBLEMS (ranked)

| Rank | Severity | Area | Problem | Evidence | Impact | Effort | Depends on |
|---|---|---|---|---|---|---|---|
| 1 | Critical | Payments | Only a dev mock exists; real provider name throws 501 and the mock refuses to start in production | `payments/index.ts:50-76`, `mock-provider.ts:106` | Checkout cannot complete in production → no revenue | L | — |
| 2 | Critical | Orders | Rent-to-own "buy" bypasses the whole payment pipeline; writes legacy `PAID`, `paymentStatus=PENDING`, no order number, hardcoded mock transaction, no rental-status recheck | `orders.ts:1430-1513` | Free purchases; inconsistent order/payment data | M | Payment provider (#1) |
| 3 | High | Payments | Rental cancellation fabricates a `REFUND` transaction with a timestamp id and never calls the provider refund | `orders.ts:1382-1390` | No real money moved; non-idempotent ledger | M | Payment provider (#1) |
| 4 | High | Rentals | Extension requests are approved without collecting any charge | `rental-admin.ts:490-523`, `orders.ts:1205-1292` | Revenue leak; incorrect rental totals | M | — |
| 5 | High | Tests | Flaky test makes the suite red (`password.test.ts` tamper can be a no-op) | `tests/password.test.ts:54-56` | Gate non-reproducible; erodes trust | S | — |
| 6 | High | Security | Vulnerable deps: drizzle-orm <0.45.2 (runtime SQLi advisory), shell-quote critical (dev), source-map-js high, esbuild moderate | `pnpm audit` | Potential identifier-escaping SQLi; CI/dev exposure | S | — |
| 7 | High | Frontend | 11 routes unreachable because 5 parent pages render no `<Outlet/>` (profile/*, orders/$id, rentals/$id, admin/reviews/sellers, seller product new/edit) | `orders/index.tsx:43`, `rentals/index.tsx:49`, `profile/index.tsx`, `AdminReviewsPage.tsx:53`, `seller-listings/index.tsx:43` | Core user/seller flows break on navigation | S | — |
| 8 | High | Search | No suggestions/autocomplete; `search_history` has no writer/reader; navbar + hero search both visible on desktop; no shared component | `site-header.tsx:115,198`, `HeroSearch.tsx`, `schema.ts:1905` | Poor discovery UX; query data never captured | M | — |
| 9 | High | Taxonomy | Brands/attributes/collections absent; `products.brand` free text; no server-validated attributes | `schema.ts:205`, required-list §4.4 | Blocks structured catalogue and facets | L | — |
| 10 | High | Admin | Feature flags/app_config have no API/UI; `export_jobs` unused; no announcements; no admin session/device mgmt; no maintenance mode; `seller_verifications`/`commission_rules` unused | `AdminSettingsPage.tsx:20-44`, `schema.ts:2497,2429,2667,2692,2714` | 5 of 16 admin modules are partial | L | — |
| 11 | High | CI/CD | Deploy workflow runs only build then `cd`; no tests/lint, no migrations, no rollback/backup/restart | `.github/workflows/work.yml:46-48` | Broken/unsafe delivery | M | — |
| 12 | High | Security | DB user defaults to `root` with empty password; production only requires *some* DB config | `server/db.ts:19-28`, `db-credentials.ts:24-30`, `env.ts:235-240` | Least-privilege violation | S | — |
| 13 | Medium | Checkout | Tax is hardcoded to 0 | `checkout.ts:310` | Incorrect totals/compliance | S | — |
| 14 | Medium | Security | Default credentials published in repo and seeded | `config.ts:35-37`, `.env.example:23-25` | Account takeover if a dev DB is promoted | S | — |
| 15 | Medium | Security | Rate limiting missing on many mutating endpoints | `rate-limit.ts` vs routes in §6#6 | Abuse/flood/grind | M | — |
| 16 | Medium | Ops | Seed prints passwords; some handlers log raw errors | `seed.ts:1899-1901`, `payments.ts:699`, `index.ts:114,158` | Credential/secret leakage into logs | S | — |
| 17 | Medium | Perf | Single 3.17 MB JS chunk, no route-level splitting | build output | Slow first load | M | — |
| 18 | Medium | Tests | No server/DB integration tests; money paths untested; no E2E | `tests/` | Regressions reach production | L | — |
| 19 | Medium | Repo | README merge-conflict markers; duplicate env var; root log artifacts | `README.md:1,74,645,651,764,976`, `.env.example` | Onboarding/hygiene | S | — |
| 20 | Medium | Data | Order/rental RTO+cancel paths emit no events/notifications | `orders.ts:1430-1513,1356-1426` | Admin health/activity blind spots | S | — |
| 21 | Medium | Rentals | Extension status-gate mismatch between request and approval | `orders.ts:1218` vs `rental-admin.ts:470` | Inconsistent transitions | S | — |
| 22 | Medium | Data | 6 seeded-but-unused tables + stub admin settings | §11 | Dead surface; wrong expectations | M | #10 |
| 23 | Medium | Frontend | Nav labels can wrap; hero chips hard-coded offsets (overlap at 360/390); no shared `SearchBox` | `site-header.tsx`, `HeroSection.tsx` | Visual defects on small viewports | M | — |
| 24 | Medium | Frontend | Several Framer Motion blocks ignore `useReducedMotion` | §3.5 | Accessibility | S | — |
| 25 | Medium | Data | Coupon single-code semantics; deposit-discount flag | `coupon.ts`, `005`? | Business-rule risk | S | — |
| 26 | Low | Storage | Upload key suffix uses `Math.random()` not CSPRNG | `storage/types.ts:208` | Predictable object key (behind owner prefix) | S | — |
| 27 | Low | Auth | Stale `SESSION_SECRET` still shipped in `.env.example`/README | `.env.example:28`, `README.md:669` | Confusion | S | — |
| 28 | Low | API | `rentals/:id/buy` returns 403 where the rest of the API 404s | `orders.ts:1433` | Existence oracle inconsistency | S | — |
| 29 | Low | API | Two admin endpoints validate with manual body casts, not zod | `admin.ts:464,1936` | Weaker input validation | S | — |
| 30 | Low | Docs | `README.md`/`knowledge.md` drift from implemented behaviour | `README.md` | Onboarding | S | — |

---

## SECTION 13 — PROPOSED WORK ORDER

1. **Fix the test gate** — make the `password.test.ts` tamper deterministic; run `pnpm test` in CI. (S; parallel)
2. **Fix broken routes** — add `<Outlet/>` to the five parent pages (or rename children to siblings). (S; parallel)
3. **Dependency upgrades** — drizzle-orm ≥0.45.2 and overrides for shell-quote/source-map-js/esbuild; re-run audit. (S; parallel)
4. **Security hardening** — least-privilege DB user + fail on `root` in prod; drop password from seed output; require `ADMIN_PASSWORD`/`DEMO_PASSWORD`; remove stale `SESSION_SECRET`. (S; parallel)
5. **Production payments** — real provider adapter behind the existing `payments/types.ts` interface, persistent intent store, then route RTO buy and rental cancellation/extension through `order-creation.ts` (removes defects #2/#3/#4). (L; depends on 4/5 architecture, not on UI)
6. **Rate limiting sweep** — add budgets for reviews/cart/addresses/rentals/wallet/seller-orders/seller-products/favorites/notifications via `guarded(...)`. (M; after 5 to avoid churn)
7. **CI/CD hardening** — add `typecheck → lint → test` to the workflow, an actual start/restart health-checked deploy step, migration step and rollback. (M; parallel with 5)
8. **Search feature** — one shared `SearchBox` (navbar/hero/overlay), `/api/search/suggest`, `search_history` writer, `/browse` param sync, IntersectionObserver collapse. (M; parallel)
9. **Tax engine** — replace `tax = 0` with a config-driven calculation and snapshot it on orders. (S; after 5)
10. **Taxonomy** — category depth/path, brands entity + `products.brand_id`, tags normalisation, `attribute_definitions`/`category_attributes`/`product_attribute_values`, collections; server-side validation and facet support. (L; depends on nothing, but touches catalogue broadly)
11. **Admin completion** — feature-flags/config API+UI, generic export jobs, announcement composer, admin session/device mgmt, maintenance mode, vendor verification/payout surfaces using `seller_verifications`/`commission_rules`. (L; after 10 for taxonomy-dependent admin)
12. **UI polish** — shared `SearchBox`, nav nowrap/drawer, hero chip clamping, reduced-motion coverage, route-level code splitting. (M; parallel)
13. **Test depth** — server integration/DB tests for money paths, migration tests, rental-overlap concurrency, E2E smoke. (L; after 5)
14. **Hygiene** — resolve README conflicts, de-duplicate env vars, remove root artifacts, docs refresh. (S; parallel)

---

## SECTION 14 — PROMPT-WRITING BRIEF

### 14.1 Exact file paths
- API client: `src/lib/api/client.ts`
- Query-key factory: `src/lib/query/keys.ts` (client `src/lib/query/client.ts`, providers `src/lib/query/providers.tsx`)
- TanStack DB: `src/lib/tanstack-db/{client,collections,schemas,sync,index}.ts`
- Auth middleware: `server/lib/auth.ts` (`attachUser`, `requireUser/Admin/Role`, `issueSession`, `rotateSession`, `requireStepUp`)
- Permission middleware: `server/lib/permissions.ts` (+ `server/lib/permission-catalogue.ts`); guards in `src/lib/auth/guards.ts`
- Validators: `server/lib/validation.ts`, `server/lib/product-validation.ts`, `server/schema-zod.ts`, per-route zod schemas
- Logger: `server/lib/logger.ts`
- Rate limiter: `server/lib/rate-limit.ts`
- Upload handler: `server/routes/storage.ts` + `server/lib/storage/{index,types,magic,dev,supabase}.ts`
- DataTable/admin shell: `src/features/admin/components/AdminLayout.tsx`, `AdminProductsTable.tsx`; generic table `src/components/ui/table.tsx`
- Button: `src/components/ui/button.tsx` (+ tokens in `src/styles.css`)
- SearchBox: **NOT FOUND** (nearest: `src/components/shared/product-filters/SearchBar.tsx`, `src/features/home/components/HeroSearch.tsx`)
- Theme tokens: `src/styles.css`; theme logic `src/lib/theme/*`
- Layout components: `src/components/layout/*`, `src/routes/__root.tsx`, `_auth.tsx`, `_authenticated.tsx`, `admin.tsx`
- Route files: `src/routes/**`; router generation `src/routeTree.gen.ts` (generated) via `tsr.config.json` / `pnpm generate:routes`
- Schema: `server/schema.ts` (single source), `server/schema-zod.ts`; enums `server/lib/enums.ts`
- Migrations: `drizzle/` + `drizzle/meta/`; `drizzle.config.ts`
- Seeds: `server/seed.ts`, `server/seed-products.ts`, `server/seed-history.ts`, `server/seed-admin.ts`; `server/lib/seed-truncate.ts`
- State machines: `server/lib/{rental-lifecycle,order-queries,order-creation,order-events}.ts`
- Audit wrapper: `server/lib/audit.ts` (`withAudit`)
- Frontend route guards: `src/lib/auth/guards.ts`, `src/lib/auth/auth-context.tsx`, `src/lib/auth/session-sync.ts`, `src/lib/auth/session-expiry.ts`

### 14.2 Conventions
- Files: `kebab-case` for components/utilities, `PascalCase` for React component files, `camelCase` for server modules, `route.tsx`/`index.tsx` for feature entry points.
- Hooks: `useXxxQuery`/`useXxxMutation`; query keys from `queryKeys.*`.
- Folder by feature (`src/features/<name>/` = `api.ts`, `query.ts`, `types.ts`, `components/`, `route.tsx`); shared only in `src/components/{ui,shared,layout}` or `src/lib/*`.
- Import alias `@/` → `src/`.
- Formatting: Prettier width 100, double quotes; ESLint `_varsIgnorePattern`.
- Response shape: `{ success: true, data }` / `{ success: false, error: { code, message } }` via `server/lib/api.ts` (`ok`/`fail`); errors thrown as `HttpError(status, code, message)`.
- Money in integer **paise**; ids `int` autoincrement; statuses plain strings from `server/lib/enums.ts`.

### 14.3 Reusable pieces that MUST be reused
- `Button` family (`src/components/ui/button.tsx`) — do not create new button styles.
- Elevation utilities `--elev-*` / `@utility elev-*` in `src/styles.css` — do not hand-write box-shadows.
- `queryKeys` factory, `src/lib/react`-free `api.ts` per feature, TanStack Query + TanStack DB sync in `src/lib/tanstack-db/sync.ts`.
- `SearchBar` debounce pattern, `product-card.tsx`, `empty-state.tsx`, `skeleton.tsx`, `pagination.tsx`, `tooltip.tsx`.
- Server: `requireUser/requireAdmin/requirePermission/requireStepUp`, `withAudit`, `rateLimit`/`guarded`, `HttpError`/`ok`/`fail`, `logger`.
- Zod schemas in `server/schema-zod.ts` / route files; `server/lib/validation.ts` URL/HTML sanitizers.

### 14.4 Must NOT be touched
- Generated `src/routeTree.gen.ts` (regenerate with `pnpm generate:routes`).
- Design identity: colour tokens, fonts (DM Sans / Nunito), radii in `src/styles.css`.
- `server/schema.ts` structure without schema-first generate→inspect→migrate.
- Stable surfaces per AGENTS.md: auth, profile, admin workspace, seller dashboard, product management, cart UI, wishlist, hero, logo system, TanStack DB architecture, MariaDB/Drizzle setup.
- No new packages; no provider-specific payment code outside the `server/lib/payments/types.ts` interface.

### 14.5 Commands + caveats
- `pnpm dev` (vite :5173 + API :3001; Vite proxies `/api`), `pnpm typecheck`, `pnpm lint`, `pnpm test` (jsdom, no DB/network), `pnpm build`.
- DB: `pnpm db:create` (first run only), `pnpm db:generate` → inspect → `pnpm db:migrate`, `pnpm db:seed` (4-stage, deterministic, refuses `NODE_ENV=production`), `pnpm db:seed:products|history|admin`, `pnpm db:sync:rbac`, `pnpm db:studio`.
- Caveats: never auto-reset DB; never drop data; the repo is not globally Prettier-clean (lint gate is ESLint); the test suite is currently flaky-red (#5); `.env` is required for API startup (JWT + MFA key).

### 14.6 Environment
- Windows 10/11, Node v24.16.0, pnpm 11.25.0, MariaDB local `reloop` on port **3307**, API port 3001, Vite 5173. Package manager pnpm with `pnpm-workspace.yaml`.

### 14.7 Open questions
1. Is a production payment provider chosen, and which `server/lib/payments/types.ts` implementation should be added first?
2. Is tax legally required per region, or is `tax = 0` intentional for launch?
3. Is 3-level category depth required immediately, and is `products.brand` free text to be migrated to a `brands` table without data loss?
4. Does the deployment target expect a process manager (systemd/PM2) / container, and how should migrations and rollback be orchestrated?
5. Should the CI workflow block on `typecheck`/`lint`/`test`, and is a test DB available in CI?
6. Should seeded dev credentials be removed entirely (env-required) or gated behind first-login rotation?
7. Which of the 16 admin modules are in scope for this engagement vs already accepted as partial?
