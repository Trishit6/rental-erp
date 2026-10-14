import type { DeliveryMethod } from "../checkout";

/**
 * How a payment remembers the checkout it belongs to.
 *
 * Kept in its own module, free of any database import, because it is pure
 * serialisation and because both the payment route and order creation need to
 * read it — including from the webhook, which has no user session and no cart
 * context of its own to fall back on.
 *
 * Only choices live here (which address, delivery or pickup). Never an amount:
 * the amount is on the transaction row, and re-deriving it from metadata would
 * give a second, weaker source of truth for what was charged.
 */
export type CheckoutContext = {
  deliveryMethod: DeliveryMethod;
  deliveryAddressId: number | null;
  /**
   * The coupon code the customer applied at this checkout, if any.
   *
   * A *choice*, not an amount: the discount is re-derived from the code and the
   * cart at order time, so a stale or tampered value cannot change what is
   * charged — only fail to validate, which surfaces as a changed amount.
   */
  couponCode: string | null;
};

/**
 * Build the transaction's `metadata` envelope.
 *
 * One writer, so the shape written on intent creation and the shape read on
 * webhook reconciliation cannot drift.
 */
export function serializeCheckoutMetadata(context: CheckoutContext, events: string[]): string {
  return JSON.stringify({ checkout: context, events });
}

/**
 * Read the context back. Returns null rather than throwing, because a payment
 * whose metadata is missing or corrupt is a state to be handled, not a crash —
 * callers turn null into a "needs manual review" conflict.
 */
export function readCheckoutContext(metadata: string | null): CheckoutContext | null {
  if (!metadata) return null;
  try {
    const parsed: unknown = JSON.parse(metadata);
    if (typeof parsed !== "object" || parsed === null) return null;
    const checkout = (parsed as { checkout?: unknown }).checkout;
    if (typeof checkout !== "object" || checkout === null) return null;

    const { deliveryMethod, deliveryAddressId, couponCode } = checkout as Record<string, unknown>;
    if (deliveryMethod !== "DELIVERY" && deliveryMethod !== "PICKUP") return null;

    return {
      deliveryMethod,
      deliveryAddressId:
        typeof deliveryAddressId === "number" && Number.isInteger(deliveryAddressId)
          ? deliveryAddressId
          : null,
      // An older payment carries no `couponCode`; that is a checkout with no
      // coupon, not a corrupt one, so it reads as null rather than failing.
      couponCode:
        typeof couponCode === "string" && couponCode.trim() !== "" ? couponCode.trim() : null,
    };
  } catch {
    return null;
  }
}
