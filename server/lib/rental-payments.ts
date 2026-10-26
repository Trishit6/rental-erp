import { and, eq, inArray, like, lt } from "drizzle-orm";
import { db } from "../db";
import { platformSettings, products, rentalEvents, rentals, orders, transactions } from "../schema";
import { HttpError } from "./api";
import { serializeCheckoutMetadata } from "./payments/checkout-context";
import { getPaymentProvider } from "./payments";
import { notificationEventKey } from "./notification-events";
import { notify } from "./notifications";
import { recordRentalEvent } from "./rental-lifecycle";
import { canApproveExtension } from "./rental-lifecycle";
import {
  EXTENSION_APPROVAL_TTL_MS,
  extensionCharge,
  extensionTax,
  type ExtensionPlan,
} from "./rental-extension";
import { evaluateRentToOwnBuy, computeRentToOwnCredit } from "./rent-to-own";
import { assertRentalAvailability } from "./rental-availability";
import { effectiveDailyRate, rentalDays } from "../../src/lib/pricing";

/**
 * The rental money service.
 *
 * ## What lives here
 *
 * The *front half* of the two rental money paths — opening a payment for a
 * buy-out or an extension — and the sweep that lets an unpaid extension approval
 * lapse. The back half (turning a verified payment into an order or an extended
 * date) lives in `order-creation.ts`, where every order is still created, so
 * there is one writer for orders and one place settlement dispatches from.
 *
 * ## Why create an intent at all
 *
 * Both actions move money, and the app's rule is that money moves through the
 * payment pipeline: a `transactions` row is written first, a provider confirms
 * the amount, and only then does anything of value change. A buy-out that wrote
 * `PAID` directly, or an approved extension that just moved the end date, would
 * be a second, unchecked way to move money — exactly what this module replaces.
 */

/** Where an operator sets the platform's tax rate (PROMPT R7 will own it). */
const TAX_SETTING_KEY = "tax.percent";

async function readTaxPercent(executor: Pick<typeof db, "select"> = db): Promise<number | null> {
  const [row] = await executor
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, TAX_SETTING_KEY))
    .limit(1);
  const value = row?.value;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export type RentalPaymentIntent = {
  transactionId: number;
  provider: string;
  providerPaymentId: string | null;
  amount: number;
  currency: string;
  status: string;
  isProductionReady: boolean;
  /** The rent credit applied, for a buy-out. */
  credit?: number;
  /** The extra-days quote, for an extension. */
  extension?: ExtensionPlan;
};

/**
 * Open a payment for a rent-to-own buy-out.
 *
 * Every precondition the settlement will re-check is checked here too, so an
 * impossible purchase fails before a payment attempt exists rather than leaving a
 * stranded transaction. The amount stored is the server's own arithmetic; the
 * request cannot influence it.
 */
export async function startRentalBuy(input: {
  userId: number;
  rentalId: number;
  idempotencyKey: string;
}): Promise<RentalPaymentIntent> {
  const [rental] = await db
    .select()
    .from(rentals)
    .where(and(eq(rentals.id, input.rentalId), eq(rentals.renterId, input.userId)))
    .limit(1);
  if (!rental) throw new HttpError(404, "NOT_FOUND", "Rental not found.");

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, rental.productId))
    .limit(1);
  if (!product) throw new HttpError(404, "NOT_FOUND", "Product not found.");

  // A retried request (a double-click, a network retry) must answer with the
  // intent that already exists rather than evaluating a purchase that has just
  // happened and refusing it. Checked before the state gates for that reason.
  const existing = await findIntentByKey(input.userId, input.idempotencyKey);
  if (existing) {
    const credit = computeRentToOwnCredit(product, { rentalSubtotal: rental.rentalSubtotal });
    return { ...existing, credit };
  }

  const [alreadyPurchased] = await db
    .select({ id: rentalEvents.id })
    .from(rentalEvents)
    .where(and(eq(rentalEvents.rentalId, rental.id), eq(rentalEvents.type, "PURCHASED")))
    .limit(1);

  const evaluation = evaluateRentToOwnBuy({
    rentalStatus: rental.status,
    alreadyPurchased: Boolean(alreadyPurchased),
    product: {
      purchasePrice: product.purchasePrice,
      rentCreditPercentage: product.rentCreditPercentage,
      rentCreditCap: product.rentCreditCap,
      rentToOwnEnabled: product.rentToOwnEnabled,
      availableQuantity: product.availableQuantity,
    },
    rental: { rentalSubtotal: rental.rentalSubtotal },
  });
  if (!evaluation.ok) {
    throw new HttpError(evaluation.status, evaluation.code, evaluation.message);
  }
  const { purchasePrice, credit, price } = evaluation.price;

  // Rentals carry no currency of their own; the order that created them is the
  // single source for it.
  const [order] = await db
    .select({ currency: orders.currency })
    .from(orders)
    .where(eq(orders.id, rental.orderId))
    .limit(1);
  const currency = order?.currency ?? "INR";

  const provider = getPaymentProvider();
  const intent = await provider.createIntent({
    amount: price,
    currency,
    idempotencyKey: input.idempotencyKey,
    metadata: { userId: String(input.userId), rentalId: String(rental.id) },
  });

  const [inserted] = await db
    .insert(transactions)
    .values({
      userId: input.userId,
      type: "PAYMENT",
      amount: price,
      currency: intent.currency,
      status: "PENDING",
      provider: provider.name,
      providerTransactionId: intent.providerPaymentId,
      providerIdempotencyKey: input.idempotencyKey,
      idempotencyKey: input.idempotencyKey,
      metadata: serializeCheckoutMetadata(
        {
          purpose: "RENTAL_BUY",
          deliveryMethod: "PICKUP",
          deliveryAddressId: null,
          couponCode: null,
          rentalId: rental.id,
        },
        ["PAYMENT_SUCCEEDED"],
        { rentToOwn: { purchasePrice, credit, price } },
      ),
    })
    .$returningId();

  return {
    transactionId: Number(inserted.id),
    provider: provider.name,
    providerPaymentId: intent.providerPaymentId,
    amount: intent.amount,
    currency: intent.currency,
    status: intent.status,
    isProductionReady: provider.isProductionReady,
    credit,
  };
}

/**
 * Open a payment for the extra days an approved extension adds.
 *
 * Called by whoever approves — the owner or an admin — but always *for the
 * renter*: the transaction belongs to the person who owes the money. The end date
 * is deliberately untouched here; only `settleRentalExtensionPayment` moves it,
 * after this payment is verified.
 */
export async function startRentalExtensionPayment(input: {
  rentalId: number;
  days: number;
  taxPercent?: number | null;
}): Promise<RentalPaymentIntent> {
  const [rental] = await db
    .select()
    .from(rentals)
    .where(eq(rentals.id, input.rentalId))
    .limit(1);
  if (!rental) throw new HttpError(404, "NOT_FOUND", "Rental not found.");

  // One payment per request cycle. The request's timestamp is part of the key, so
  // a lapsed approval followed by a fresh request opens a new payment instead of
  // colliding on the old, cancelled one — while a retried approval of the *same*
  // request reuses its intent.
  const key = `rental-extension:${rental.id}:${
    rental.extensionRequestedAt ? rental.extensionRequestedAt.getTime() : 0
  }`;
  const existing = await findIntentByKey(rental.renterId, key);
  if (existing) return existing;

  if (!canApproveExtension(rental)) {
    throw new HttpError(409, "NO_REQUEST", "There is no pending extension request on this rental.");
  }

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, rental.productId))
    .limit(1);
  if (!product) throw new HttpError(404, "NOT_FOUND", "Product not found.");

  const currentDays = rentalDays({ startDate: rental.startDate, endDate: rental.endDate });
  const newDays = currentDays + input.days;
  if (product.maximumRentalDays && newDays > product.maximumRentalDays) {
    throw new HttpError(
      409,
      "EXTENSION_TOO_LONG",
      `This item can be rented for at most ${product.maximumRentalDays} days in total.`,
    );
  }

  const newEndDate = addDaysUtc(rental.endDate, input.days);
  await assertRentalAvailability(rental.productId, 1, rental.startDate, newEndDate, rental.id);

  const [order] = await db
    .select({ currency: orders.currency })
    .from(orders)
    .where(eq(orders.id, rental.orderId))
    .limit(1);
  const currency = order?.currency ?? "INR";

  const oldRate = effectiveDailyRate(product, currentDays);
  const newRate = effectiveDailyRate(product, newDays);
  const charge = extensionCharge({ oldRate, newRate, currentDays, newDays });
  const taxPercent = input.taxPercent ?? (await readTaxPercent());
  const tax = extensionTax(charge, taxPercent);
  const total = charge + tax;

  const plan: ExtensionPlan = {
    additionalDays: input.days,
    previousEndDate: rental.endDate.toISOString(),
    newEndDate: newEndDate.toISOString(),
    charge,
    tax,
    total,
    currency,
  };

  const provider = getPaymentProvider();
  const intent = await provider.createIntent({
    amount: total,
    currency: plan.currency,
    idempotencyKey: key,
    metadata: { userId: String(rental.renterId), rentalId: String(rental.id) },
  });

  const [inserted] = await db
    .insert(transactions)
    .values({
      userId: rental.renterId,
      type: "PAYMENT",
      amount: total,
      currency: intent.currency,
      status: "PENDING",
      provider: provider.name,
      providerTransactionId: intent.providerPaymentId,
      providerIdempotencyKey: key,
      idempotencyKey: key,
      metadata: serializeCheckoutMetadata(
        {
          purpose: "RENTAL_EXTENSION",
          deliveryMethod: "PICKUP",
          deliveryAddressId: null,
          couponCode: null,
          rentalId: rental.id,
        },
        ["PAYMENT_SUCCEEDED"],
        { extension: plan },
      ),
    })
    .$returningId();

  return {
    transactionId: Number(inserted.id),
    provider: provider.name,
    providerPaymentId: intent.providerPaymentId,
    amount: intent.amount,
    currency: intent.currency,
    status: intent.status,
    isProductionReady: provider.isProductionReady,
    extension: plan,
  };
}

async function findIntentByKey(
  userId: number,
  idempotencyKey: string,
): Promise<RentalPaymentIntent | null> {
  const [existing] = await db
    .select()
    .from(transactions)
    .where(
      and(eq(transactions.userId, userId), eq(transactions.idempotencyKey, idempotencyKey)),
    )
    .limit(1);
  if (!existing) return null;
  return {
    transactionId: existing.id,
    provider: existing.provider,
    providerPaymentId: existing.providerTransactionId,
    amount: existing.amount,
    currency: existing.currency,
    status: existing.status,
    isProductionReady: getPaymentProvider().isProductionReady,
  };
}

/** The marker `serializeCheckoutMetadata` writes for an extension intent. */
const EXTENSION_PURPOSE_MARKER = '%"purpose":"RENTAL_EXTENSION"%';

/**
 * Lapse extension approvals that were never paid, and tell both parties.
 *
 * There is no scheduler in this app, so this runs opportunistically wherever the
 * rentals are read — the same shape as `reconcileRentalStatuses`. An approval is
 * identified by its unpaid payment intent, not by a rental column, because no
 * schema was added for it: the transaction's own `created_at` is the clock.
 *
 * Bounded and idempotent: only transactions still `PENDING`/`PROCESSING` older
 * than the TTL are touched, and marking one `CANCELLED` is what stops it being
 * selected again.
 */
export async function expireStaleExtensionApprovals(
  executor: Pick<typeof db, "select" | "update" | "insert"> = db,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - EXTENSION_APPROVAL_TTL_MS);
  const stale = await executor
    .select({
      id: transactions.id,
      userId: transactions.userId,
      metadata: transactions.metadata,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.type, "PAYMENT"),
        inArray(transactions.status, ["PENDING", "PROCESSING"]),
        like(transactions.metadata, EXTENSION_PURPOSE_MARKER),
        lt(transactions.createdAt, cutoff),
      ),
    )
    .limit(100);

  let expired = 0;
  for (const row of stale) {
    const rentalId = readRentalIdFromMetadata(row.metadata);
    if (!rentalId) continue;

    await executor
      .update(transactions)
      .set({
        status: "CANCELLED",
        failureReason: "Extension approval expired before payment.",
        updatedAt: now,
      })
      .where(eq(transactions.id, row.id));

    const [rental] = await executor
      .select({
        id: rentals.id,
        status: rentals.status,
        renterId: rentals.renterId,
        ownerId: rentals.ownerId,
        productId: rentals.productId,
      })
      .from(rentals)
      .where(eq(rentals.id, rentalId))
      .limit(1);
    if (!rental) continue;

    await executor
      .update(rentals)
      .set({ extensionRequestedAt: null, extensionRequestedDays: null, updatedAt: now })
      .where(eq(rentals.id, rental.id));

    await recordRentalEvent(executor, rental.id, "EXTENSION_EXPIRED", {
      transactionId: row.id,
    });

    const context = { rentalId: rental.id, productId: rental.productId };
    await notify(executor, {
      userId: rental.renterId,
      type: "RENTAL_EXTENSION_DECIDED",
      title: "Extension request expired",
      body: "Your approved extension was not paid for in time, so it has lapsed.",
      context,
      eventKey: notificationEventKey("RENTAL_EXTENSION_DECIDED", rental.id, `expired:${row.id}`),
    });
    if (rental.ownerId !== rental.renterId) {
      await notify(executor, {
        userId: rental.ownerId,
        type: "RENTAL_EXTENSION_DECIDED",
        title: "An extension expired",
        body: "An approved extension on your item was not paid for in time.",
        context,
        eventKey: notificationEventKey(
          "RENTAL_EXTENSION_DECIDED",
          rental.id,
          `expired-owner:${row.id}`,
        ),
        link: "/dashboard/rentals",
      });
    }
    expired += 1;
  }
  return expired;
}

function readRentalIdFromMetadata(metadata: string | null): number | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata) as { checkout?: { rentalId?: unknown } };
    const value = parsed.checkout?.rentalId;
    return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * Add whole days to a timestamp without mutating it.
 *
 * Kept local and UTC-based: an extension is a number of days, and going through
 * local time would let a DST change shift a return date.
 */
function addDaysUtc(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
