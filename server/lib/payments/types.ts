/**
 * Payment provider abstraction.
 *
 * The rest of the server (checkout, orders, rentals, seller, admin) only ever
 * talks to the `PaymentProvider` interface below. Nothing imports a concrete
 * provider, so swapping the development mock for a real gateway is a config
 * change plus one adapter file — no caller is rewritten.
 *
 * Two rules this interface exists to enforce:
 *
 *  1. The browser never authorises a payment. `verifyPayment` is called by the
 *     server, and only its return value decides whether money moved.
 *  2. No card data crosses this boundary. `CreateIntentInput` carries an amount
 *     and metadata, never credentials; the provider owns anything sensitive.
 */

export const PAYMENT_METHODS = ["UPI", "CARD", "NET_BANKING", "WALLET"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Transaction status. `PENDING` is an intent that exists but has not been
 * confirmed; the order must never be created while a transaction is in any
 * state other than `SUCCEEDED`.
 */
export const PAYMENT_STATUSES = [
  "PENDING",
  "PROCESSING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** A method the provider says it can actually take right now. */
export type PaymentMethodDescriptor = {
  method: PaymentMethod;
  label: string;
  description: string;
  /** Provider-specific hints, e.g. a UPI handle or a list of banks. */
  metadata?: Record<string, string>;
};

export type CreateIntentInput = {
  /** Minor units (paise). Always an integer. */
  amount: number;
  currency: string;
  /**
   * Client-supplied key that makes intent creation idempotent. The provider
   * must return the same intent for the same key rather than creating a second
   * one — that is what stops a double-clicked Pay button from producing two
   * charges.
   */
  idempotencyKey: string;
  /** Opaque server-side context (order/cart references). Never secrets. */
  metadata?: Record<string, string>;
};

export type PaymentIntent = {
  provider: string;
  /** The provider's own identifier — what a webhook would refer back to. */
  providerPaymentId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  /** What the client must hand back to complete this intent. */
  clientSecret?: string;
  expiresAt?: Date;
};

export type VerifyPaymentInput = {
  providerPaymentId: string;
  /**
   * Opaque proof returned by the provider's own UI/redirect. The provider
   * validates it — the server never treats its presence as confirmation.
   */
  signature?: string;
};

export type VerifyPaymentResult = {
  verified: boolean;
  status: PaymentStatus;
  providerPaymentId: string;
  /** Echoed so the caller can assert the charged amount matches the intent. */
  amount: number;
  currency: string;
  /**
   * True only when the provider has *definitively* settled this attempt and it
   * can never succeed — a bank decline, or an expired authorisation.
   *
   * False for a result that merely means "you did not present valid proof",
   * where the payment is still open. The distinction matters: marking the
   * transaction failed for a bad or missing signature would make one mistimed
   * retry permanently unpayable, and a customer who clicked Pay and been
   * briefly interrupted would have to start over.
   */
  isTerminal?: boolean;
  /** Present on failure; safe to surface to the user. */
  failureReason?: string;
  providerReference?: string;
};

export type CancelPaymentInput = {
  providerPaymentId: string;
};

export type CancelPaymentResult = {
  cancelled: boolean;
  status: PaymentStatus;
  providerPaymentId: string;
};

/** A provider's own event, already normalised. */
export type WebhookEvent = {
  /** Provider's unique event id — the basis of webhook idempotency. */
  eventId: string;
  type: string;
  providerPaymentId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  failureReason?: string;
  providerReference?: string;
};

export interface PaymentProvider {
  /** Stable identifier stored on the transaction row. */
  readonly name: string;

  /**
   * False for the development mock. The API surfaces this so the UI can say
   * plainly that no real money moved — a development payment must never be
   * dressed up as a production confirmation.
   */
  readonly isProductionReady: boolean;

  /** Methods this provider can take right now, from the provider's own config. */
  listMethods(): Promise<PaymentMethodDescriptor[]>;

  createIntent(input: CreateIntentInput): Promise<PaymentIntent>;

  /** Authoritative. The browser's opinion is never consulted. */
  verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult>;

  cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentResult>;

  /**
   * Constant-time-ish signature check over the raw body. Implementations must
   * return false rather than throw for a malformed or unsigned body.
   */
  verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean;

  parseWebhookEvent(rawBody: string): WebhookEvent | null;
}

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && (PAYMENT_METHODS as readonly string[]).includes(value);
}

/** Payment statuses that may transition to `SUCCEEDED`. */
export const SETTLED_STATUSES: readonly PaymentStatus[] = ["SUCCEEDED"];

/** Statuses a user-visible attempt can end in. Polling stops on any of these. */
export const TERMINAL_STATUSES: readonly PaymentStatus[] = ["SUCCEEDED", "FAILED", "CANCELLED"];
