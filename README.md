# Revaro — Rent. Buy. Sell. Reuse.

A neighbour-to-neighbour marketplace to rent, buy and sell pre-loved things — sofas, cameras,
dresses, drills — with real rentals, deposits, rent-to-own, seller dashboards and more.

Same warm neumorphic design as the original Revaro, now a **real full-stack application**:
React 19 + Vite + TanStack (Router/Query/Form/Table) frontend, Express 5 + Drizzle + MariaDB backend,
with sessions, transactions and a rental availability engine.

> **Products should have more than one life.**

## What is Revaro?

Revaro combines **rental commerce, traditional ecommerce, resale, and product reuse** into one platform.

Users can:

* 🛍️ Buy products
* 🔄 Rent products
* ♻️ Discover pre-loved products
* 💰 Sell their own products
* 🔁 Rent products with the possibility of purchasing later
* ❤️ Save products to favorites
* 🛒 Manage a persistent cart
* 📦 Prepare purchases and rentals through checkout
* 🔎 Search and filter products
* 🏷️ Browse products by category

## The Revaro Concept

Traditional ecommerce primarily focuses on:

```text
Discover → Buy → Own
```

Revaro expands that model:

```text
Discover → Rent → Use → Return or Own
```

and:

```text
Sell → Reuse → Rent → Buy
```

This creates a marketplace where products can move between people instead of being limited to a single
ownership journey.

## Features

- **Auth** — register / login / logout with HTTP-only session cookies (scrypt password hashing, with a
  one-time bcrypt upgrade path for legacy hashes). Optional TOTP MFA for staff accounts.
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
- **Design** — original Revaro neumorphic design preserved: warm beige palette, soft raised/inset
  surfaces, DM Sans + Nunito, INR pricing, Framer Motion micro-interactions, skeletons, empty states.

## Feature Detail

### Modern Marketplace

Revaro provides a polished marketplace experience with product discovery, featured products, rental
products, pre-loved products, categories, search, filtering, sorting and responsive product grids.

### Flexible Product Modes

Products can support three primary modes, surfaced by the API as `BUY` / `RENT` / `RENT_AND_BUY` and
stored as the `listing_type` column values `SALE` / `RENT` / `BOTH`:

| Mode           | Stored as | Description                                         |
| -------------- | --------- | --------------------------------------------------- |
| `BUY`          | `SALE`    | Purchase the product directly                       |
| `RENT`         | `RENT`    | Rent the product for a selected duration            |
| `RENT_AND_BUY` | `BOTH`    | Rent first with the possibility of purchasing later |

This allows sellers to offer products in different ways while giving users more flexibility.

### Product Discovery

Users can discover products through search, categories, price filters, condition filters, availability
filters, listing type, sorting and pagination. Product discovery is designed to remain fast and
cache-aware while maintaining URL-based filter state.

### Favorites

Users can save products for later: add to favorites, remove from favorites, a favorites page,
optimistic UI, undo actions, cross-feature synchronization and authentication-aware favorites.

### Smart Cart

The Revaro cart supports both purchases and rentals: add products, remove products, update
quantities, rental duration, rental mode, security deposit, availability validation, price
validation, a cart drawer, a full cart page and a responsive mobile summary. The server remains the
authoritative source for pricing and availability.

### Checkout

Revaro includes a dedicated checkout architecture supporting saved addresses, new address creation,
delivery options, pickup options, rental details, rental duration, rental dates, security deposits,
coupon architecture, server-side cart validation, server-authoritative pricing and a checkout
summary. Payment processing and final order creation are designed as separate modules.

### Authentication

Authentication is built around secure server-side sessions: registration, login, logout, current
user, protected routes, role-based access and session management. Supported roles are `USER`,
`SELLER` and `ADMIN`. Authentication sessions use secure HTTP-only cookies rather than storing
authentication tokens in localStorage.

## Theme System

Revaro supports ☀️ light mode, 🌙 dark mode and 🖥️ system mode, maintaining the Revaro identity across
both themes.

### Light Mode

Uses warm ivory, beige, greige, burnt orange, olive and dark brown typography.

### Dark Mode

Uses warm near-black surfaces, dark brown-gray, cream typography, muted burnt orange and muted olive
accents.

## Design Language

Revaro uses a distinctive visual system rather than a generic ecommerce template: soft neumorphic
surfaces, rounded cards, floating controls, subtle depth, a warm neutral palette, burnt-orange
primary actions, olive accents, smooth transitions, responsive layouts and minimal visual clutter.

The objective is to create a marketplace that feels **Modern · Warm · Premium · Simple · Approachable**.

## Technology Stack

### Frontend

* **React 19**
* **TypeScript**
* **Vite**
* **TanStack Router**
* **TanStack Query**
* **TanStack Form**
* **TanStack Table**
* **Tailwind CSS v4**
* **Radix UI primitives**
* **Framer Motion**
* **Lucide React**
* **Zod**

### Backend

* **Node.js**
* **TypeScript**
* **Express 5** (behind a small Hono-style router shim, `server/lib/http.ts`)

### Database

* **MariaDB**
* **Drizzle ORM**
* **mysql2**

### Package Manager

* **pnpm**

## Architecture

```
├── server/            Express 5 API (tsx, no build step)
│   ├── index.ts       entry: logger, onError, session attach, route mounting, /api/health, /api/stats
│   ├── schema.ts      full relational schema (FKs, indexes, unique constraints)
│   ├── db.ts          mysql2 pool + Drizzle
│   ├── seed.ts        realistic demo data (users, categories, products, orders, rentals, reviews…)
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
└── tests/             vitest unit tests
```

Each feature is isolated under `src/features/<name>/` and follows one shape:

```text
feature/
├── components/
│   ├── Component.tsx
│   └── schema.ts
├── api.ts
├── query.ts
├── types.ts
├── index.tsx
└── route.tsx
```

### Architecture Responsibilities

| File          | Responsibility           |
| ------------- | ------------------------ |
| `index.tsx`   | Feature/page composition |
| `components/` | Feature-specific UI      |
| `schema.ts`   | Zod validation           |
| `api.ts`      | API communication        |
| `query.ts`    | TanStack Query           |
| `types.ts`    | TypeScript types         |
| `route.tsx`   | TanStack Router route    |

This separation keeps UI, API, validation, state and routing concerns organized. Cross-feature
imports are avoided; shared code lives in `src/components/shared/` or `src/lib/`.

## Data Fetching & Caching

Revaro uses **TanStack Query** for server state, with query key factories (from
`src/lib/query/keys.ts`), appropriate `staleTime` / `gcTime`, query invalidation, optimistic updates
where appropriate, prefetching where useful, mutation synchronization and cache-aware navigation.
Previously loaded information should not unnecessarily reload when navigating through the
application. Checkout-critical information is always revalidated against the server.

## Database Architecture

The schema is a single source of truth in `server/schema.ts`, covering `users`, `sessions`,
`addresses`, `categories`, `products`, `product_images`, `favorites`, `carts`, `cart_items`, `orders`,
`order_items`, `rentals`, `reviews`, `seller_profiles`, `transactions`, `conversations`,
`conversation_participants`, `messages`, `notifications`, `reports` and the admin/ops tables.

```text
MariaDB
   ↓
mysql2
   ↓
Drizzle ORM
```

**Money** is stored and computed in integer paise (`src/lib/pricing.ts`, shared by server and
frontend). Deposits are tracked separately from rental fees and never counted as seller revenue.

## Security

Revaro follows security-first principles.

### Authentication

* Server-side sessions
* HTTP-only cookies
* Protected routes
* Role-based authorization
* Session expiration

### Validation

Frontend uses TanStack Form + Zod; the backend validates with Zod + server-side checks.
Client-submitted values are never treated as authoritative for sensitive operations.

### Pricing

The backend remains authoritative for product price, rental price, security deposit, delivery
charges, discounts, final totals and availability.

### Authorization

Users can only access resources belonging to their authenticated account, and staff permissions are
enforced by the server (`server/lib/permissions.ts`), not by hiding UI.

## Responsive Design

Revaro is designed for desktop, laptop, tablet and mobile. Mobile UX includes floating controls,
compact summaries, mobile filter sheets, touch-friendly controls, responsive product grids and sticky
actions where appropriate.

## Accessibility

Revaro aims to provide semantic HTML, keyboard navigation, visible focus states, accessible forms,
screen-reader-friendly errors, proper labels, ARIA attributes where necessary, sufficient contrast and
reduced-motion support.

## Development Roadmap

### Foundation

* [x] Project foundation
* [x] Application architecture
* [x] Theme system
* [x] Authentication foundation

### Marketplace

* [x] Home page
* [x] Browse
* [x] Search
* [x] Filters
* [x] Product details
* [x] Categories
* [x] Favorites
* [x] Cart
* [x] Checkout foundation

### Commerce

* [ ] Payment
* [ ] Order creation
* [ ] Order management
* [ ] Rental management
* [ ] Rent-to-own flow

### Seller

* [ ] Sell flow
* [ ] Seller dashboard
* [ ] Seller listings
* [ ] Seller orders
* [ ] Seller rentals

### Community

* [ ] Reviews
* [ ] Messaging
* [ ] Notifications

### Administration

* [ ] Admin dashboard
* [ ] User management
* [ ] Product moderation
* [ ] Reports
* [ ] Platform management

## Requirements

- Node.js 20+
- pnpm 9+
- MariaDB 10.6+ (or MySQL 8+)

## Installation

### 1. Clone the repository

```bash
git clone <your-repository-url>
cd revaro
```

### 2. Install dependencies

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

Copy `.env.example` → `.env` and adjust. See `.env.example` for the complete annotated list. The API
refuses to start without `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` and `MFA_ENCRYPTION_KEY`; the
database connection accepts either split `DB_*` variables or a single `DATABASE_URL` (which takes
precedence).

`PAYMENT_PROVIDER=mock` (or leaving it empty) selects the **development-only** payment provider. It
simulates payments, moves no money, and is refused when `NODE_ENV=production`. Set a real provider
name plus `PAYMENT_KEY_ID` / `PAYMENT_KEY_SECRET` / `PAYMENT_WEBHOOK_SECRET` once its adapter is
implemented — no application code needs to change.

Never expose server secrets with a `VITE_` prefix — everything `VITE_`-prefixed is public.

## Database migration & seed

```bash
pnpm db:create     # create the database if missing
pnpm db:migrate    # apply Drizzle migrations
pnpm db:seed       # full deterministic seed: demo data, 20k products, order/rental history, admin/ops
```

`pnpm db:seed` truncates then runs four stages in order — `seed.ts` (demo users, categories,
products, orders, rentals, reviews) → `seed-products.ts` (20k bulk products) → `seed-history.ts`
(volume orders, rentals, reviews, carts, messages, notifications) → `seed-admin.ts` (staff, MFA,
support tickets, refunds, disputes, coupons, CMS, payouts, audit logs, feature flags). Each stage is
reproducible (seeded PRNG, no faker) and refuses to run when `NODE_ENV=production`. To re-run a
single stage, use `pnpm db:seed:products`, `pnpm db:seed:history`, or `pnpm db:seed:admin`.

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
| `pnpm db:seed` | Full deterministic seed (demo → products → history → admin) |
| `pnpm db:seed:products` | Stage 2 only — append bulk products |
| `pnpm db:seed:history` | Stage 3 only — volume order/rental history |
| `pnpm db:seed:admin` | Stage 4 only — staff, support, growth, security, ops |
| `pnpm db:studio` | Browse the DB in Drizzle Studio |
| `pnpm start:api` | Run the API without Vite |

## Demo accounts (development seed)

The seed resolves its passwords from `ADMIN_PASSWORD` and `DEMO_PASSWORD`. When neither is set it
generates a random password **once** and writes it to `.seed-credentials.local` (gitignored), so the
value never lives in the repository. Never prefix these with `VITE_`, and never commit the generated
file.

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
- Set `NODE_ENV=production` (enables `Secure` session cookies), strong `JWT_ACCESS_SECRET` /
  `JWT_REFRESH_SECRET` / `MFA_ENCRYPTION_KEY`, real MariaDB credentials via `DATABASE_URL`, and a real
  `PAYMENT_PROVIDER` with its keys. The development payment mock is refused under
  `NODE_ENV=production` on purpose.
- The payment provider is an interface (`server/lib/payments/`); wire your gateway in as a new
  adapter behind the same order-creation transaction before taking real payments. The webhook
  endpoint is `POST /api/payments/webhook` and is signature-authenticated, not session-authenticated.
- Platform fees are configurable via `PLATFORM_SALE_FEE_PERCENT` / `PLATFORM_RENTAL_FEE_PERCENT`.

## Quality Checks

Before submitting changes:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

The project should have no TypeScript errors, no lint errors, a passing test suite and a successful
production build.

## Development Principles

### Feature-first development

Each major business capability is isolated into its own feature module.

### Strong typing

TypeScript is used throughout the application. Avoid unnecessary `any`.

### Server-authoritative business logic

Sensitive business rules belong on the backend.

### Reusable UI

Global components should be shared instead of duplicated.

### Smooth UX

Navigation should not require unnecessary page reloads.

### Performance-aware caching

Already-loaded data should be reused whenever appropriate.

### Progressive architecture

New features should be added without unnecessarily restructuring existing modules.

## Design Philosophy

Revaro is intentionally different from conventional ecommerce interfaces. Instead of relying on
excessive gradients, generic SaaS dashboards, overly bright colors, dense product grids or
unnecessary animations, Revaro focuses on **Warmth + Depth + Simplicity + Motion**. The interface
combines marketplace functionality with a soft neumorphic visual language and carefully controlled
floating interactions.

## Future Vision

Revaro is designed to become more than a traditional ecommerce platform. The core product lifecycle
can evolve around:

```text
             DISCOVER
                │
        ┌───────┴───────┐
        ↓               ↓
      RENT             BUY
        │               │
        ↓               ↓
       USE             OWN
        │
        ↓
   RETURN / BUY
```

For sellers:

```text
LIST
 ↓
RENT
 ↓
EARN
 ↓
SELL
 ↓
REUSE
```

The goal is to create a marketplace where products can continue providing value across multiple users
and multiple stages of their lifecycle.

## Project Status

> 🚧 **Revaro is currently under active development.**

The platform is being developed incrementally, with each major capability implemented as an
independent feature while maintaining the overall architecture and design system.

## Contributing

Contributions, suggestions and improvements are welcome. Before submitting a pull request:

1. Create a feature branch.
2. Follow the existing feature architecture.
3. Maintain TypeScript strictness.
4. Add appropriate validation.
5. Keep API logic separated from UI.
6. Test your changes.
7. Run typecheck, lint, test and build.
8. Maintain the Revaro design language.

## License

License information will be added as the project approaches its public release.

## Built With

**React · TypeScript · Vite · TanStack · Tailwind CSS · Radix UI · Framer Motion · Express · Drizzle ORM · MariaDB**
