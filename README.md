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

```bash
pnpm install
```

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
