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
/**
 * What kind of money a transaction represents.
 *
 * A single payment pipeline serves three different purchases, and the *purpose*
 * is what lets one settlement path dispatch to the right handler: a cart
 * checkout becomes an order, a rent-to-own buy becomes a purchase order for an
 * existing rental, and an extension pays for extra days on a booking that
 * already exists. The purpose is server-written at intent time (never supplied
 * by a webhook or the browser) and is the sole discriminator on the way back.
 */
export const CHECKOUT_PURPOSES = ["CART", "RENTAL_BUY", "RENTAL_EXTENSION"] as const;
export type CheckoutPurpose = (typeof CHECKOUT_PURPOSES)[number];

export type CheckoutContext = {
  purpose: CheckoutPurpose;
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
  /**
   * The rental this payment belongs to, for the two rental purposes. Null for a
   * cart checkout. It is the id the settlement path locks and re-verifies.
   */
  rentalId: number | null;
};

/** The shape a caller supplies; `purpose`/`rentalId` default for legacy callers. */
export type CheckoutContextInput = Omit<CheckoutContext, "purpose" | "rentalId"> & {
  purpose?: CheckoutPurpose;
  rentalId?: number | null;
};

/**
 * Build the transaction's `metadata` envelope.
 *
 * One writer, so the shape written on intent creation and the shape read on
 * webhook reconciliation cannot drift.
 */
export function serializeCheckoutMetadata(
  context: CheckoutContextInput,
  events: string[],
  /**
   * Extra top-level keys for a purpose-specific plan.
   *
   * A rent-to-own or extension intent needs to remember *what it was pricing*
   * (the rental, the extra days, the quote) so the webhook — which has no
   * browser context — can settle it. Keeping it under its own key means
   * `readCheckoutContext` is unchanged and a cart payment simply has no extra.
   */
  extra?: Record<string, unknown>,
): string {
  return JSON.stringify({
    checkout: {
      purpose: context.purpose ?? "CART",
      deliveryMethod: context.deliveryMethod,
      deliveryAddressId: context.deliveryAddressId,
      couponCode: context.couponCode ?? null,
      rentalId: context.rentalId ?? null,
    } satisfies CheckoutContext,
    events,
    ...(extra ?? {}),
  });
}

/** Read a top-level key the intent stored alongside the checkout context. */
export function readCheckoutExtra(metadata: string | null, key: string): unknown {
  if (!metadata) return undefined;
  try {
    const parsed: unknown = JSON.parse(metadata);
    if (typeof parsed !== "object" || parsed === null) return undefined;
    return (parsed as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
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

    const { purpose, deliveryMethod, deliveryAddressId, couponCode, rentalId } = checkout as Record<
      string,
      unknown
    >;
    if (deliveryMethod !== "DELIVERY" && deliveryMethod !== "PICKUP") return null;

    return {
      // A payment written before purposes existed is a cart checkout, not an
      // invalid one, so the absent field reads as `CART` rather than failing.
      purpose:
        typeof purpose === "string" && (CHECKOUT_PURPOSES as readonly string[]).includes(purpose)
          ? (purpose as CheckoutPurpose)
          : "CART",
      deliveryMethod,
      deliveryAddressId:
        typeof deliveryAddressId === "number" && Number.isInteger(deliveryAddressId)
          ? deliveryAddressId
          : null,
      // An older payment carries no `couponCode`; that is a checkout with no
      // coupon, not a corrupt one, so it reads as null rather than failing.
      couponCode:
        typeof couponCode === "string" && couponCode.trim() !== "" ? couponCode.trim() : null,
      rentalId:
        typeof rentalId === "number" && Number.isInteger(rentalId) && rentalId > 0
          ? rentalId
          : null,
    };
  } catch {
    return null;
  }
}
