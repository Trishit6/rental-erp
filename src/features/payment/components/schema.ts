import { z } from "zod";
import { PAYMENT_METHODS, type PaymentMethod, type PaymentStatus } from "../types";

/**
 * Payment form and URL logic.
 *
 * Kept out of the components so it stays unit-testable without rendering, and
 * so the same rules cannot drift between the page, the summary and the API
 * layer.
 */

/* ------------------------------ URL search state ----------------------------- */

/**
 * The checkout context carried in the URL.
 *
 * TanStack Router JSON-parses search params, so `?addressId=5` arrives as the
 * *number* 5, while a hand-typed or `stringify`-ed URL arrives as `"5"`. Both
 * must parse, and parsing must never throw — a malformed param should degrade
 * to "no address", not blow up the route.
 */
export type PaymentSearch = {
  deliveryMethod: "DELIVERY" | "PICKUP";
  deliveryAddressId: number | null;
};

function toOptionalInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return parsed > 0 ? parsed : null;
  }
  return null;
}

export function parsePaymentSearch(input: Record<string, unknown>): PaymentSearch {
  const raw = input.deliveryMethod;
  const deliveryMethod = raw === "PICKUP" || raw === "DELIVERY" ? raw : "DELIVERY";
  return {
    deliveryMethod,
    deliveryAddressId: toOptionalInt(input.addressId),
  };
}

/* --------------------------------- methods ---------------------------------- */

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && (PAYMENT_METHODS as readonly string[]).includes(value);
}

/* --------------------------------- verify ----------------------------------- */

/**
 * Strict on purpose: an unexpected key is rejected rather than silently
 * stripped. A body carrying `amount` or `success` is a bug or an attempt, and
 * either way it should fail loudly instead of appearing to be accepted.
 */
export const verifyPaymentSchema = z
  .object({
    paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  })
  .strict();

export type VerifyPaymentForm = z.infer<typeof verifyPaymentSchema>;

/* ---------------------------------- steps ----------------------------------- */

export const PAYMENT_STEPS = [
  "method",
  "processing",
  "success",
  "failed",
  "cancelled",
] as const;

export type PaymentStep = (typeof PAYMENT_STEPS)[number];

/**
 * Which screen a payment status should show.
 *
 * PENDING and PROCESSING are the same screen to the customer: the provider is
 * doing something and we do not yet know whether it worked. Splitting them
 * would imply a certainty neither state has.
 */
export function stepForStatus(status: PaymentStatus): PaymentStep {
  switch (status) {
    case "SUCCEEDED":
      return "success";
    case "FAILED":
      return "failed";
    case "CANCELLED":
      return "cancelled";
    case "REFUNDED":
      return "failed";
    case "PENDING":
    case "PROCESSING":
    default:
      return "processing";
  }
}

export type PaymentStatusCopy = {
  title: string;
  description: string;
  /** What the customer should do next, if anything. */
  hint?: string;
};

export function statusCopy(status: PaymentStatus, orderNumber?: string): PaymentStatusCopy {
  switch (status) {
    case "SUCCEEDED":
      return {
        title: "Payment successful",
        description: orderNumber
          ? `Your order ${orderNumber} has been confirmed.`
          : "Your order has been confirmed.",
      };
    case "FAILED":
      return {
        title: "Payment failed",
        description: "Your payment could not be completed. You have not been charged.",
        hint: "You can try again — no duplicate order will be created.",
      };
    case "CANCELLED":
      return {
        title: "Payment cancelled",
        description: "You cancelled this payment. Your cart is untouched.",
      };
    case "REFUNDED":
      return {
        title: "Payment refunded",
        description: "This payment was refunded to your original payment method.",
      };
    case "PENDING":
    case "PROCESSING":
    default:
      return {
        title: "Payment is being processed",
        description: "Please don't close this window.",
      };
  }
}

/* ------------------------------ idempotency key ----------------------------- */

/**
 * Validate a client-supplied idempotency key before it reaches the server, so
 * an obviously malformed key never leaves the browser. The server validates it
 * again and stays the authority.
 */
export const idempotencyKeySchema = z.string().min(8).max(100);

export function newIdempotencyKey(): string {
  return `revaro_${crypto.randomUUID()}`;
}
