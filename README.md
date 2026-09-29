# Revaro — Rent. Buy. Sell. Reuse.

A neighbour-to-neighbour marketplace to rent, buy and sell pre-loved things — sofas, cameras,
dresses, drills — with real rentals, deposits, rent-to-own, seller dashboards and more.

Same warm neumorphic design as the original Revaro, now a **real full-stack application**:
React 19 + Vite + TanStack (Router/Query/Form/Table) frontend, Hono + Drizzle + MariaDB backend,
with sessions, transactions and a rental availability engine.

## Features

- **Auth** — register / login / logout with HTTP-only session cookies (bcrypt password hashing).
- **Products** — 12 categories, multi-image, tags, conditions, listing types (SALE / RENT / BOTH).
- **Search & browse** — URL-shareable filters (query, category, type, price, sort), server-side
  search across title/description/brand/location/tags, pagination.
- **Rent engine** — per-day/week/month pricing tiers, security deposits, min/max rental days,
  server-side availability with double-booking prevention (transactional conflict checks).
- **Rent-to-own** — sellers configure credit % and cap; renters can buy after renting with rent
  credit applied.
- **Cart & checkout** — quantity, save-for-later, delivery/pickup, server-computed totals (never
  trusted from the client).
- **Payment & orders** — server-authoritative amounts, a provider abstraction (development mock
  today, a real gateway later), payment intents, signature-verified webhooks, idempotent order
  creation, and public `RV-2026-XXXXXX` order numbers. Orders are created only after the payment is
  verified on the server.
- **Orders & rentals** — a full customer order centre at `/orders`: server-side search, status/type/
  date filters, sorting and pagination, plus an order detail page showing item snapshots, payment
  metadata, delivery address (from the purchase-time snapshot), rental terms and a verified timeline.
- **Rental management** — `/rentals` is "My Rentals": upcoming / active / completed tabs, search,
  filters, sorting and a detail page with the rental timeline, pricing, deposit status, delivery and
  a server-authoritative extension quote and return request. The backend owns the lifecycle
  (`CONFIRMED → ACTIVE → RETURN_PENDING → RETURNED`) and reconciles it from the dates.
- **Favorites** — DB-backed with unique constraints and favorite-count maintenance.
- **Messages** — product-linked conversations with unread counts and read state.
- **Notifications** — order/rental/message/review events with unread badge and mark-all-read.
- **Seller dashboard** — earnings breakdown, product management table (pause/activate/archive/delete),
  transactions.
- **Admin** — marketplace stats, user suspension, product status, report resolution.
- **Assistant** — **Loop**, a floating in-app chatbot. Answers questions about renting, deposits,
  delivery, returns and selling, and surfaces real listings inline (respecting "rent" vs "buy").
  Powered by any OpenAI-compatible LLM when `CHATBOT_API_KEY` is set (Groq by default) and falls
  back to a built-in knowledge base with no key — so it always answers.
- **Design** — original Revaro neumorphic design preserved: warm beige palette, soft raised/inset
  surfaces, DM Sans + Nunito, INR pricing, Framer Motion micro-interactions, skeletons, empty states.

## Architecture

```
├── server/            Hono API (tsx, no build step)
│   ├── index.ts       entry: logger, onError, session attach, route mounting, /api/health, /api/stats
│   ├── schema.ts      full relational schema (20 tables, FKs, indexes, unique constraints)
│   ├── db.ts          mysql2 pool + Drizzle
│   ├── seed.ts        realistic demo data (users, categories, 22 products, orders, rentals, reviews…)
│   ├── lib/           api envelope + errors + rate limiting, auth (sessions), config (fees),
│   │                  cart pricing engine, checkout quote, payment provider abstraction
│   └── routes/        auth, products+search, market (favorites/cart/addresses),
│                      orders+rentals engine, payments (intent/verify/webhook), social
│                      (reviews/messages/notifications/users), seller, admin
├── src/               React SPA
│   ├── routes/        one page per route (TanStack Router, context-based auth guards)
│   ├── components/    Revaro design system (cards, header, grids, skeletons, empty states, ui/)
│   └── lib/           api-client, auth-context, query-keys, pricing (shared with server), types
├── drizzle/           generated migrations
└── tests/             vitest unit tests (pricing engine)
```

**Money** is stored and computed in integer paise (`src/lib/pricing.ts`, shared by server and
frontend). Deposits are tracked separately from rental fees and never counted as seller revenue.

## Requirements

- Node.js 20+
- pnpm 9+
- MariaDB 10.6+ (or MySQL 8+)

## Installation

```bash
pnpm install
```

### MariaDB setup

```sql
CREATE DATABASE reloop CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- The database name is a frozen internal identifier; only the product branding changed.
```

(Or run `pnpm db:create`, which creates it for you.)

### Environment variables

Copy `.env.example` → `.env` and adjust:

```
DATABASE_URL=mysql://root:password@localhost:3307/reloop
NODE_ENV=development
API_PORT=3001
SESSION_SECRET=change_me
APP_URL=http://localhost:5173
API_URL=http://localhost:3001
PAYMENT_PROVIDER=mock
PLATFORM_SALE_FEE_PERCENT=5
PLATFORM_RENTAL_FEE_PERCENT=10
```

`PAYMENT_PROVIDER=mock` (or leaving it empty) selects the **development-only** payment provider. It
simulates payments, moves no money, and is refused when `NODE_ENV=production`. Set a real provider
name plus `PAYMENT_KEY_ID` / `PAYMENT_KEY_SECRET` / `PAYMENT_WEBHOOK_SECRET` once its adapter is
implemented — no application code needs to change.

Never expose server secrets with a `VITE_` prefix — everything `VITE_`-prefixed is public.

## Database migration & seed

```bash
pnpm db:create     # create the database if missing
pnpm db:migrate    # apply Drizzle migrations
pnpm db:seed       # load demo users, categories, products, orders, rentals, reviews
```

## Development

```bash
pnpm dev           # Vite (:5173) + API (:3001) with watch mode
```

The Vite dev server proxies `/api/*` to `http://localhost:3001`.

## Useful commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Frontend + API in watch mode |
| `pnpm build` | Type-check both tsconfigs + production frontend build |
| `pnpm typecheck` | TypeScript check only |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier write |
| `pnpm test` | Vitest unit tests |
| `pnpm db:generate` | Generate a migration from schema changes |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:seed` | Seed demo data |
| `pnpm db:studio` | Browse the DB in Drizzle Studio |
| `pnpm start:api` | Run the API without Vite |

## Demo accounts (development seed)

Password for all: `revaro-dev-2026`

| Role | Email |
| --- | --- |
| Admin | admin@revaro.local |
| Seller | seller@revaro.local |
| Buyer | buyer@revaro.local |
| Seller 2 | daniel@revaro.local |
| Seller 3 | priya@revaro.local |
| Buyer 2 | sara@revaro.local |

## Testing

```bash
pnpm test
```

Unit tests cover the money/rental engine: paise conversion, rental day counting, weekly/monthly
rate tiers, quote totals with deposits and delivery, platform fees, overlap detection and slugs.

The critical concurrency case (two users renting the same unit for overlapping dates) is enforced
by server-side availability checks inside the order transaction — see
`server/routes/orders.ts` (`overlappingRentalCount` + transactional order creation).

## Deployment notes

- Build the frontend with `pnpm build` (outputs to `dist/`), serve it behind any static host or CDN.
- Run the API with `pnpm start:api` behind a process manager (pm2/systemd) — it serves `/api/*`
  on `API_PORT`.
- Set strong `SESSION_SECRET`, `NODE_ENV=production` (enables `Secure` session cookies), real
  MariaDB credentials via `DATABASE_URL`, and a real `PAYMENT_PROVIDER` with its keys. The
  development payment mock is refused under `NODE_ENV=production` on purpose.
- The payment provider is an interface (`server/lib/payments/`); wire your gateway in as a new
  adapter behind the same order-creation transaction before taking real payments. The webhook
  endpoint is `POST /api/payments/webhook` and is signature-authenticated, not session-authenticated.
- Platform fees are configurable via `PLATFORM_SALE_FEE_PERCENT` / `PLATFORM_RENTAL_FEE_PERCENT`.
