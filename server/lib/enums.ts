import { z } from "zod";
import { PRODUCT_STATUSES } from "./product-status";
import { PRODUCT_CONDITIONS } from "./product-filters";
import { LEGACY_ORDER_STATUSES, ORDER_STATUSES, ORDER_TYPES } from "./order-queries";
import { CLOSED_STATUSES, IN_HAND_STATUSES, RENTAL_STATUSES } from "./rental-lifecycle";
import { ADMIN_PRODUCT_LISTING_TYPES } from "./admin-products";

/**
 * **The one shared definition file for Revaro's stored vocabularies.**
 *
 * Every status/mode/role column in the database is a `varchar`, never a MySQL
 * `ENUM` — that is deliberate and it is the rule for new columns too. Rows exist
 * that carry values written before the owning module existed, and a migration
 * that rewrites stored enum values is the single most dangerous kind of DDL: it
 * is invisible, irreversible and it fails halfway on a populated table. A
 * `varchar` plus a vocabulary asserted here costs nothing at read time and
 * cannot corrupt history.
 *
 * ## The rule
 *
 * A vocabulary has exactly **one** owner module. If you need a new status:
 *
 *  1. add it to its owner below (or define a new owner if there isn't one),
 *  2. export it through this file,
 *  3. assert the client mirror agrees in a test — the client cannot import
 *     `server/`, so `src/lib/types.ts` mirrors the list and
 *     `tests/listing-status.test.ts` is what keeps the two honest.
 *
 * Never restate a list inline at a call site. `"PUBLISHED"` typed in three
 * places is three vocabularies pretending to be one.
 *
 * ## Brief-name → stored-name
 *
 * The spec these tables were built against uses different words for a few
 * things than this codebase stores. They are recorded here rather than
 * "corrected", because renaming stored values would mean rewriting rows and
 * every query that reads them:
 *
 * | brief             | stored here                    |
 * |-------------------|--------------------------------|
 * | `product_mode`    | `listing_type`: BUY → `SALE`, RENT → `RENT`, RENT_AND_BUY → `BOTH` |
 * | `order_status`    | `PENDING` → `PENDING_PAYMENT`, plus `READY_FOR_PICKUP`; `PAID` survives as a legacy value |
 * | `payment_status`  | `PAID` (not `SUCCEEDED`); `REFUNDED` lives on `orders.payment_status`, not `orders.status` |
 * | `review_status`   | `PUBLISHED` / `HIDDEN`         |
 * | `audit_logs`      | `admin_audit_log`              |
 * | `rental_status`   | stored keeps `OVERDUE` / `DISPUTED`, adds them to the brief's list; the brief's `PENDING` / `UPCOMING` / `EXPIRED` have no stored equivalent — rentals are `CONFIRMED` from the moment an order is |
 * | `payment_status`  | `transactions.status` matches the brief exactly; `orders.payment_status` is the order-level view (`PENDING` / `PAID` / `REFUNDED` / …) |
 * | `ticket_status`   | `OPEN` / `PENDING` / `IN_PROGRESS` / `RESOLVED` / `CLOSED` — new table, no stored history to reconcile |
 * | `user_status`     | **no column** — suspension currently overwrites `users.role` with `SUSPENDED` (Follow-up F3) |
 * | `seller_status`   | **no column** — `seller_profiles.verified` only (Follow-up F4) |
 */

/* -------------------------------------------------------------------------- *
 * Re-exported owners — import these, not the module behind them.
 * -------------------------------------------------------------------------- */

export { PRODUCT_STATUSES } from "./product-status";
export { PRODUCT_CONDITIONS, PRODUCT_MODES } from "./product-filters";
export { ORDER_STATUSES, ORDER_TYPES } from "./order-queries";
export { RENTAL_STATUSES } from "./rental-lifecycle";
export { ADMIN_PRODUCT_LISTING_TYPES } from "./admin-products";

/** Product condition. `USED` is a stored value the brief's list omits. */
export const PRODUCT_CONDITION_VALUES = PRODUCT_CONDITIONS;
/** Brief name. Maps to `products.listing_type` via `PRODUCT_MODE_TO_LISTING_TYPE`. */
export const BRIEF_PRODUCT_MODES = ["BUY", "RENT", "RENT_AND_BUY"] as const;

/**
 * The translation between the brief's `product_mode` and the column that
 * actually exists. Use this rather than writing `"BOTH"` at a call site and
 * hoping the reader knows it means "rent and buy".
 */
export const PRODUCT_MODE_TO_LISTING_TYPE = {
  BUY: "SALE",
  RENT: "RENT",
  RENT_AND_BUY: "BOTH",
} as const satisfies Record<(typeof BRIEF_PRODUCT_MODES)[number], (typeof ADMIN_PRODUCT_LISTING_TYPES)[number]>;

export type BriefProductMode = (typeof BRIEF_PRODUCT_MODES)[number];
export type ListingType = (typeof ADMIN_PRODUCT_LISTING_TYPES)[number];
/** What the brief calls a mode, in the words the database uses. */
export type StoredProductMode = ListingType;

/* -------------------------------------------------------------------------- *
 * Roles and account state.
 * -------------------------------------------------------------------------- */

/** `users.role`. Suspension is NOT in here — see `USER_STATUSES` below. */
export const USER_ROLES = ["USER", "SELLER", "ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * The brief's `user_status`.
 *
 * **There is no `users.status` column yet.** Suspension is stored by writing
 * `users.role = 'SUSPENDED'`, which overwrites the role the account actually
 * has — a suspended seller's seller-ness disappears from the data. That is a
 * real design debt, and it is listed as Follow-up F3 in `docs/database.md`
 * rather than fixed here, because adding the column without also changing the
 * two endpoints that suspend and unsuspend would leave two sources of truth
 * disagreeing. Exposed so the vocabulary is written down once.
 */
export const USER_STATUSES = ["ACTIVE", "SUSPENDED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** The brief's `seller_status`. No such column exists — see Follow-up F4. */
export const SELLER_STATUSES = ["PENDING", "ACTIVE", "RESTRICTED", "SUSPENDED"] as const;
export type SellerStatus = (typeof SELLER_STATUSES)[number];

/* -------------------------------------------------------------------------- *
 * Money, payment and ledger state.
 * -------------------------------------------------------------------------- */

/** `orders.payment_status` as stored today. */
export const ORDER_PAYMENT_STATUSES = ["PENDING", "PAID", "REFUNDED"] as const;
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number];

/**
 * `transactions.status`. This one already matches the brief's `payment_status`
 * exactly, which is why it is the vocabulary the payment layer is built on.
 */
export const TRANSACTION_STATUSES = [
  "PENDING",
  "PROCESSING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

/** `payment_webhook_events.status` — foundation table. */
export const PAYMENT_WEBHOOK_STATUSES = ["RECEIVED", "PROCESSED", "FAILED", "IGNORED"] as const;
export type PaymentWebhookStatus = (typeof PAYMENT_WEBHOOK_STATUSES)[number];

/** `stock_reservations.status` — foundation table. */
export const STOCK_RESERVATION_STATUSES = ["ACTIVE", "CONSUMED", "RELEASED", "EXPIRED"] as const;
export type StockReservationStatus = (typeof STOCK_RESERVATION_STATUSES)[number];

/** Who caused an `order_events` row. */
export const ACTOR_ROLES = ["USER", "SELLER", "ADMIN", "SYSTEM"] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];

/** `order_events.type` — foundation table. */
export const ORDER_EVENT_TYPES = ["CREATED", "STATUS_CHANGED", "NOTE_ADDED"] as const;
export type OrderEventType = (typeof ORDER_EVENT_TYPES)[number];

/* -------------------------------------------------------------------------- *
 * Moderation.
 * -------------------------------------------------------------------------- */

/**
 * `reviews.status` as stored. The brief's `PENDING | APPROVED | REJECTED`
 * describes a moderation flow this product does not have: reviews are published
 * on submission and hidden after the fact.
 */
export const REVIEW_STATUSES = ["PUBLISHED", "HIDDEN"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** `reports.status`. Matches the brief. */
export const REPORT_STATUSES = ["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/* -------------------------------------------------------------------------- *
 * RBAC, support and growth — the vocabularies of the admin tables.
 *
 * None of these are rewritten from anything: they are new tables with new
 * columns, so unlike the earlier ones there is no stored history to disagree
 * with. What *is* already stored is noted where it diverges below.
 * -------------------------------------------------------------------------- */

/**
 * The system roles in `roles.name`, seeded by `pnpm db:seed`.
 *
 * `USER` and `SELLER` are in the list so the coarse `users.role` value always
 * resolves to a row — the two vocabularies must cover the same ground or the
 * grant screen shows a role nobody can assign.
 */
export const SYSTEM_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "SUPPORT",
  "FINANCE",
  "MODERATOR",
  "CONTENT_MANAGER",
] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

/** Every role `roles.name` may hold: the system roles plus the two account kinds. */
export const ALL_ROLE_NAMES = [...SYSTEM_ROLES, "USER", "SELLER"] as const;
export type RoleName = (typeof ALL_ROLE_NAMES)[number];

/** Permission keys are `resource.action` — the shape `permissions` CHECKs for. */
export const PERMISSION_KEY_PATTERN = /^[a-z_]+\.[a-z_]+$/;

/** `support_tickets.status`. */
export const TICKET_STATUSES = [
  "OPEN",
  "PENDING",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** `support_tickets.priority`. Ordered, so the value's position is its weight. */
export const TICKET_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

/**
 * `refunds.status`.
 *
 * Matches the brief's `payment_status` exactly — this is the vocabulary the
 * payment layer already uses for `transactions.status`, so a refund and the
 * transaction it reverses can be read by the same code.
 */
export const REFUND_STATUSES = ["PENDING", "PROCESSING", "SUCCEEDED", "FAILED", "CANCELLED"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

/** `disputes.status`. */
export const DISPUTE_STATUSES = ["OPEN", "UNDER_REVIEW", "RESOLVED", "DISMISSED"] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

/** `cms_banners.status` and `cms_blocks.status` — one draft/active flow for both. */
export const CMS_STATUSES = ["DRAFT", "SCHEDULED", "ACTIVE", "PAUSED"] as const;
export type CmsStatus = (typeof CMS_STATUSES)[number];

/** Where a banner can appear. A value outside this list renders nothing. */
export const BANNER_PLACEMENTS = ["HERO", "CATEGORY_STRIP", "FOOTER"] as const;
export type BannerPlacement = (typeof BANNER_PLACEMENTS)[number];

/** `seller_verifications.status`. */
export const SELLER_VERIFICATION_STATUSES = [
  "PENDING",
  "VERIFIED",
  "REJECTED",
  "EXPIRED",
] as const;
export type SellerVerificationStatus = (typeof SELLER_VERIFICATION_STATUSES)[number];

/** Kinds of document a seller can submit. The document itself is never stored. */
export const VERIFICATION_DOCUMENT_TYPES = [
  "PAN",
  "GSTIN",
  "AADHAAR",
  "PASSPORT",
  "DRIVING_LICENCE",
] as const;
export type VerificationDocumentType = (typeof VERIFICATION_DOCUMENT_TYPES)[number];

/** `coupons.discount_type` — which meaning `discountValue` carries. */
export const DISCOUNT_TYPES = ["PERCENT", "FLAT"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

/** `coupons.applies_to`. */
export const COUPON_SCOPES = ["ALL", "CATEGORY", "PRODUCT"] as const;
export type CouponScope = (typeof COUPON_SCOPES)[number];

/** `commission_rules.scope` — a wider scope is consulted only when a narrower one is absent. */
export const COMMISSION_SCOPES = ["GLOBAL", "CATEGORY", "SELLER"] as const;
export type CommissionScope = (typeof COMMISSION_SCOPES)[number];

/** `export_jobs.status`. Same five states as a refund: a job is a request that either happened or did not. */
export const EXPORT_JOB_STATUSES = ["PENDING", "PROCESSING", "SUCCEEDED", "FAILED", "CANCELLED"] as const;
export type ExportJobStatus = (typeof EXPORT_JOB_STATUSES)[number];

/** What an `export_jobs` row is a request for. */
export const EXPORT_JOB_TYPES = [
  "ORDERS",
  "PAYOUTS",
  "AUDIT_LOG",
  "PRODUCTS",
  "TRANSACTIONS",
] as const;
export type ExportJobType = (typeof EXPORT_JOB_TYPES)[number];

/** `security_events.type`. Append-only — a new value is a new row, never an edit. */
export const SECURITY_EVENT_TYPES = [
  "LOGIN_SUCCESS",
  "LOGIN_FAILURE",
  "PASSWORD_CHANGED",
  "PASSWORD_RESET_REQUESTED",
  "MFA_ENABLED",
  "MFA_DISABLED",
  "MFA_CHALLENGE_PASSED",
  "MFA_CHALLENGE_FAILED",
  "RECOVERY_CODE_USED",
  "SESSION_REVOKED",
  "ROLE_GRANTED",
  "ROLE_REVOKED",
  "ACCOUNT_SUSPENDED",
  "ACCOUNT_UNSUSPENDED",
  "PERMISSION_DENIED",
] as const;
export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];

/** `login_attempts.failure_reason`. Never carries the password that failed. */
export const LOGIN_FAILURE_REASONS = [
  "bad_password",
  "no_such_user",
  "rate_limited",
  "mfa_required",
  "account_suspended",
  "account_unverified",
] as const;
export type LoginFailureReason = (typeof LOGIN_FAILURE_REASONS)[number];

/** Basis points: the only representation a percentage that touches money may take. */
export const PERCENT_BPS_MAX = 10_000;

/* -------------------------------------------------------------------------- *
 * Derived groups — reuse these instead of restating slices at call sites.
 * -------------------------------------------------------------------------- */

/** Statuses meaning "the renter is holding it, or it is due back". */
export const IN_HAND_RENTAL_STATUSES = IN_HAND_STATUSES;
/** Statuses meaning "this rental's story is over". */
export const CLOSED_RENTAL_STATUSES = CLOSED_STATUSES;
/** `orders.status` values that predate the current vocabulary. */
export const LEGACY_STATUSES = LEGACY_ORDER_STATUSES;

/* -------------------------------------------------------------------------- *
 * Zod — one validated shape per vocabulary.
 * -------------------------------------------------------------------------- */

export const userRoleSchema = z.enum(USER_ROLES);
export const userStatusSchema = z.enum(USER_STATUSES);
export const sellerStatusSchema = z.enum(SELLER_STATUSES);
export const productStatusSchema = z.enum(PRODUCT_STATUSES);
export const productConditionSchema = z.enum(PRODUCT_CONDITIONS);
export const productModeSchema = z.enum(BRIEF_PRODUCT_MODES);
export const listingTypeSchema = z.enum(ADMIN_PRODUCT_LISTING_TYPES);
export const orderStatusSchema = z.enum(ORDER_STATUSES);
export const orderTypeSchema = z.enum(ORDER_TYPES);
export const orderPaymentStatusSchema = z.enum(ORDER_PAYMENT_STATUSES);
export const transactionStatusSchema = z.enum(TRANSACTION_STATUSES);
export const rentalStatusSchema = z.enum(RENTAL_STATUSES);
export const reviewStatusSchema = z.enum(REVIEW_STATUSES);
export const reportStatusSchema = z.enum(REPORT_STATUSES);
export const paymentWebhookStatusSchema = z.enum(PAYMENT_WEBHOOK_STATUSES);
export const stockReservationStatusSchema = z.enum(STOCK_RESERVATION_STATUSES);
export const actorRoleSchema = z.enum(ACTOR_ROLES);
export const orderEventTypeSchema = z.enum(ORDER_EVENT_TYPES);
export const systemRoleSchema = z.enum(SYSTEM_ROLES);
export const roleNamesSchema = z.enum(ALL_ROLE_NAMES);
/** `resource.action`, the shape `permissions.key` CHECKs for at the database too. */
export const permissionKeySchema = z.string().min(3).max(64).regex(PERMISSION_KEY_PATTERN);
export const ticketStatusSchema = z.enum(TICKET_STATUSES);
export const ticketPrioritySchema = z.enum(TICKET_PRIORITIES);
export const refundStatusSchema = z.enum(REFUND_STATUSES);
export const disputeStatusSchema = z.enum(DISPUTE_STATUSES);
export const cmsStatusSchema = z.enum(CMS_STATUSES);
export const bannerPlacementSchema = z.enum(BANNER_PLACEMENTS);
export const sellerVerificationStatusSchema = z.enum(SELLER_VERIFICATION_STATUSES);
export const verificationDocumentTypeSchema = z.enum(VERIFICATION_DOCUMENT_TYPES);
export const discountTypeSchema = z.enum(DISCOUNT_TYPES);
export const couponScopeSchema = z.enum(COUPON_SCOPES);
export const commissionScopeSchema = z.enum(COMMISSION_SCOPES);
export const exportJobStatusSchema = z.enum(EXPORT_JOB_STATUSES);
export const exportJobTypeSchema = z.enum(EXPORT_JOB_TYPES);
export const securityEventTypeSchema = z.enum(SECURITY_EVENT_TYPES);
export const loginFailureReasonSchema = z.enum(LOGIN_FAILURE_REASONS);
/**
 * A percentage that touches money, in basis points: `100` is 1%.
 *
 * Uses `int()` rather than a float for the same reason everything else here
 * does — 0.1 + 0.2 is not 0.3, and a commission that says so ends up in a ledger.
 */
export const percentBpSchema = z.number().int().min(0).max(PERCENT_BPS_MAX);
/** Money as integer paise, always positive and always in whole units. */
export const paiseSchema = z.number().int().nonnegative();

export type UserStatusValue = z.infer<typeof userStatusSchema>;
export type Paise = z.infer<typeof paiseSchema>;
