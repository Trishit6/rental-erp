/**
 * Revaro DB — the client-side reactive store.
 *
 * TanStack DB sits between TanStack Query and the reactive UI:
 *
 *   MariaDB → Hono API → TanStack Query → TanStack DB → UI
 *
 * Query owns fetching, caching and invalidation. The DB collections hold the
 * mirrored rows so components can read across entities (an order against its
 * items and rentals) without a second request. See `collections.ts` for the
 * entity choices and `sync.ts` for the one-way sync contract.
 */
export * from "./index";
