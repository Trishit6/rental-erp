# Invalidation map

Which mutation invalidates which query keys, and why. The rule behind every line:
**optimistic writes are for data the client can compute (a favourite flag, a
cart line removal); everything else is invalidated so the server's answer wins.**

Source of truth for key shapes is [`src/lib/query/keys.ts`](../src/lib/query/keys.ts);
source of truth for the calls themselves is the `query.ts` next to each feature.
This document exists so that a new mutation has an obvious place to look before
it picks a key, and so a reviewer can see the blast radius of one write.

## The three operations

| Operation | Used for | Notes |
| --- | --- | --- |
| `setQueryData` / `setQueriesData` | optimistic edits and single-key patches | must snapshot the previous value and restore it in `onError` |
| `invalidateQueries` | "the server knows better than I do" | refetch is precise to the prefix |
| `removeQueries` | logout / session loss, and rollback when there was no previous value | never used to "refresh" |

TanStack matches keys by **prefix**. A literal `"*"` segment is *not* a wildcard
(it only matches keys that literally contain `"*"`); that is why roots such as
`orderAll`, `conversationAll` and `walletAll` exist as named prefixes.

## Public catalogue

| Mutation | Invalidates | Leaves alone |
| --- | --- | --- |
| Seller creates / edits / archives a listing (`seller-listings`) | `sellerProducts`, `sellerSummary`, `sellerMe`, `productAll`, `products()` | other sellers' rows |
| Admin edits catalogue / images / status (`admin`) | `adminProducts`, `productAll`, `["products"]`, `categories` (images also `adminProductImages`) | the writer's own admin lists, which it refetches separately |
| Review write (`reviews`) | `reviews(productId)`, `reviewsEligibility(productId)`, `productAll`, `["browse","products"]`, `myReviewsRoot`, `reviewsSingleRoot`, `sellerReviewsRoot`, `reviewsModerationRoot` | other products' review lists |

Catalogues are long-lived (`staleTime` measured in minutes), so writes that
change them are explicit invalidations rather than background refetches.

## Favourites (optimistic)

Implemented in [`src/lib/query/favorites.ts`](../src/lib/query/favorites.ts).

| Mutation | Optimistic write | Invalidates on success |
| --- | --- | --- |
| add favourite | `favoriteIds` gains the id; product detail counter patched | `["favorites","list"]` |
| remove favourite | `favoriteIds` loses the id; the visible wishlist page is patched | `["favorites","list"]` |
| clear favourites | `favoriteIds = []` | `["favorites","list"]` |

`favoriteIds` is the shared set every heart reads; it is **not** refetched after a
successful toggle because the client already wrote the correct value. A failure
restores the exact snapshot (`removeQueries` only when there was no snapshot).

## Cart (one entry, server-priced)

Implemented in [`src/lib/query/cart.ts`](../src/lib/query/cart.ts).

| Mutation | Optimistic write | Invalidates |
| --- | --- | --- |
| add line | none — a new line needs server pricing | `cart` (on success) |
| update line (qty / dates / mode / saved-for-later) | none — server-priced | `cart` (on success) |
| remove line | `withoutCartItem(previous, id)` | `cart` (on settle) |
| clear cart | `items: []`, zeroed totals | — |
| validate cart | adopts the response's `items` + `totals` | — |

The navbar badge and the drawer read the same `cart` entry, so no separate badge
key is invalidated.

## Orders, rentals and payments (short-lived, refetch aggressively)

| Mutation | Invalidates |
| --- | --- |
| Cancel order (`orders`, `OrderActionsPanel`) | `orders`, `orderAll` |
| Create order from payment (`payment`) | `cart`, `payment`, `orders`, `orderAll`, `rentals`, `transactions`, `notifications` |
| Cancel payment (`payment`) | `payment` |
| Rental lifecycle change (`rentals`) | `rentals`, `rental(id)`, and `orderAll` where the change is order-visible |
| Seller rental change (`seller-rentals`) | `rentals`, `orders` |
| Seller wallet payout / method (`seller-wallet`) | `walletAll` (one prefix covers balance, ledger, payouts and methods) |

## Notifications and messaging

| Mutation | Effect |
| --- | --- |
| Mark one read | `setQueriesData` over `notificationsListRoot` (every cached page) + invalidate `notifications` |
| Dismiss / delete one | `setQueriesData` over `notificationsListRoot`, then invalidate `notifications` |
| Update preferences | invalidate `notificationPreferences` |
| Send / start a message | invalidate `conversations` |
| Block / unblock an account (`safety`) | invalidate `blockedUsers` and `conversations` |

`blockedUsers` is evicted on logout like any other private list: **who blocked whom
is never shown to the blocked party**, and the toggle in a thread header derives its
state from this one list rather than a per-conversation flag the server does not send.
A block invalidates `conversations` too, because an existing thread stops being
sendable and only the server can correct the cached copy.

The unread *badge* is `notificationUnreadCount`, a server `COUNT(*)`; it is never
derived by summing a page, so a list write does not have to keep it arithmetically
consistent.

## Support, reports and the seller order desk

| Mutation | Effect |
| --- | --- |
| Create / reply / reopen / rate a support ticket (`support`) | invalidate `support` — one prefix covers the ticket list and every transcript |
| File a report (`safety`) | nothing cached: a report is a write with no readable list behind it, so only a confirmation toast changes |
| Seller fulfilment step / cancellation (`seller-orders`) | invalidate `sellerOrders` (prefix — list **and** detail), `sellerSummary`, `sellerAlerts` |
| Seller bulk fulfilment (`seller-orders`) | the same three keys as one step; a batch is N single writes the client delays with an undo window, not a separate server effect |
| Seller alert reads (`seller-dashboard`) | `sellerAlerts`, with a 30s `staleTime` (stock and return dates move, but a sibling card's re-render should not refetch the list) |

A seller write reaches further than the order it names: the dashboard's "Orders to
action" card counts the same lines and a delivery moves a stock figure, so the
invalidation is the `sellerOrders` *prefix* plus the two summary keys rather than a
per-row patch. The customer who placed the order is another session entirely —
their view is corrected by a server notification (`notifyOrderProgress`), never by
this client's cache.

## Account, seller and admin

| Mutation | Invalidates |
| --- | --- |
| MFA setup / verify / disable / recovery codes (`auth`) | `authMfaStatus` |
| Revoke one session (`auth`) | `authSessions` |
| Address add / edit / remove (`profile`) | `addressKeys.all` |
| Seller onboarding / profile edit (`seller-dashboard`) | `sellerProfile`, `sellerOnboarding`, `sellerPublic` (onboarding also `auth`, `sellerMe`) |
| Admin order / user / seller / review / category action (`admin`) | the matching `admin*` root only |
| Admin RBAC grant / revoke (`admin`) | `adminRbac` |

## Logout

`privateQueryKeys` (see `keys.ts`) is evicted on logout/session loss, along with
`clearPrivateCollections()` for the TanStack DB mirror. Public keys (`products`,
`categories`, `stats`, a seller's public shopfront) are deliberately kept.
