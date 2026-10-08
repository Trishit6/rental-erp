import { z } from "zod";
import {
  actorRoleSchema,
  orderEventTypeSchema,
  orderStatusSchema,
  paymentWebhookStatusSchema,
  stockReservationStatusSchema,
} from "./lib/enums";

/**
 * Zod schemas for the foundation tables in `server/schema.ts`.
 *
 * ## Why these are hand-written
 *
 * `drizzle-zod` would generate all of them from the table definitions, and it
 * is not a dependency here. Hand-writing only what a writer actually needs
 * keeps the schemas small; the cost is that they must be kept in step with the
 * columns by hand, which is what `tests/db-foundation-schemas.test.ts` checks
 * on every run.
 *
 * ## Why read types are still `$inferSelect`
 *
 * A Zod schema is for *validating input at the boundary*. For reading rows,
 * `typeof orderEvents.$inferSelect` in `server/schema.ts` is strictly better —
 * it cannot drift from the table and it is free. `select` schemas below exist
 * only where a row is about to leave the process as JSON (an API response),
 * where an actual boundary does exist.
 *
 * ## Fields that are deliberately absent from insert schemas
 *
 * `id`, `createdAt` and `updatedAt` are server-managed. Letting a client
 * supply them is how timestamps and identity get forged.
 */

const idSchema = z.number().int().positive();
const timestampSchema = z.date().or(z.string().datetime());

/* --------------------------------- order events ---------------------------- */

export const orderEventInsertSchema = z.object({
  orderId: idSchema,
  /** The brief requires one of `ORDER_EVENT_TYPES`; stored as varchar. */
  type: orderEventTypeSchema,
  fromStatus: orderStatusSchema.nullish(),
  toStatus: orderStatusSchema,
  actorId: idSchema.nullish(),
  actorRole: actorRoleSchema.nullish(),
  note: z.string().trim().max(300).nullish(),
  /** Safe JSON context, serialised on write. Never secrets. */
  metadata: z.record(z.unknown()).nullish(),
  /** Once-and-only-once key; `null` for a one-off write. */
  eventKey: z.string().min(1).max(190).nullish(),
});

export const orderEventSelectSchema = orderEventInsertSchema.extend({
  id: idSchema,
  createdAt: timestampSchema,
});

/* ------------------------------ stock reservations ------------------------- */

export const stockReservationInsertSchema = z
  .object({
    productId: idSchema,
    userId: idSchema,
    orderId: idSchema.nullish(),
    quantity: z.number().int().positive().default(1),
    rentalStart: timestampSchema.nullish(),
    rentalEnd: timestampSchema.nullish(),
    expiresAt: timestampSchema,
    status: stockReservationStatusSchema.default("ACTIVE"),
  })
  .refine(
    (value) =>
      value.rentalStart == null || value.rentalEnd == null || value.rentalEnd > value.rentalStart,
    { message: "rentalEnd must be after rentalStart", path: ["rentalEnd"] },
  );

export const stockReservationSelectSchema = z.object({
  id: idSchema,
  productId: idSchema,
  userId: idSchema,
  orderId: idSchema.nullable(),
  quantity: z.number().int().positive(),
  rentalStart: timestampSchema.nullable(),
  rentalEnd: timestampSchema.nullable(),
  expiresAt: timestampSchema,
  status: stockReservationStatusSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

/* ------------------------------- idempotency keys -------------------------- */

export const idempotencyKeyInsertSchema = z.object({
  /** `order.create` | `payment.create` | … */
  scope: z.string().min(1).max(40),
  key: z.string().min(1).max(120),
  userId: idSchema.nullish(),
  /** SHA-256 of the normalised request body. */
  requestHash: z.string().length(64),
  statusCode: z.number().int().nullish(),
  responseBody: z.string().nullish(),
  expiresAt: timestampSchema,
});

export const idempotencyKeySelectSchema = z.object({
  id: idSchema,
  scope: z.string(),
  key: z.string(),
  userId: idSchema.nullable(),
  requestHash: z.string(),
  statusCode: z.number().int().nullable(),
  responseBody: z.string().nullable(),
  createdAt: timestampSchema,
  expiresAt: timestampSchema,
});

/* --------------------------- payment webhook events ------------------------ */

export const paymentWebhookEventInsertSchema = z.object({
  provider: z.string().min(1).max(20),
  providerEventId: z.string().min(1).max(160),
  eventType: z.string().min(1).max(60),
  /** Raw body exactly as received. Must never hold a PAN, CVV or secret. */
  payload: z.string(),
  signatureVerified: z.boolean().default(false),
  status: paymentWebhookStatusSchema.default("RECEIVED"),
  errorMessage: z.string().max(300).nullish(),
  processedAt: timestampSchema.nullish(),
});

export const paymentWebhookEventSelectSchema = z.object({
  id: idSchema,
  provider: z.string(),
  providerEventId: z.string(),
  eventType: z.string(),
  payload: z.string(),
  signatureVerified: z.boolean(),
  status: paymentWebhookStatusSchema,
  errorMessage: z.string().nullable(),
  processedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

/* ------------------------------ platform settings -------------------------- */

/**
 * `value` is a JSON document whose shape belongs to whichever feature reads the
 * key, so it is validated as *structured* rather than *known*: a string is
 * never a valid setting, but no key in this table can declare a schema yet.
 */
export const platformSettingValueSchema = z.union([
  z.record(z.unknown()),
  z.array(z.unknown()),
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const platformSettingInsertSchema = z.object({
  key: z.string().min(1).max(80),
  value: platformSettingValueSchema,
  description: z.string().max(200).nullish(),
  updatedBy: idSchema.nullish(),
});

export const platformSettingSelectSchema = z.object({
  key: z.string(),
  value: platformSettingValueSchema,
  description: z.string().nullable(),
  updatedBy: idSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

/* -------------------------------- search history --------------------------- */

export const searchHistoryInsertSchema = z.object({
  userId: idSchema,
  /** Repeating a term is an upsert, not a second row (see the table). */
  term: z.string().trim().min(1).max(120),
  resultCount: z.number().int().nonnegative().nullish(),
});

export const searchHistorySelectSchema = z.object({
  id: idSchema,
  userId: idSchema,
  term: z.string(),
  resultCount: z.number().int().nullable(),
  createdAt: timestampSchema,
});
