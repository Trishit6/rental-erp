# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Neighbors (renters/buyers)**: People in a local/community area who need items temporarily or want to buy pre-loved goods affordably
- **Sellers/listers**: People who have unused items and want to monetize them through rental or sale
- **Admins/moderators**: Staff who manage the marketplace, users, products, and resolve disputes

## Product Purpose

Revaro is a neighbour-to-neighbour marketplace that enables renting, buying, selling, and reusing pre-loved items. Its purpose is to extend a product's lifecycle - rather than purchasing new, people can rent temporarily, buy second-hand, or earn by sharing their items. Success means facilitating transactions that keep items in circulation longer while making them accessible and affordable.

## Positioning

Revaro combines rental commerce, traditional ecommerce, resale, and reuse in one platform. The key mechanism is that items can have multiple modes (sale, rent, both) with real rental terms (dates, deposits, rent-to-own), enabling "Discover → Rent → Use → Return or Own" as an alternative to just "Discover → Buy → Own".

## Operating Context

- **Local/community marketplace**: Connects neighbors for peer-to-peer transactions
- **Rental business logic**: Requires date selection, availability checking, deposits, and rental lifecycle management (confirmed → active → return_pending → returned)
- **Multi-sided**: Separate experiences for buyers/renters, sellers, and admins
- **Financial transactions**: Handles orders, payments, refunds, and rent-to-own credit calculations in INR (₹), stored as integer paise

## Capabilities and Constraints

**Core capabilities:**
- Buy, rent, or list items with flexible modes (SALE, RENT, BOTH)
- Real rental engine with per-day/week/month pricing, deposits, min/max rental days, and double-booking prevention
- Rent-to-own: buyers can purchase after renting with rent credit applied
- Cart & checkout with server-authoritative pricing
- Seller dashboard for managing listings, earnings, and orders
- Admin tools for moderation and marketplace management
- Messaging, notifications, favorites, reviews
- Search, filtering, and category browsing

**Constraints:**
- Currency: INR (₹), all amounts stored as integer paise
- Platform: web-only (Vite SPA + Hono API)
- Database: MariaDB (port 3307, DB name `reloop` - frozen identifier)
- Authentication: HTTP-only session cookies with bcrypt
- Payments use provider abstraction (mock in dev, real providers via interface)
- Feature isolation: no cross-feature imports; shared code in `src/components/shared/` or `src/lib/`
- Server-authoritative: never trust client prices, totals, IDs, or payment status

## Brand Commitments

- **Name**: Revaro (tagline "Rent. Buy. Sell. Reuse.")
- **Design**: Warm neumorphic design with beige palette, soft raised/inset surfaces, DM Sans + Nunito fonts
- **Philosophy**: Products should have more than one life
- **Trust & safety**: Transactions use server-side validation, idempotency, and proper authorization

## Evidence on Hand

- Full codebase with frontend (React 19 + Vite + TanStack) and backend (Hono + Drizzle + MariaDB)
- Comprehensive schema (22 tables) with migrations in `drizzle/`
- Extensive test suite (1215 tests)
- Seed data with demo users and products
- Documentation in README.md and knowledge.md

## Product Principles

1. **Extensibility over duplication** - Extend existing features/routes rather than rebuild; reuse shared components and query layers
2. **Server authority** - All business logic, pricing, and authorization lives server-side; client is presentation
3. **Deterministic & safe** - Use transactions for multi-step operations, idempotency for payments, proper validation
4. **Community-first reuse** - Design around keeping items circulating, not just consumption
5. **Trust through transparency** - Clear pricing (separate deposits from fees), order history with snapshots, rental timelines

## Accessibility & Inclusion

No explicit product-specific accessibility requirements were established in the codebase. However, the UI uses semantic components and follows general web accessibility practices.
