<<<<<<< HEAD
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
=======
# Revaro ♻️

> **Rent. Buy. Sell. Reuse.**

Revaro is a modern full-stack marketplace designed to make renting, buying, selling, and discovering pre-loved products simple and seamless.

Whether you need something temporarily, want to purchase it, or have something valuable sitting unused, Revaro connects people through a flexible **rent • buy • sell • reuse** ecosystem.

---

## ✨ What is Revaro?

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

Revaro is built around a simple idea:

> **Products should have more than one life.**

---

## 🎯 The Revaro Concept

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

This creates a marketplace where products can move between people instead of being limited to a single ownership journey.

---

## 🚀 Core Features

### 🏠 Modern Marketplace

Revaro provides a polished marketplace experience with:

* Product discovery
* Featured products
* Rental products
* Pre-loved products
* Categories
* Search
* Filtering
* Sorting
* Responsive product grids

---

### 🔄 Flexible Product Modes

Products can support three primary modes:

| Mode           | Description                                         |
| -------------- | --------------------------------------------------- |
| `BUY`          | Purchase the product directly                       |
| `RENT`         | Rent the product for a selected duration            |
| `RENT_AND_BUY` | Rent first with the possibility of purchasing later |

This allows sellers to offer products in different ways while giving users more flexibility.

---

### 🔎 Product Discovery

Users can discover products through:

* Search
* Categories
* Price filters
* Condition filters
* Availability filters
* Listing type
* Sorting
* Pagination

Product discovery is designed to remain fast and cache-aware while maintaining URL-based filter state.

---

### ❤️ Favorites

Users can save products for later.

Features include:

* Add to favorites
* Remove from favorites
* Favorites page
* Optimistic UI
* Undo actions
* Cross-feature synchronization
* Authentication-aware favorites

---

### 🛒 Smart Cart

The Revaro cart supports both purchases and rentals.

Cart functionality includes:

* Add products
* Remove products
* Update quantities
* Rental duration
* Rental mode
* Security deposit
* Availability validation
* Price validation
* Cart drawer
* Full cart page
* Responsive mobile summary

The server remains the authoritative source for pricing and availability.

---

### 🧾 Checkout

Revaro includes a dedicated checkout architecture supporting:

* Saved addresses
* New address creation
* Delivery options
* Pickup options
* Rental details
* Rental duration
* Rental dates
* Security deposits
* Coupon architecture
* Server-side cart validation
* Server-authoritative pricing
* Checkout summary

Payment processing and final order creation are designed as separate modules.

---

### 🔐 Authentication

Authentication is built around secure server-side sessions.

The architecture supports:

* Registration
* Login
* Logout
* Current user
* Protected routes
* Role-based access
* Session management

Supported roles:

```text
USER
SELLER
ADMIN
```

Authentication sessions use secure HTTP-only cookies rather than storing authentication tokens in localStorage.

---

## 🌓 Professional Theme System

Revaro supports:

* ☀️ Light mode
* 🌙 Dark mode
* 🖥️ System mode

The visual system maintains the Revaro identity across both themes.

### Light Mode

Uses:

* Warm ivory
* Beige
* Greige
* Burnt orange
* Olive
* Dark brown typography

### Dark Mode

Uses:

* Warm near-black surfaces
* Dark brown-gray
* Cream typography
* Muted burnt orange
* Muted olive accents

---

## 🎨 Revaro Design Language

Revaro uses a distinctive visual system rather than a generic ecommerce template.

Design characteristics include:

* Soft neumorphic surfaces
* Rounded cards
* Floating controls
* Subtle depth
* Warm neutral palette
* Burnt-orange primary actions
* Olive accents
* Smooth transitions
* Responsive layouts
* Minimal visual clutter

The objective is to create a marketplace that feels:

**Modern · Warm · Premium · Simple · Approachable**

---

## 🧑‍💻 Technology Stack

### Frontend

* **React**
* **TypeScript**
* **Vite**
* **TanStack Router**
* **TanStack Query**
* **TanStack Form**
* **TanStack Table**
* **Tailwind CSS v4**
* **shadcn/ui**
* **Framer Motion**
* **Lucide React**
* **Zod**

### Backend

* **Node.js**
* **TypeScript**
* **Hono**

### Database

* **MariaDB**
* **Drizzle ORM**
* **mysql2**

### Package Manager

* **pnpm**

---

## 🏗️ Architecture

Revaro follows a feature-first architecture designed for scalability and maintainability.

```text
src/
├── components/
│   ├── ui/
│   ├── layout/
│   ├── navbar/
│   ├── footer/
│   └── shared/
│
├── features/
│   ├── home/
│   ├── login/
│   ├── register/
│   ├── forgot-password/
│   ├── browse/
│   ├── product-details/
│   ├── categories/
│   ├── favorites/
│   ├── cart/
│   ├── checkout/
│   ├── orders/
│   ├── rentals/
│   ├── rent-to-own/
│   ├── sell/
│   ├── seller-dashboard/
│   ├── seller-listings/
│   ├── seller-orders/
│   ├── seller-rentals/
│   ├── messages/
│   ├── notifications/
│   ├── reviews/
│   ├── profile/
│   ├── addresses/
│   ├── settings/
│   └── admin/
│
├── lib/
│   ├── api/
│   ├── auth/
│   ├── db/
│   ├── query/
│   └── storage/
│
├── routes/
└── main.tsx
```

Each feature follows a consistent structure:

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

This separation keeps UI, API, validation, state, and routing concerns organized.

---

## ⚡ Data Fetching & Caching

Revaro uses **TanStack Query** for server state.

The caching strategy is designed to prevent unnecessary requests while maintaining correct server state.

The application uses:

* Query key factories
* Appropriate `staleTime`
* Appropriate `gcTime`
* Query invalidation
* Optimistic updates where appropriate
* Prefetching where useful
* Mutation synchronization
* Cache-aware navigation

Previously loaded information should not unnecessarily reload when navigating through the application.

Checkout-critical information is always revalidated against the server.

---

## 🗄️ Database Architecture

The planned database architecture includes:

```text
users
sessions
addresses
categories
products
product_images
favorites
carts
cart_items
orders
order_items
rentals
reviews
seller_profiles
transactions
conversations
conversation_participants
messages
notifications
reports
```

Database architecture:

```text
MariaDB
   ↓
mysql2
   ↓
Drizzle ORM
```

---

## 🔐 Security Principles

Revaro follows security-first principles.

### Authentication

* Server-side sessions
* HTTP-only cookies
* Protected routes
* Role-based authorization
* Session expiration

### Validation

Frontend:

```text
TanStack Form + Zod
```

Backend:

```text
Zod + server-side validation
```

Client-submitted values are never treated as authoritative for sensitive operations.

### Pricing

The backend remains authoritative for:

* Product price
* Rental price
* Security deposit
* Delivery charges
* Discounts
* Final totals
* Availability

### Authorization

Users can only access resources belonging to their authenticated account.

---

## 📱 Responsive Design

Revaro is designed for:

* Desktop
* Laptop
* Tablet
* Mobile

Mobile UX includes:

* Floating controls
* Compact summaries
* Mobile filter sheets
* Touch-friendly controls
* Responsive product grids
* Sticky actions where appropriate

---

## ♿ Accessibility

Revaro aims to provide:

* Semantic HTML
* Keyboard navigation
* Visible focus states
* Accessible forms
* Screen-reader-friendly errors
* Proper labels
* ARIA attributes where necessary
* Sufficient contrast
* Reduced-motion support

---

## 📈 Development Roadmap

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

---

## 🛠️ Local Development

### 1. Clone the repository

```bash
git clone <your-repository-url>
cd revaro
```

### 2. Install dependencies
>>>>>>> a4c5636eb042adc0dbf0fd94b80e606076ae365e

```bash
pnpm install
```

<<<<<<< HEAD
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
=======
### 3. Configure environment variables

Create:

```text
.env
```

Example:

```env
DB_HOST=localhost
DB_PORT=3307
DB_USER=root
DB_PASSWORD=your_database_password
DB_NAME=revaro
```

Never commit `.env` to Git.

### 4. Start MariaDB

Make sure MariaDB is running on:

```text
localhost:3307
```

and the database exists:

```text
revaro
```

### 5. Run migrations

Use the project's configured Drizzle commands:

```bash
pnpm db:generate
pnpm db:migrate
```

If the repository uses different script names, use the commands defined in `package.json`.

### 6. Start development server

```bash
pnpm dev
```

---

## 🧪 Quality Checks

Before submitting changes:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

The project should have:

* No TypeScript errors
* No lint errors
* Successful production build
* Valid routes
* Valid database schema

---

## 🌳 Development Principles

### Feature-first development

Each major business capability is isolated into its own feature module.

### Strong typing

TypeScript is used throughout the application.

Avoid unnecessary:

```ts
any
```

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

---

## 🎨 Design Philosophy

Revaro is intentionally different from conventional ecommerce interfaces.

Instead of relying on:

* Excessive gradients
* Generic SaaS dashboards
* Overly bright colors
* Dense product grids
* Unnecessary animations

Revaro focuses on:

> **Warmth + Depth + Simplicity + Motion**

The interface combines marketplace functionality with a soft neumorphic visual language and carefully controlled floating interactions.

---

## 🔮 Future Vision

Revaro is designed to become more than a traditional ecommerce platform.

The core product lifecycle can evolve around:

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

The goal is to create a marketplace where products can continue providing value across multiple users and multiple stages of their lifecycle.

---

## 📌 Project Status

> 🚧 **Revaro is currently under active development.**

The platform is being developed incrementally, with each major capability implemented as an independent feature while maintaining the overall architecture and design system.

---

## 🤝 Contributing

Contributions, suggestions, and improvements are welcome.

Before submitting a pull request:

1. Create a feature branch.
2. Follow the existing feature architecture.
3. Maintain TypeScript strictness.
4. Add appropriate validation.
5. Keep API logic separated from UI.
6. Test your changes.
7. Run typecheck, lint, and build.
8. Maintain the Revaro design language.

---

## 📄 License

License information will be added as the project approaches its public release.

---

## 👨‍💻 Built With

**Revaro** is built with modern open-source technologies:

**React · TypeScript · Vite · TanStack · Tailwind CSS · shadcn/ui · Framer Motion · Hono · Drizzle ORM · MariaDB**

---

# Revaro ♻️

### Rent. Buy. Sell. Reuse.
>>>>>>> a4c5636eb042adc0dbf0fd94b80e606076ae365e
