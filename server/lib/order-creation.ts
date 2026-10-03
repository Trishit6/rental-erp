import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  cartItems,
  carts,
  notifications,
  orderItems,
  orders,
  products,
  rentals,
  transactions,
} from "../schema";
import { HttpError } from "./api";
import { buildCheckoutQuote, type DeliveryMethod } from "./checkout";
import { createOrderNumber } from "./payments/order-number";
import { readCheckoutContext } from "./payments/checkout-context";
import { recordRentalEvent } from "./rental-lifecycle";
import { adjustProductInventory } from "./product-inventory";
import type { PaymentMethod, PaymentStatus } from "./payments/types";

/**
 * Order creation from a verified payment.
 *
 * The single place an order comes into existence. Two invariants drive the
 * whole design:
 *
 *  1. **Nothing here is trusted from the browser.** No amount, product price,
 *     seller id or user id arrives from the client. The user id is the session;
 *     everything else is re-read from the cart and the products rows.
 *
 *  2. **One checkout produces at most one order.** A repeated call with the
 *     same idempotency key returns the order that already exists. That covers
 *     double-clicked Pay buttons, client retries, and a provider webhook
 *     arriving after the browser already got its answer.
 *
 * The payment/order split is deliberate. Verification commits *first* and
 * records the provider reference; order creation commits *second*. If the
 * second step fails, the money is still accounted for in a `PROCESSING`
 * transaction row and a retry (or the webhook) completes it. The reverse
 * ordering would leave a customer charged with nothing to show for it, which is
 * exactly the failure this structure exists to prevent.
 */

export type CreateOrderInput = {
  /** From the session, never from the request body. */
  userId: number;
  /** The transaction this order is settling. Must already be verified. */
  transactionId: number;
  deliveryMethod: DeliveryMethod;
  deliveryAddressId: number | null;
};

export type OrderConfirmation = {
  orderId: number;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  total: number;
  currency: string;
  rentalCount: number;
  /** True when this call created the order, false when it returned an existing one. */
  created: boolean;
};

/** Event types reserved for the future notification system. */
export const ORDER_EVENTS = {
  PAYMENT_SUCCEEDED: "PAYMENT_SUCCEEDED",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  ORDER_CREATED: "ORDER_CREATED",
  ORDER_CANCELLED: "ORDER_CANCELLED",
} as const;

/** Reserved context the intent stored so a webhook can finish the job. */
export {
  readCheckoutContext,
  serializeCheckoutMetadata,
  type CheckoutContext,
} from "./payments/checkout-context";

export async function createOrderFromPayment(input: CreateOrderInput): Promise<OrderConfirmation> {
  return db.transaction(async (tx) => {
    /* --- 1. Lock the transaction row; re-read it, never trust the caller --- */
    const [transaction] = await tx
      .select()
      .from(transactions)
      .where(eq(transactions.id, input.transactionId))
      .limit(1)
      .for("update");

    if (!transaction) throw new HttpError(404, "NOT_FOUND", "Payment not found.");
    // Ownership check: a payment id is not an authorisation.
    if (transaction.userId !== input.userId) {
      throw new HttpError(403, "FORBIDDEN", "You do not have access to this payment.");
    }

    /* --- 2. Already settled → return the existing order, create nothing --- */
    if (transaction.orderId !== null) {
      const [existing] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, transaction.orderId))
        .limit(1);
      if (existing) {
        return {
          orderId: existing.id,
          orderNumber: existing.orderNumber ?? `#${existing.id}`,
          status: existing.status,
          paymentStatus: existing.paymentStatus,
          total: existing.total,
          currency: existing.currency,
          rentalCount: 0,
          created: false,
        };
      }
    }

    if (transaction.status !== "PROCESSING") {
      throw new HttpError(409, "PAYMENT_NOT_VERIFIED", "This payment has not been verified yet.");
    }

    /* --- 3. Lock the products, in a stable order, before reading them ------ */
    const [cart] = await tx
      .select({ id: carts.id })
      .from(carts)
      .where(eq(carts.userId, input.userId))
      .limit(1);
    if (!cart) throw new HttpError(400, "EMPTY_CART", "Your cart is empty.");

    const lineRows = await tx
      .select({ productId: cartItems.productId })
      .from(cartItems)
      .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.savedForLater, false)));

    const productIds = [...new Set(lineRows.map((r) => r.productId))].sort((a, b) => a - b);

    if (productIds.length === 0) {
      throw new HttpError(400, "EMPTY_CART", "Your cart is empty.");
    }

    // Locking in ascending id order means two checkouts touching the same
    // products take their locks in the same sequence, so they queue instead of
    // deadlocking.
    await tx
      .select({ id: products.id })
      .from(products)
      .where(inArray(products.id, productIds))
      .orderBy(products.id)
      .for("update");

    /* --- 4. Recompute the amount and re-validate, inside the transaction --- */
    const quote = await buildCheckoutQuote({
      userId: input.userId,
      deliveryMethod: input.deliveryMethod,
      deliveryAddressId: input.deliveryAddressId,
      executor: tx,
    });

    if (!quote.isPayable) {
      throw new HttpError(
        409,
        "CART_UNAVAILABLE",
        "Your cart changed and can no longer be paid for. Please review it.",
      );
    }

    // The amount the customer agreed to vs. the amount the cart is worth right
    // now. Charging the second one silently would be a price change the
    // customer never consented to, so this is a conflict that sends them back
    // to review rather than a mismatch we paper over.
    if (quote.breakdown.grandTotal !== transaction.amount) {
      throw new HttpError(
        409,
        "PAYMENT_AMOUNT_CHANGED",
        "The payment amount has changed. Please review your checkout again.",
      );
    }

    const { breakdown, lines } = quote;
    const hasRental = lines.some((l) => l.mode === "RENT");
    const hasPurchase = lines.some((l) => l.mode === "BUY");

    /* --- 5. The order, with the payment already confirmed ------------------ */
    // 30 bits of entropy makes a duplicate order number unlikely, not
    // impossible, and the column is uniquely indexed — so retry rather than
    // assume it away. Only a duplicate is retried; a FK or lock failure must
    // surface immediately.
    let orderId = 0;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const [inserted] = await tx
          .insert(orders)
          .values({
            userId: input.userId,
            orderType: hasRental && hasPurchase ? "MIXED" : hasRental ? "RENTAL" : "PURCHASE",
            // Fulfillment state. `paymentStatus` is PAID, so this starts at
            // CONFIRMED rather than PENDING_PAYMENT — there is no unpaid order
            // to reconcile.
            status: "CONFIRMED",
            paymentStatus: "PAID",
            subtotal: breakdown.subtotal,
            deliveryFee: breakdown.deliveryFee,
            depositTotal: breakdown.securityDeposit,
            discount: breakdown.discount,
            tax: breakdown.tax,
            total: breakdown.grandTotal,
            currency: breakdown.currency,
            deliveryMethod: input.deliveryMethod,
            deliveryAddressId: quote.deliveryAddressId,
            deliveryAddressSnapshot: quote.deliveryAddress
              ? JSON.stringify(quote.deliveryAddress)
              : null,
            paymentProvider: transaction.provider,
            paymentReference: transaction.providerTransactionId,
            orderNumber: createOrderNumber(),
          })
          .$returningId();
        orderId = Number(inserted.id);
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isDuplicate = message.includes("Duplicate") || message.includes("duplicate");
        if (!isDuplicate || attempt === 4) throw error;
      }
    }
    if (orderId === 0) {
      throw new HttpError(500, "INTERNAL_ERROR", "Could not allocate an order number.");
    }

    /* --- 6. Order items, each a snapshot of the product as bought --------- */
    const [insertedItems] = await tx
      .insert(orderItems)
      .values(
        lines.map((line) => ({
          orderId,
          productId: line.productId,
          sellerId: line.sellerId,
          mode: line.mode,
          quantity: line.quantity,
          unitPrice: line.pricing.unitPrice,
          rentalCharge: line.pricing.rentalCharge,
          securityDeposit: line.pricing.depositTotal,
          lineTotal: line.pricing.lineTotal,
          titleSnapshot: line.title.slice(0, 120),
          imageSnapshot: line.imageUrl,
          startDate: line.startDate ? new Date(line.startDate) : null,
          endDate: line.endDate ? new Date(line.endDate) : null,
          rentalDays: line.rentalDays,
        })),
      )
      .$returningId();

    const insertedIds = Array.isArray(insertedItems)
      ? insertedItems.map((r) => Number(r.id))
      : [Number(insertedItems.id)];

    /* --- 7. Rentals for the rental lines ----------------------------------- */
    if (hasRental) {
      const [createdRentals] = await tx
        .insert(rentals)
        .values(
          lines
            .map((line, index) => ({ line, orderItemId: insertedIds[index] }))
            .filter(
              (entry) => entry.line.mode === "RENT" && entry.line.startDate && entry.line.endDate,
            )
            .map(({ line, orderItemId }) => ({
              orderId,
              orderItemId,
              productId: line.productId,
              renterId: input.userId,
              ownerId: line.sellerId,
              startDate: new Date(line.startDate as string),
              endDate: new Date(line.endDate as string),
              dailyRate: line.pricing.unitPrice,
              rentalSubtotal: line.pricing.rentalCharge,
              securityDeposit: line.pricing.depositTotal,
              // Delivery is an order-level charge; repeating it per rental line
              // would double-count it in the rental view.
              deliveryFee: 0,
              total: line.pricing.rentalCharge + line.pricing.depositTotal,
              status: "CONFIRMED",
            })),
        )
        .$returningId();

      // The rental's first recorded step, in the same transaction as the rental
      // itself — so a rental can never exist without its history saying so.
      // Normalised because `$returningId()` is typed as a single row for a
      // single-value insert and an array for a multi-row one.
      const createdIds = (Array.isArray(createdRentals) ? createdRentals : [createdRentals]).map(
        (row) => Number(row.id),
      );
      for (const rentalId of createdIds) {
        await recordRentalEvent(tx, rentalId, "CONFIRMED", { orderId });
      }
    }

    /* --- 8. Availability. Purchases decrement stock; rentals do not. ------- */
    // A rental must NOT decrement stock permanently — its unit is held for a
    // date window by the `rentals` row, and the availability engine reads that.
    // Permanently decrementing here would make the listing unsellable for dates
    // the customer never booked.
    //
    // The helper (rather than an inline `available_quantity - n`) exists because
    // the derived status has to be spelled correctly in every writer: this one
    // used to write `'SOLD'`, which is not in `PRODUCT_STATUSES`, so buying the
    // last unit made the listing disappear from every public query. It also
    // clamps, so a replayed order can never drive availability below zero.
    for (const line of lines) {
      if (line.mode !== "BUY") continue;
      await adjustProductInventory(tx, line.productId, -line.quantity);
    }

    /* --- 9. Close out the payment and clear the purchased cart lines ------- */
    await tx
      .update(transactions)
      .set({
        orderId,
        status: "SUCCEEDED",
        failureReason: null,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, transaction.id));

    // Only the lines that were paid for. Anything saved for later, and anything
    // added after the quote was taken, stays in the cart.
    await tx.delete(cartItems).where(
      inArray(
        cartItems.id,
        lines.map((l) => l.cartItemId),
      ),
    );

    /* --- 10. Seller notifications ------------------------------------------ */
    const sellerIds = [...new Set(lines.map((l) => l.sellerId))];
    if (sellerIds.length > 0) {
      await tx.insert(notifications).values(
        sellerIds.map((sellerId) => ({
          userId: sellerId,
          type: "ORDER_NEW",
          title: "New order received",
          body: `A customer just bought from your listings on Revaro.`,
          link: "/dashboard/orders",
        })),
      );
    }

    const [created] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);

    return {
      orderId,
      orderNumber: created?.orderNumber ?? `#${orderId}`,
      status: created?.status ?? "CONFIRMED",
      paymentStatus: created?.paymentStatus ?? "PAID",
      total: breakdown.grandTotal,
      currency: breakdown.currency,
      rentalCount: hasRental ? lines.filter((l) => l.mode === "RENT").length : 0,
      created: true,
    };
  });
}

/**
 * The outcome of reconciling a provider event against a transaction.
 *
 * A discriminated result rather than a nullable order, because "nothing to do"
 * and "something is wrong" are very different situations that a null would
 * collapse into one.
 */
export type ReconcileOutcome =
  | { outcome: "ORDERED"; orderId: number }
  /** A previous event already created the order. */
  | { outcome: "ALREADY_HANDLED"; orderId: number }
  /** Nothing to do: unknown payment, or the event is not a settlement. */
  | { outcome: "NOT_APPLICABLE" }
  /**
   * The payment moved but cannot be turned into an order — the amounts
   * disagree, or the checkout context is gone. Recorded on the transaction and
   * surfaced, but never papered over by inventing an order.
   */
  | { outcome: "REVIEW_NEEDED"; reason: string };

/**
 * Reconcile a transaction the provider says settled, without the browser.
 *
 * This is the path a real provider takes: the customer pays, closes the tab,
 * and the order appears some seconds later off the back of a webhook. It has to
 * work on a payment the browser never confirmed, so it accepts a `PENDING`
 * transaction and drives it to `PROCESSING` itself — the provider, not the
 * browser, is the authority on whether money moved.
 */
export async function reconcileSettledTransaction(params: {
  transactionId: number;
  providerStatus: PaymentStatus;
  /** Amount the provider reports moving, in paise. */
  providerAmount: number;
  paymentMethod: PaymentMethod;
}): Promise<ReconcileOutcome> {
  if (params.providerStatus !== "SUCCEEDED") return { outcome: "NOT_APPLICABLE" };

  const [transaction] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, params.transactionId))
    .limit(1);

  if (!transaction) return { outcome: "NOT_APPLICABLE" };
  if (transaction.orderId !== null) {
    return { outcome: "ALREADY_HANDLED", orderId: transaction.orderId };
  }
  if (transaction.status !== "PENDING" && transaction.status !== "PROCESSING") {
    // Cancelled, failed or refunded: a late success event must not resurrect it.
    return { outcome: "NOT_APPLICABLE" };
  }

  // The provider's amount is the authority on what money moved. If it does not
  // match what we reserved, something is wrong that a refund policy — not an
  // order — should decide.
  if (params.providerAmount !== transaction.amount) {
    const reason = "Settled amount does not match the payment. Manual review required.";
    await db
      .update(transactions)
      .set({ status: "FAILED", failureReason: reason, updatedAt: new Date() })
      .where(eq(transactions.id, transaction.id));
    return { outcome: "REVIEW_NEEDED", reason };
  }

  const context = readCheckoutContext(transaction.metadata);
  if (!context) {
    const reason = "This payment is missing its checkout details. Manual review required.";
    await db
      .update(transactions)
      .set({ status: "FAILED", failureReason: reason, updatedAt: new Date() })
      .where(eq(transactions.id, transaction.id));
    return { outcome: "REVIEW_NEEDED", reason };
  }

  // Move it to PROCESSING before ordering: the provider has settled it, and
  // `createOrderFromPayment` only acts on a verified (PROCESSING) payment.
  if (transaction.status === "PENDING") {
    await db
      .update(transactions)
      .set({
        status: "PROCESSING",
        paymentMethod: params.paymentMethod ?? transaction.paymentMethod,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, transaction.id));
  }

  const confirmation = await createOrderFromPayment({
    userId: transaction.userId,
    transactionId: transaction.id,
    deliveryMethod: context.deliveryMethod,
    deliveryAddressId: context.deliveryAddressId,
  });

  return { outcome: "ORDERED", orderId: confirmation.orderId };
}
