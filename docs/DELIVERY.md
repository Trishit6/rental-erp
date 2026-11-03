# Delivery Foundation

## Data Model

### Tables

- **delivery_zones** – zone definitions with pincode arrays and fast lookup via `delivery_zone_pincodes`.
- **delivery_partners** – registered partners with status, vehicle info, capacity limits, and ratings.
- **delivery_partner_zones** – many-to-many partner↔zone mapping.
- **delivery_partner_applications** – partner onboarding pipeline with statuses DRAFT→SUBMITTED→IN_REVIEW→NEEDS_INFO→APPROVED→REJECTED.
- **delivery_partner_documents** – evidence attachments (ID proof, driving licence, vehicle RC, selfie, address proof). Numbers stored masked (last 4 + salted hash only).
- **deliveries** – the core delivery record with state machine status, partner assignment, OTP, snapshots, slot windows, and financial amounts.
- **delivery_offers** – partner bids on deliveries, unique per (delivery_id, partner_id).
- **delivery_events** – immutable audit trail of status transitions with event_key for idempotency.
- **delivery_proofs** – photos from pickup/drop/return with private storage keys.
- **partner_ledger** – earnings, adjustments, cash collected/remitted, and payout lines with idempotency keys.
- **delivery_ratings** – partner ratings per delivery (1–5).
- **delivery_locations** (flag-gated) – partner's latest lat/lng.

### Delivery Status State Machine

```
CREATED -> AWAITING_ASSIGNMENT -> OFFERED -> ASSIGNED -> AT_PICKUP -> PICKED_UP ->
IN_TRANSIT -> AT_DROP -> DELIVERED
                     |               |
                 FAILED          RETURNING_TO_SELLER -> RETURNED_TO_SELLER
                     |
                 CANCELLED (any pre-PICKED_UP state)
```

- RETURN jobs use the same machine: customer is pickup, seller is drop, ending at RETURNED_TO_SELLER (= rental RETURNED).
- Transitions after AT_DROP/IN_TRANSIT can roll back to RESCHEDULED (back to AWAITING_ASSIGNMENT with attempt_no+1, max 2 attempts).
- Any pre-PICKED_UP state can be CANCELLED.

### Per-Status Required Proof

| Status               | Required Proof           |
|----------------------|--------------------------|
| ASSIGNED             | pickup_code              |
| AT_PICKUP            | pickup_code              |
| PICKED_UP            | delivery_otp             |
| AT_DROP              | delivery_otp, pickup_photo |
| RETURNING_TO_SELLER  | delivery_otp             |

### Index Justification

| Index | Reason |
|-------|--------|
| `delivery_zones_name_idx` | Fast zone lookup by name |
| `delivery_zones_city_idx` | Filter deliveries by city |
| `delivery_zones_state_idx` | Filter deliveries by state |
| `delivery_zones_status_idx` | Filter by active/inactive |
| `delivery_zone_pincodes_pincode_zone_id_unique` | Enforce PK uniqueness for PIN lookup |
| `delivery_zone_pincodes_zone_id_idx` | Fast zone lookup by PIN |
| `delivery_partners_user_id_idx` | Look up partner by user |
| `delivery_partners_status_idx` | Filter partners by status |
| `delivery_partners_city_idx` | Filter partners by city |
| `delivery_partners_active_idx` | Active partner queries |
| `delivery_partner_zones_zone_id_idx` | Find partner zones |
| `delivery_partner_zones_partner_id_idx` | Find zones for partner |
| `delivery_partner_applications_status_submitted_idx` | Review queue by submission date |
| `delivery_partner_applications_user_id_idx` | Look up by user (must be unique) |
| `delivery_partner_documents_application_id_idx` | Find documents by application |
| `delivery_partner_documents_type_idx` | Filter by document type |
| `delivery_partner_documents_status_idx` | Filter by document status |
| `delivery_partner_documents_application_status_idx` | Combined status+application filter |
| `delivery_partner_documents_application_id_type_unique` | One document per type per application |
| `deliveries_status_zone_id_idx` | Status+zone filter |
| `deliveries_partner_id_status_idx` | Partner's active jobs |
| `deliveries_order_id_idx` | Look up by order |
| `deliveries_seller_id_status_idx` | Seller's deliveries |
| `deliveries_created_at_idx` | Chronological queries |
| `delivery_offers_delivery_id_partner_id_unique` | One offer per (delivery, partner) |
| `delivery_events_delivery_id_idx` | Events per delivery |
| `delivery_proofs_delivery_id_idx` | Photos per delivery |
| `partner_ledger_partner_id_idx` | Partner earnings |
| `partner_ledger_delivery_id_idx` | Ledger per delivery |
| `delivery_ratings_delivery_id_idx` | Rating per delivery |
| `delivery_locations_partner_id_idx` | Partner location (when flag-gated) |

### Delivery Numbers

- Format: `DL-YYYY-XXXXXX` (unique, customer-facing).
- Generated via `generateReferenceNumber()` at creation.

### Money

- All monetary amounts are integer **paise** (100 paise = 1 unit).
- Fields: `delivery_fee_paise`, `partner_pay_paise`, `cod_amount_paise`, `base_fee_paise`, `free_above_paise`.
- CHECK constraints: `amount >= 0`.

### Seller Pickup Location

- Seller must have a `pickup_address_id` (FK to `addresses`) set before offering delivery.
- Stored in `seller_profiles` or equivalent.

## State Machine (pure, exhaustively tested)

### States

`CREATED`, `AWAITING_ASSIGNMENT`, `OFFERED`, `ASSIGNED`, `AT_PICKUP`, `PICKED_UP`, `IN_TRANSIT`, `AT_DROP`, `DELIVERED`, `FAILED`, `RETURNING_TO_SELLER`, `RETURNED_TO_SELLER`, `CANCELLED`

### Transitions

| From → To          | Allowed Actors | Required Proof      | Side Effects                              |
|--------------------|----------------|---------------------|-------------------------------------------|
| CREATED → AWAITING_ASSIGNMENT | partner, seller, customer, admin, system | none         | None (initial state)                     |
| AWAITING_ASSIGNMENT → OFFERED | partner         | none              | Write `delivery_event`                   |
| OFFERED → ASSIGNED   | partner         | pickup_code         | Write `delivery_event`; decrement offer rounds |
| ASSIGNED → AT_PICKUP | partner         | pickup_code         | Write `delivery_event`                   |
| AT_PICKUP → PICKED_UP | partner         | delivery_otp         | Write `delivery_event`; update partner job count |
| PICKED_UP → IN_TRANSIT | partner, seller | delivery_otp         | Write `delivery_event`                   |
| IN_TRANSIT → AT_DROP | partner, seller | delivery_otp, pickup_photo | Write `delivery_event`               |
| AT_DROP → DELIVERED  | partner, seller | delivery_otp, pickup_photo | Write `delivery_event`; update ledger   |
| AT_DROP/IN_TRANSIT → FAILED | partner, system | delivery_otp       | Write `delivery_event`; increment attempt_no |
| FAILED → RESCHEDULED  | system          | none                | Back to AWAITING_ASSIGNMENT, attempt_no+1 (max 2) |
| Any pre-PICKED_UP → CANCELLED | partner, seller, admin, system | none      | Write `delivery_event`                   |
| ASSIGNED → RETURNING_TO_SELLER | seller       | delivery_otp        | Write `delivery_event`; maps to rental return |
| RETURNING_TO_SELLER → RETURNED_TO_SELLER | seller | none               | Write `delivery_event`; maps to rental RETURNED |

### Illegal transitions throw `HttpError(409, "INVALID_TRANSITION", ...)`.

### Event Key Idempotency

Each transition writes a `delivery_events` row with a unique `event_key` in the format:
`delivery:{deliveryId}:{toStatus}:{actor.userId}:{isoTimestamp}`.
If the same event_key is reused, the transition is a no-op (idempotent).

### `transitionDelivery(input)` writes inside a transaction with a row lock on the deliveries row.

## Settings (platform_settings keys, defaults)

| Key                        | Default  | Description                                                       |
|----------------------------|----------|-------------------------------------------------------------------|
| `delivery.enabled`         | `true`   | Whether delivery is enabled globally.                               |
| `delivery.offerExpirySeconds` | `120`   | How long a delivery offer remains valid.                          |
| `delivery.maxOfferRounds`  | `3`      | Maximum offer rounds before delivery is cancelled.                 |
| `delivery.maxActiveJobsPerPartner` | `3` | Max active deliveries a partner can handle.                      |
| `delivery.otpTtlHours`     | `72`     | How long an OTP remains valid in hours.                           |
| `delivery.otpMaxAttempts`  | `5`      | Max OTP attempts allowed.                                         |
| `delivery.maxDeliveryAttempts` | `2`   | Max delivery attempts before marking failed.                      |
| `delivery.failureReasons`  | list     | Comma-separated valid codes: ATTEMPT_EXCEEDED, TIMEOUT, etc.       |
| `delivery.liveLocation`    | `false`  | Whether live location tracking is enabled.                        |
| `delivery.codMaxPerPartnerPaise` | `50000` | Max COD amount in paise per partner.                            |
| `delivery.slotWindows`     | `MORNING,AFTERNOON,EVENING` | Comma-separated available slot windows.                    |

## Permissions (server/lib/permission-catalogue.ts)

### New keys added

- `delivery.view` – View delivery, offer and partner records
- `delivery.manage` – Change delivery status and write delivery events
- `delivery.partners.review` – Review partner applications and documents
- `delivery.partners.manage` – Approve, suspend and offboard delivery partners
- `delivery.zones.manage` – Manage delivery zones and pincode maps
- `delivery.settle` – Settle partner earnings and publish ledger lines

### System role

- **DELIVERY_MANAGER** – granted the six delivery permissions above.
- `SUPER_ADMIN` and `ADMIN` get all permissions (derived from `PERMISSION_KEYS`).

### RBAC grant

Run `pnpm db:sync:rbac` after adding the new keys and role. The grant table will have:

```
SUPER_ADMIN: all keys
ADMIN: all keys
DELIVERY_MANAGER: delivery.view, delivery.manage, delivery.partners.review, delivery.partners.manage, delivery.zones.manage, delivery.settle
SUPPORT: existing support permissions
```

## Query Keys (`src/lib/query/keys.ts`)

- `queryKeys.delivery` – `["delivery"]` (public list/details)
- `queryKeys.deliveryList` – `["delivery"]` as const
- `queryKeys.deliveryDetail(deliveryId)` – `["delivery", deliveryId]` as const
- `queryKeys.deliveryPartner(partnerId)` – `["delivery", "partner", partnerId]` as const

## Security Rules

- **Never trust client-supplied identity, prices, totals, or status.** All mutations go through guarded handlers that re-verify the session user's role and the delivery's current state.
- **Suspended partners**: sessions are revoked and active jobs are flagged for reassignment. `requireDeliveryPartner()` re-reads the partner row per request; a suspended partner gets a 409 error on any mutation.
- **Ownership failures return 404, not 403**, per the project convention.
- **OTP and pickup codes are never stored in clear text** – hashes only (see `server/lib/crypto.ts`).
- **Photos** are stored with private storage keys; URLs are signed per-request.

## Administration

- Admin can configure delivery methods, service areas, and platform settings via `POST /api/admin/delivery/*`.
- Partner review flow: `POST /api/delivery/partners/applications` with document uploads.
- Settle partner earnings via admin mutation `delivery.settle`.

## Tests

- State machine matrix: every legal and illegal transition per actor role.
- Constraint tests: CHECK constraints on amounts >= 0, rating 1..5.
- Zone lookup by PIN: verify `delivery_zone_pincodes` fast path.
- Permission catalogue completeness: all keys and roles are registered.
- Partner guard: `requireDeliveryPartner()` revokes suspended sessions.

## New Dependencies

- None. All implementation uses existing project foundations (Drizzle ORM, TanStack Query, Zod validation, Hono/Express API).