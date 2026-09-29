import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { orders, transactions } from "../schema";
import { HttpError, ok } from "../lib/api";
import { requireUser } from "../lib/auth";
import { buildCheckoutQuote, CURRENCY } from "../lib/checkout";
import {
  createOrderFromPayment,
  ORDER_EVENTS,
  reconcileSettledTransaction,
} from "../lib/order-creation";
import { readCheckoutContext, serializeCheckoutMetadata } from "../lib/payments/checkout-context";
import { getPaymentProvider, readPaymentConfig } from "../lib/payments";
import { isPaymentMethod, type PaymentMethod, type PaymentStatus } from "../lib/payments/types";

/**
 * Payment API.
 *
 * The flow is: summary → intent → verify → order. Each step is separately
 * addressable so a page refresh, a flaky connection or a late webhook can pick
 * up where the last one stopped rather than restarting the whole checkout.
 *
 * Only `/webhook` is unauthenticated, and it authenticates by signature instead
 * of by session — it is called by the provider, not the browser.
 */

export const paymentsRoute = new Hono();

const summaryQuerySchema = z.object({
  deliveryMethod: z.enum(["DELIVERY", "PICKUP"]).default("DELIVERY"),
  deliveryAddressId: z.coerce.number().int().positive().optional(),
});

const createIntentSchema = z.object({
  deliveryMethod: z.enum(["DELIVERY", "PICKUP"]).default("DELIVERY"),
  deliveryAddressId: z.number().int().positive().nullish(),
  paymentMethod: z.enum(["UPI", "CARD", "NET_BANKING", "WALLET"]),
  /**
   * Client-generated, stable for one checkout attempt. Retrying with the same
   * key returns the same intent instead of opening a second one.
   */
  idempotencyKey: z.string().min(8).max(100),
});

/**
 * Strict: an unexpected key is an error, not something to ignore. A body
 * carrying `amount`, `total` or `success` is either a bug or an attempt to
 * dictate the outcome, and both should fail loudly here rather than be
 * silently stripped and look accepted.
 */
const verifySchema = z
  .object({
    paymentMethod: z.enum(["UPI", "CARD", "NET_BANKING", "WALLET"]).optional(),
  })
  .strict();

function assertAmountMatches(expected: number, actual: number): void {
  if (expected !== actual) {
    throw new HttpError(
      409,
      "PAYMENT_AMOUNT_CHANGED",
      "The payment amount has changed. Please review your checkout again.",
    );
  }
}

/* ------------------------------ provider info ------------------------------- */

/** Which methods are on offer right now, and whether this is a real provider. */
paymentsRoute.get("/methods", async (c) => {
  requireUser(c);
  const provider = getPaymentProvider();
  const config = readPaymentConfig();
  return c.json(
    ok({
      provider: provider.name,
      // The UI is required to say plainly that no real money moved. A
      // development payment must never render like a production confirmation.
      isProductionReady: provider.isProductionReady,
      currency: CURRENCY,
      methods: await provider.listMethods(),
      isDevelopmentMock: config.isDevelopmentMock,
    }),
  );
});

/* --------------------------------- summary ---------------------------------- */

/**
 * The amount, computed from the cart. `GET`, not `POST`: the summary is a
 * read, and making it a POST would tempt callers to treat it as the thing that
 * reserves an amount. It does not.
 */
paymentsRoute.get("/summary", async (c) => {
  const user = requireUser(c);
  const input = summaryQuerySchema.parse(c.req.query());

  const quote = await buildCheckoutQuote({
    userId: user.id,
    deliveryMethod: input.deliveryMethod,
    deliveryAddressId: input.deliveryAddressId ?? null,
  });

  const provider = getPaymentProvider();
  return c.json(
    ok({
      ...quote,
      currency: CURRENCY,
      provider: provider.name,
      isProductionReady: provider.isProductionReady,
    }),
  );
});

/* ------------------------------ create intent ------------------------------- */

/**
 * Open a payment intent and reserve the amount.
 *
 * The transaction row is written *before* the provider is called, so a payment
 * attempt is always visible even if the provider never answers. The amount on
 * that row is the contract: order creation will refuse to charge anything else.
 */
paymentsRoute.post("/intents", async (c) => {
  const user = requireUser(c);
  const input = createIntentSchema.parse(await c.req.json());

  const quote = await buildCheckoutQuote({
    userId: user.id,
    deliveryMethod: input.deliveryMethod,
    deliveryAddressId: input.deliveryAddressId ?? null,
  });

  if (!quote.isPayable) {
    throw new HttpError(
      409,
      "CART_UNAVAILABLE",
      "Your cart changed and can no longer be paid for. Please review it.",
    );
  }

  const provider = getPaymentProvider();

  // Idempotency: an existing transaction for this key is the answer. Re-creating
  // is not an error, it is the same checkout being resumed.
  const [existing] = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, user.id),
        eq(transactions.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);

  if (existing) {
    return c.json(
      ok({
        transactionId: existing.id,
        provider: existing.provider,
        providerPaymentId: existing.providerTransactionId,
        amount: existing.amount,
        currency: existing.currency,
        status: existing.status as PaymentStatus,
        isProductionReady: provider.isProductionReady,
        // Only a still-open intent is resumable; a settled one must not be
        // handed back for a second charge.
        resumable: existing.status === "PENDING" && existing.orderId === null,
      }),
      200,
    );
  }

  const intent = await provider.createIntent({
    amount: quote.breakdown.grandTotal,
    currency: quote.breakdown.currency,
    idempotencyKey: input.idempotencyKey,
    metadata: { userId: String(user.id) },
  });

  const [inserted] = await db
    .insert(transactions)
    .values({
      userId: user.id,
      type: "PAYMENT",
      amount: quote.breakdown.grandTotal,
      currency: quote.breakdown.currency,
      status: "PENDING",
      provider: provider.name,
      providerTransactionId: intent.providerPaymentId,
      providerIdempotencyKey: input.idempotencyKey,
      idempotencyKey: input.idempotencyKey,
      paymentMethod: input.paymentMethod,
      // The checkout choices, so a webhook arriving with no context can still
      // finish the job. Never secrets — just which address and which method.
      metadata: serializeCheckoutMetadata(
        {
          deliveryMethod: input.deliveryMethod,
          deliveryAddressId: input.deliveryAddressId ?? null,
        },
        [ORDER_EVENTS.PAYMENT_SUCCEEDED],
      ),
    })
    .$returningId();
  return c.json(
    ok({
      transactionId: Number(inserted.id),
      provider: provider.name,
      providerPaymentId: intent.providerPaymentId,
      amount: intent.amount,
      currency: intent.currency,
      status: intent.status,
      isProductionReady: provider.isProductionReady,
      resumable: true,
    }),
    201,
  );
});

/* --------------------------------- status ----------------------------------- */

/** The current state of one payment. Polled until it reaches a terminal status. */
paymentsRoute.get("/:id", async (c) => {
  const user = requireUser(c);
  const id = z.coerce.number().int().positive().parse(c.req.param("id"));

  const [row] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, user.id)))
    .limit(1);

  // A payment that is not the caller's is "not found", not "forbidden": saying
  // otherwise would confirm that someone else's payment id exists.
  if (!row) throw new HttpError(404, "NOT_FOUND", "Payment not found.");

  return c.json(
    ok({
      transactionId: row.id,
      status: row.status as PaymentStatus,
      amount: row.amount,
      currency: row.currency,
      paymentMethod: row.paymentMethod,
      orderId: row.orderId,
      failureReason: row.failureReason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }),
  );
});

/* --------------------------------- verify ----------------------------------- */

/**
 * Confirm a payment and, only then, create the order.
 *
 * Order of operations is the whole point: the provider verifies first, the
 * transaction is recorded as PROCESSING and committed, and only then is the
 * order built. A failure in the second half leaves a real, reconcilable payment
 * record — never a customer charged with no order to show.
 */
paymentsRoute.post("/:id/verify", async (c) => {
  const user = requireUser(c);
  const id = z.coerce.number().int().positive().parse(c.req.param("id"));
  const input = verifySchema.parse(await c.req.json().catch(() => ({})));

  const [row] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, user.id)))
    .limit(1);
  if (!row) throw new HttpError(404, "NOT_FOUND", "Payment not found.");

  // Resuming an already-settled payment returns the existing order rather than
  // creating a second one. A double-clicked Pay button lands here.
  if (row.orderId !== null) {
    return c.json(ok(await resolveConfirmation(row.orderId, row.id)));
  }

  if (!row.providerTransactionId) {
    throw new HttpError(409, "PAYMENT_NOT_FOUND", "This payment attempt is not recognised.");
  }
  if (row.status === "CANCELLED") {
    throw new HttpError(409, "PAYMENT_CANCELLED", "This payment was cancelled.");
  }
  if (row.status === "FAILED") {
    throw new HttpError(409, "PAYMENT_FAILED", row.failureReason ?? "Payment could not be completed.");
  }

  const provider = getPaymentProvider();
  // The server asks the provider what happened; it never asks the browser.
  // A real adapter may additionally require a proof the provider's own UI
  // returned, and this is where it would be handed over — but that is the
  // provider's call to make, not the browser's.
  const result = await provider.verifyPayment({
    providerPaymentId: row.providerTransactionId,
  });

  if (!result.verified || result.status !== "SUCCEEDED") {
    const reason = result.failureReason ?? "Payment could not be completed.";
    // Only a provider-terminal failure (declined, expired, unrecognised)
    // closes the attempt. A merely unproven one — a missing or mistyped
    // signature — leaves the transaction PENDING so the customer can retry.
    // Failing it here would make one interrupted attempt permanently
    // unpayable and force a fresh intent.
    if (result.isTerminal) {
      await db
        .update(transactions)
        .set({
          status: result.status === "CANCELLED" ? "CANCELLED" : "FAILED",
          failureReason: reason.slice(0, 255),
          updatedAt: new Date(),
        })
        .where(eq(transactions.id, row.id));
    }
    throw new HttpError(409, "PAYMENT_FAILED", reason);
  }

  // The provider's amount is authoritative on what money moved. It must match
  // the amount we reserved, or we do not know what we are confirming.
  assertAmountMatches(row.amount, result.amount);

  const paymentMethod = input.paymentMethod;
  if (paymentMethod && !isPaymentMethod(paymentMethod)) {
    throw new HttpError(400, "BAD_REQUEST", "Unsupported payment method.");
  }

  // Commit the verified payment *before* building the order.
  await db
    .update(transactions)
    .set({
      status: "PROCESSING",
      paymentMethod: paymentMethod ?? row.paymentMethod,
      providerTransactionId: result.providerPaymentId,
      metadata: JSON.stringify({
        checkout: readCheckoutContext(row.metadata),
        providerReference: result.providerReference ?? null,
        events: [ORDER_EVENTS.PAYMENT_SUCCEEDED],
      }),
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, row.id));

  const context = readCheckoutContext(row.metadata);
  if (!context) {
    throw new HttpError(409, "CHECKOUT_CONTEXT_MISSING", "This payment is missing its checkout details.");
  }

  const confirmation = await createOrderFromPayment({
    userId: user.id,
    transactionId: row.id,
    deliveryMethod: context.deliveryMethod,
    deliveryAddressId: context.deliveryAddressId,
  });

  return c.json(ok(confirmation));
});

/* ---------------------------------- cancel ---------------------------------- */

/**
 * Cancel a payment. The cart is deliberately left alone — the customer is still
 * holding the items and has not gone anywhere.
 */
paymentsRoute.post("/:id/cancel", async (c) => {
  const user = requireUser(c);
  const id = z.coerce.number().int().positive().parse(c.req.param("id"));

  const [row] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, user.id)))
    .limit(1);
  if (!row) throw new HttpError(404, "NOT_FOUND", "Payment not found.");

  if (row.orderId !== null || row.status === "SUCCEEDED") {
    // Settled. Cancelling must not pretend to reverse a real payment.
    throw new HttpError(409, "PAYMENT_ALREADY_SETTLED", "This payment has already completed.");
  }

  let providerStatus: PaymentStatus = "CANCELLED";
  if (row.providerTransactionId) {
    const provider = getPaymentProvider();
    const cancelled = await provider.cancelPayment({
      providerPaymentId: row.providerTransactionId,
    });
    providerStatus = cancelled.status;
  }

  if (providerStatus !== "CANCELLED") {
    throw new HttpError(409, "PAYMENT_NOT_CANCELLABLE", "This payment can no longer be cancelled.");
  }

  await db
    .update(transactions)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(eq(transactions.id, row.id));

  return c.json(ok({ transactionId: row.id, status: "CANCELLED" as PaymentStatus }));
});

/* --------------------------------- webhook ---------------------------------- */

/**
 * Provider webhook. Unauthenticated by session, authenticated by signature.
 *
 * It lives in `paymentsRoute` alongside the rest, which is safe because
 * `paymentsRoute` has no blanket `use("*")` auth middleware — each
 * authenticated handler calls `requireUser` itself. Declared before `/:id` so
 * the literal path is never captured as an id.
 *
 * Order of checks matters: signature, then parse, then look up, then amount. An
 * unsigned body is rejected before it is even parsed, so a forged event can
 * never reach the database.
 */
paymentsRoute.post("/webhook", async (c) => {
  const provider = getPaymentProvider();
  const rawBody = await c.req.text();

  const signature = c.req.header("x-revaro-signature") ?? undefined;
  if (!provider.verifyWebhookSignature(rawBody, signature)) {
    // 401, and nothing is written.
    throw new HttpError(401, "INVALID_SIGNATURE", "Webhook signature verification failed.");
  }

  const event = provider.parseWebhookEvent(rawBody);
  if (!event) {
    throw new HttpError(400, "INVALID_EVENT", "Webhook payload could not be parsed.");
  }

  // Find the transaction by the provider's own id — the one thing we can trust,
  // because the signature was checked first.
  const [row] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.providerTransactionId, event.providerPaymentId))
    .limit(1);

  // An event for a payment we do not know about is not an error worth alerting
  // on; a provider can legitimately outlive a transaction. Acknowledge it.
  if (!row) {
    return c.json(ok({ received: true, handled: false }));
  }

  const alreadyApplied = readProcessedEventIds(row.processedEventIds);
  if (alreadyApplied.has(event.eventId)) {
    // Replay. Webhook delivery is at-least-once, so this is normal, not a bug.
    return c.json(ok({ received: true, handled: true, duplicate: true }));
  }

  let orderId = row.orderId;
  let review: string | null = null;

  if (orderId === null && event.status === "SUCCEEDED") {
    const result = await reconcileSettledTransaction({
      transactionId: row.id,
      providerStatus: event.status,
      providerAmount: event.amount,
      paymentMethod: (row.paymentMethod ?? "UPI") as PaymentMethod,
    });

    if (result.outcome === "ORDERED") orderId = result.orderId;
    if (result.outcome === "ALREADY_HANDLED") orderId = result.orderId;
    if (result.outcome === "REVIEW_NEEDED") review = result.reason;
  }

  await db
    .update(transactions)
    .set({
      // Never downgrade a settled payment: the outcome of a replayed event
      // must not undo the state the first one produced.
      status: event.status === "SUCCEEDED" && row.status === "SUCCEEDED" ? "SUCCEEDED" : event.status,
      failureReason: review ?? (event.failureReason ? event.failureReason.slice(0, 255) : null),
      processedEventIds: JSON.stringify([...alreadyApplied, event.eventId].slice(-50)),
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, row.id));

  // Always 2xx once the signature has been accepted. A provider retries every
  // non-2xx response, and an amount mismatch or a transient failure would then
  // be retried forever. The problem is recorded on the transaction and reported
  // in the body instead, where a human or a reconciliation job can see it.
  return c.json(
    ok({
      received: true,
      handled: orderId !== null,
      orderId,
      ...(review ? { reviewRequired: true, reason: review } : {}),
    }),
  );
});

function readProcessedEventIds(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((v): v is string => typeof v === "string")) : new Set();
  } catch {
    return new Set();
  }
}

async function resolveConfirmation(orderId: number, transactionId: number) {
  const [row] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!row) {
    throw new HttpError(404, "NOT_FOUND", "Order not found.");
  }
  return {
    transactionId,
    orderId: row.id,
    orderNumber: row.orderNumber ?? `#${row.id}`,
    status: row.status,
    paymentStatus: row.paymentStatus,
    total: row.total,
    currency: row.currency,
    rentalCount: 0,
    created: false,
  };
}
