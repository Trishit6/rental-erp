# Revaro database

Everything about the MariaDB schema: what the 56 tables are for, how money and
identifiers are stored, how statuses map between the brief and the database,
why each index exists, and the follow-ups the current schema knowingly defers.

The schema lives in **`server/schema.ts`** — this document explains it; it does
not restate it. When the two disagree, `server/schema.ts` wins.

---

## 1. Source of truth and how migrations are made

| artefact            | what it is                                            | who edits it            |
|---------------------|-------------------------------------------------------|-------------------------|
| `server/schema.ts`  | Every table, column, index, constraint, relation      | developers — **the single source** |
| `drizzle/00NN_*.sql`| Generated + custom migration SQL                      | drizzle-kit (SQL hand-written only for custom migrations) |
| `drizzle/meta/*`    | Snapshots + `_journal.json`                           | drizzle-kit automatic   |
| `docs/database.md`  | This explanation                                      | developers              |

The rule: **modify `server/schema.ts`, then `pnpm db:generate`, inspect the
generated SQL (it must be additive — never a rename or a rewrite of a
data-bearing column), then `pnpm db:migrate`.** Never hand-edit a migration
that drizzle-kit generated; it will be re-generated from the schema and the
divergence becomes permanent drift.

### Custom migrations

Two things drizzle-kit cannot express become **custom** migrations made with
`drizzle-kit generate --custom`. They are journaled like any other migration
(so they replay on an empty database too) but are *not* diffed against the
schema, so the next `db:generate` will not drop them:

* **`0019_fulltext_search_backfill.sql`** — the `FULLTEXT` index on
  `products.search_text` (drizzle-kit has no MySQL FULLTEXT API) and the
  one-off backfills that give `search_text`, `order_items.slug_snapshot` and
  `seller_profiles.listings_count` real values.

### Migrating an empty *and* a populated database

* Empty: `pnpm db:verify:migrate` creates `reloop_migrate_test`, replays the
  whole journal from migration `0000`, checks all 56 tables plus the FULLTEXT
  index come out, and drops the test database again.
* Populated: `pnpm db:migrate` applies only what the journal has not recorded
  yet — the way development databases advance.

A migration must be valid for both. Anything that would only apply to an empty
database (e.g. a `CHECK` that the existing rows already violate) is rejected —
see Follow-up **F2**.

> **MariaDB pitfall (why three `CHECK`s are missing).** MariaDB refuses
> `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY` when the FK's column is
> referenced by a `CHECK` on the same table: *"Function or expression
> 'category_id' cannot be used in the CHECK clause"* (reproduced on 12.3.3).
> drizzle-kit emits FKs as separate `ALTER`s, so the joined
> `CHECK`+`FOREIGN KEY` pattern is impossible for new tables. Three
> cross-column `CHECK`s were therefore moved from the schema into Zod:
>
> | constraint that would have been                              | where it is enforced now                        |
> |--------------------------------------------------------------|-------------------------------------------------|
> | `commission_rules`: `scope='CATEGORY' ⇒ category_id NOT NULL` | `commissionRuleInsertSchema` (`.refine`) in `server/schema-zod.ts` |
> | `commission_rules`: `scope='SELLER' ⇒ seller_id NOT NULL`     | `commissionRuleInsertSchema` (`.refine`)        |
> | `coupons`: `applies_to='CATEGORY' ⇒ category_id NOT NULL`     | `couponInsertSchema` (`.refine`)                |
>
> The foreign keys themselves still enforce that the referenced rows exist.
> New tables: if a `CHECK` references a column that takes an FK, expect the
> same failure and move the check to Zod — the FK can be created, the cross
> column cannot.

---

## 2. Money and identifier conventions

**Money is integer paise, never `double` or `decimal`.** `1_00_000` paise =
₹1,000.00. This holds for every money column including the PROMPT 1 ones:

| table | column(s) |
|-------|-----------|
| `products` | `purchase_price`, `security_deposit`, `rental_price_per_day` |
| `orders` | `subtotal`, `total`, `deposit_total` |
| `order_items` | `unit_price`, `line_total` |
| `rentals` | `total` |
| `transactions`, `payouts`, `wallet_transactions` | `amount` |
| `refunds` | `amount` |
| `coupons` | `discount_value` |
| `coupon_redemptions` | `discount_paise` |
| `commission_rules` | `fixed_fee_paise` |

**Percentages are basis points, never floats.** `250` = 2.50%, `10000` = 100%.
`commission_rules.percent_bp` and `coupons.discount_value` (when
`discount_type = 'PERCENT'`) both CHECK to `BETWEEN 0 AND 10000`. A commission
computed in floating point disagrees with the ledger it must match.

**Currency** is a `varchar(3)` column defaulting to `'INR'`, not a lookup
table. `refunds.currency` CHECKs `LENGTH(currency) = 3`.

**Every table has `id int AUTO_INCREMENT`** except the pure junctions
(`role_permissions`, `user_roles`, `conversation_participants`, `product_tags`)
and `user_mfa`, which is keyed by `user_id` (one MFA enrolment per account).
Human-facing identifiers — `order_number`, `dispute_number`, `ticket_number`,
`refund_number`, `job_key`, `config_key`, `block_key`, `coupons.code` — carry
their own `UNIQUE` constraint and are what appears in emails, receipts and URLs.

**Timestamps** are `timestamp` with `DEFAULT (now())`; stateful tables add
`updated_at … ON UPDATE CURRENT_TIMESTAMP`. Append-only tables document in the
schema why they have no `updated_at` (messages, events, audits, attempts,
redemptions, junctions).

---

## 3. Statuses: the brief's names vs. what is stored

Status/role/mode columns are **`varchar`, never MySQL `ENUM`**. Rows exist
that carry values written before a module existed, and rewriting stored enum
values is the most destructive DDL there is. A `varchar` plus a vocabulary
asserted in `server/lib/enums.ts` costs nothing at read time and cannot corrupt
history. The canonical brief→stored map lives at the top of `enums.ts` and is
reproduced here:

| brief             | stored here                    |
|-------------------|--------------------------------|
| `product_mode`    | `listing_type`: BUY → `SALE`, RENT → `RENT`, RENT_AND_BUY → `BOTH` |
| `order_status`    | `PENDING` → `PENDING_PAYMENT`, plus `READY_FOR_PICKUP`; `PAID` survives as a legacy value |
| `payment_status`  | `transactions.status` matches the brief exactly; `orders.payment_status` is the order-level view (`PENDING`/`PAID`/`REFUNDED`/…) |
| `review_status`   | `PUBLISHED` / `HIDDEN` |
| `audit_logs`      | `admin_audit_log` |
| `rental_status`   | stored keeps `OVERDUE` / `DISPUTED` too; the brief's `PENDING` / `UPCOMING` / `EXPIRED` have no stored equivalent — rentals are `CONFIRMED` from the moment an order is |
| `ticket_status`   | `OPEN` / `PENDING` / `IN_PROGRESS` / `RESOLVED` / `CLOSED` — new table, no history to reconcile |
| `user_status`     | **no column** — suspension currently overwrites `users.role` (Follow-up **F3**) |
| `seller_status`   | **no column** — `seller_profiles.verified` only (Follow-up **F4**) |

### PROMPT 1 vocabularies (all in `server/lib/enums.ts`, all Zod-validated)

* **RBAC** — `SYSTEM_ROLES` = `SUPER_ADMIN, ADMIN, SUPPORT, FINANCE, MODERATOR, CONTENT_MANAGER`; `ALL_ROLE_NAMES` = system roles + `USER, SELLER` so every `users.role` value resolves to a row. Permission keys are `resource.action` (`PERMISSION_KEY_PATTERN`, CHECKed via `permissions_key_has_separator`).
* **Support** — `TICKET_STATUSES` = `OPEN, PENDING, IN_PROGRESS, RESOLVED, CLOSED`; `TICKET_PRIORITIES` = `LOW, NORMAL, HIGH, URGENT` (ordered; position = weight).
* **Money disputes** — `REFUND_STATUSES` = `PENDING, PROCESSING, SUCCEEDED, FAILED, CANCELLED` (matches `transactions.status`); `DISPUTE_STATUSES` = `OPEN, UNDER_REVIEW, RESOLVED, DISMISSED`.
* **CMS** — `CMS_STATUSES` = `DRAFT, SCHEDULED, ACTIVE, PAUSED`; `BANNER_PLACEMENTS` = `HERO, CATEGORY_STRIP, FOOTER`.
* **Growth** — `DISCOUNT_TYPES` = `PERCENT, FLAT`; `COUPON_SCOPES` = `ALL, CATEGORY, PRODUCT`; `COMMISSION_SCOPES` = `GLOBAL, CATEGORY, SELLER`; `EXPORT_JOB_STATUSES` / `EXPORT_JOB_TYPES`.
* **Security** — `SECURITY_EVENT_TYPES` (15 append-only event kinds), `LOGIN_FAILURE_REASONS`.

---

## 4. Entity-relationship diagram

Legend: `1—<` one-to-many, `1—1` one-to-one, `><` junction, `0` optional side.
Only foreign keys are drawn; `__drizzle_migrations` is omitted.

```
auth ─────────────────────────────────────────────────────────────────
  users 1—< sessions ─(revoked_by 0—> users)
   │    1—< addresses
   │    1—< login_attempts (user_id nullable)
   │    1—< security_events (user_id nullable)
   │    1—< user_mfa (1—1) ; 1—< mfa_recovery_codes
   │    1—>< user_roles >< roles 1—< role_permissions >< permissions

catalogue ─────────────────────────────────────────────────────────────
  categories 1—0 categories (parent)
  users 1—< seller_profiles (1—1) ; 1—< products (seller_id, CASCADE — F1)
  products 1—< product_images, product_tags, favorites (user_id too)
  carts 1—< cart_items 0—> products

commerce ──────────────────────────────────────────────────────────────
  users 1—< orders 1—< order_items 0—> products
   │              │ 1—< rentals 1—< rental_events
   │              └ 1—0 conversations 1—< conversation_participants >< users
   │                     1—< messages (author 0—> users)
   ├ 1—< reviews 1—< review_helpful_votes ; reviews 0—> order_items
   └ 1—< reports (0—> products / users / orders)

wallet ────────────────────────────────────────────────────────────────
  users 1—< seller_payout_methods ; 1—< payouts
  transactions 1—< wallet_transactions ; orders / rentals 1—0 transactions

growth + support + admin ──────────────────────────────────────────────
  users 1—< coupons (0—> categories) 1—< coupon_redemptions 0—> orders
  users 1—< commission_rules (0—> categories)
  users 1—< refunds 0—> orders / order_items / transactions
  users 1—< disputes 0—> orders
  users 1—< seller_verifications
  users 1—< support_tickets (0—> orders; assignee 0—> users)
            1—< ticket_messages 1—< ticket_attachments
  users 1—0 cms_banners, cms_blocks, feature_flags (created_by)
  users 1—0 app_config (updated_by) ; users 1—< export_jobs (requested_by)

foundation ────────────────────────────────────────────────────────────
  orders 1—< order_events (actor 0—> users)
  products 1—< stock_reservations (0—> orders)
  idempotency_keys ; payment_webhook_events ; platform_settings ; search_history
```

Multi-FK tables declared against `users`, `orders` or `categories` more than
once (`support_tickets`, `coupons`, `seller_verifications`, `refunds`,
`disputes`, `commission_rules`, `user_roles`) use explicit
`relationName` on **both** sides of each relation — an unnamed second relation
to the same table is how Drizzle relations silently misroute upon `.findMany
with relation`.

---

## 5. What each table is for

### PROMPT 1 (22 new tables)

**RBAC & identity**

* `roles` — `name` unique (case-insensitive collation), `is_system` marks the
  six seeded roles. Deleting a role that `user_roles` still grants is
  `RESTRICT` — a role with grants cannot silently vanish.
* `permissions` — one row per `resource.action` key, `group_key` for the
  UI grouping. Keys CHECK `LIKE '%.%'`.
* `role_permissions` — junction (PK `role_id, permission_id`), `CASCADE` both
  ways: a permission set is rebuilt, never edited.
* `user_roles` — junction (PK `user_id, role_id`), `CASCADE` on user,
  `RESTRICT` on role, `granted_by` → users `SET NULL`.
* `user_mfa` — PK `user_id`, `secret_encrypted` only (the key material is
  encrypted server-side; never plaintext), `enabled_at`, `last_used_at`.
* `mfa_recovery_codes` — `code_hash` unique, `used_at`; one-time codes are
  hashed, never stored.
* `login_attempts` — append-only per-attempt log (identifier, ip, success,
  `failure_reason`); the driver of rate limiting.
* `security_events` — append-only audit trail (`type` from
  `SECURITY_EVENT_TYPES`, `user_id` nullable `SET NULL`).

**CMS**

* `cms_banners` — hero/category-strip/footer placements, `placement + status +
  sort_order` index for the render query, scheduled window CHECKed ordered.
* `cms_blocks` — keyed content blocks (`block_key` unique), draft/active flow.

**Support**

* `support_tickets` — customer ticket, nullable `assignee_id` (`SET NULL`),
  `order_id` (`SET NULL`), `sla_due_at` CHECKed after `created_at`.
* `ticket_messages` — append-only transcript, `is_internal` for staff notes
  (never exposed to the customer), `CASCADE` from the ticket.
* `ticket_attachments` — file reference only (name, url, mime, size),
  `CASCADE` from the message.

**Money-path**

* `refunds` — refund ledger, `uniq_number` + `uniq_idempotency_key` (optional),
  `amount > 0`, order `RESTRICT`, order_item/transaction `SET NULL` so history
  survives.
* `disputes` — dispute record, `resolved_at >= created_at` CHECKed, order
  `RESTRICT`.
* `commission_rules` — resolution chain GLOBAL → CATEGORY → SELLER. Unique on
  `(scope, category_id, seller_id, effective_from)` — see Follow-up **F6** for
  the NULL caveat. Percent/fee CHECKs; window CHECKed ordered.
* `seller_verifications` — document verifications (PAN, GSTIN, AADHAAR…). The
  document itself is never stored — only `document_ref_hash`. `REJECTED`
  requires a `rejection_reason` (CHECK). `seller_id` `RESTRICT`: a
  verification history that vanishes proves nothing.

**Growth**

* `coupons` — code unique (case-insensitive), PERCENT (bp ≤ 10000) or FLAT,
  window + usage-limit CHECKs; `applies_to` `ALL/CATEGORY/PRODUCT` with
  `category_id`/`seller_id` `SET NULL`.
* `coupon_redemptions` — append-only; unique `(coupon_id, order_id)` so one
  order cannot burn a coupon twice; `CASCADE` from the coupon.
* `feature_flags` — `key` unique, `enabled`, `rollout_percent` 0–100 CHECKed,
  `audience`.
* `app_config` — key/value application config; `updated_by` `SET NULL`.
* `export_jobs` — asynchronous export requests (`ORDERS`, `PAYOUTS`,
  `AUDIT_LOG`, …), `job_key` unique, `expires_at > created_at` CHECKed.

### Pre-existing (34 tables) — brief sketch

* **auth**: `users`, `sessions` (see §7 for the extended columns).
* **catalogue**: `categories` (self-FK), `products`, `product_images`,
  `product_tags`, `favorites`.
* **commerce**: `carts`, `cart_items`, `orders`, `order_items`,
  `rentals`, `rental_events`, `reviews`, `review_helpful_votes`, `reports`.
* **wallet**: `seller_profiles`, `seller_payout_methods`, `payouts`,
  `wallet_transactions`, `transactions`.
* **messaging & notifications**: `conversations`,
  `conversation_participants`, `messages`, `notifications`,
  `notification_preferences`, `admin_audit_log`.
* **foundation**: `order_events`, `stock_reservations`, `idempotency_keys`,
  `payment_webhook_events`, `platform_settings`, `search_history`.

---

## 6. Index rationale (the why, not just the list)

Index names carry their intent; the schema is the list. The reasoning:

* **Search** — `products_search_fulltext` (FULLTEXT, custom migration 0019)
  over the denormalised `search_text` handles natural-language words;
  `products_title_idx` (plain btree on `title`) is the **prefix fallback** for
  `LIKE 'chair%'` and for tokens under InnoDB's 3-character full-text minimum —
  a short query degrades to an indexed prefix scan, never a table scan.
* **List/admin feeds** — every newest-first list has a
  `(status, created_at)`-style index (`orders_status_created_idx`,
  `transactions_status_created_idx`, `disputes_status_created_idx`,
  `support_tickets_status_created_idx`, `export_jobs_status_created_idx`, …).
* **Work queues** — assignee/status and SLA scans
  (`support_tickets_assignee_status_idx`, `support_tickets_sla_idx`),
  `login_attempts_identifier_created_idx` (rate limiting),
  `mfa_recovery_codes_user_used_idx` (recovery-code sweeps),
  `feature_flags_enabled_idx` (flag evaluation).
* **FK support** — InnoDB needs an index whose **leftmost** column is each FK
  column. Where the table's PK or unique is not such an index (e.g.
  `user_roles` PK starts with `user_id`, `role_id` needs its own), the
  migration names an explicit index (`user_roles_role_id_idx`,
  `role_permissions_permission_id_idx`, …). Tables added in 0018 get their
  single-column `*_idx` for this reason, so the FK lookup never builds a
  hidden index.

---

## 7. Denormalised fields (who writes them, when)

Everything denormalised has exactly two writers: the **transaction that moves
the source rows**, and the **one-off 0019 backfill** for rows that existed
before the column did. There is no third writer.

* **`products.search_text`** — `TRIM(CONCAT_WS(' ', title, IFNULL(description,'')))`,
  written in the same transaction as a `title`/`description` change. Backfilled
  for all 20k existing rows in 0019.
* **`order_items.slug_snapshot`** — the product's slug at order time, so a
  receipt/order line still links after the slug (or product) changes. Written
  at order creation; backfilled from the current slug in 0019.
* **`seller_profiles.total_sales_paise` / `total_earnings_paise` /
  `rating_average` / `rating_count`** — ledger aggregates. Written inside the
  order/refund/review transactions. **Deliberately left at their `0`
  defaults** in 0019: guessing a definition of "sale" in a migration would
  produce a number that disagrees with the ledger, which is worse than a zero.
* **`seller_profiles.listings_count`** — unambiguous (COUNT of rows in
  `products`), backfilled in 0019. Verified against a live recount by
  `db:verify:constraints`-style probing during the migration work.

---

## 8. RBAC & the seeded roles

`pnpm db:seed` truncates all 56 tables (children first — the order is enforced
by `tests/seed-truncate.test.ts`) and then `seedRbac()` inserts 17 permissions
(`PERMISSIONS` in `server/seed.ts`), the roles (`SUPER_ADMIN` … `CONTENT_MANAGER`
+ `USER` + `SELLER`, marked `is_system`) and the grants. `USER`/`SELLER` hold
**zero grants** by design. The seeded admin gets `ADMIN` (all permissions except
`rbac.manage`); only `SUPER_ADMIN` can grant roles.

---

## 9. Follow-ups (F1–F6)

The schema defers these knowingly. None blocks the current features; each
states what changes and what must be true before it does.

* **F1 — `products.seller_id` is `ON DELETE CASCADE`.** Deleting a seller
  silently rewrites their order/rental/review history rows to `NULL` seller
  ids. The money trail should outlive the account; changing the rule to
  `RESTRICT` (or `SET NULL`) must be decided with the account-deletion flow.
* **F2 — rental-window `CHECK`s are missing because live data violates
  them.** `rentals.id = 129` and nine `order_items` rows store an
  `end <= start`. `stock_reservations` gets its `window_ordered` check; the
  seeded tables cannot. Fix the rows, then add the `CHECK`s.
* **F3 — no `user_status` column.** Suspension currently overwrites
  `users.role` with `SUSPENDED`, faking a role the RBAC grant tables know
  nothing about. A real `users.user_status` column with `ACTIVE/SUSPENDED`
  (and no overlap with `role`) is the fix.
* **F4 — no `seller_status` column.** `seller_profiles.verified` is boolean
  only; the brief's `PENDING/ACTIVE/RESTRICTED/SUSPENDED` needs its own column
  and a migration of the current verified state into it.
* **F5 — the brief's `rental_status` vocabulary is not fully stored.**
  `PENDING/UPCOMING/EXPIRED` have no stored values (rentals are `CONFIRMED`
  from order creation; `OVERDUE/DISPUTED` are stored extras). Adding the
  missing statuses is schema work that needs the rental feature's business
  rules to say what they mean first.
* **F6 — `commission_rules` unique does not cover NULL-subject rows.
  ** MySQL treats NULLs as distinct in a unique index, so
  `(scope, category_id, seller_id, effective_from)` only dedupes rules that
  name **every** subject (a seller's category override). GLOBAL/CATEGORY
  singleton-per-start rules are the API layer's job until MariaDB's
  `NULLS NOT DISTINCT` (rejected by this build 12.3.3 in every syntax tried)
  or dedicated guard rows exist. Proven by `pnpm db:verify:constraints`.