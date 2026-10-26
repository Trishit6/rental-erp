import { canPurchaseRental } from "./rental-lifecycle";

/**
 * Rent-to-own arithmetic, as pure functions.
 *
 * ## Why this is not in the route
 *
 * The buy-out price is money, and the only defence against a tampered price is
 * that the number the customer is charged is **derived** on the server, never
 * accepted from the request. Keeping the derivation here — free of the database,
 * the session and the payment provider — means it can be tested against the
 * boundary cases directly (a cap above the price, a zero percentage, a credit
 * larger than the item) instead of only through an HTTP round trip that would
 * need a live rental to reach.
 *
 * The three figures, and where each comes from:
 *
 *  - **eligible rent** — the rental subtotal (the rental charge the customer
 *    already paid; the deposit is not rent and never earns credit),
 *  - **the percentage** — `products.rent_credit_percentage`, the seller's rule,
 *  - **the cap** — `products.rent_credit_cap`, bounded by the purchase price so
 *    a stale cap can never pay the customer to take the item.
 */

export type RentToOwnProduct = {
  purchasePrice: number | null;
  rentCreditPercentage: number | null;
  rentCreditCap: number | null;
};

export type RentToOwnRental = {
  rentalSubtotal: number;
};

/**
 * The credit the rent already paid earns, in paise.
 *
 * `eligible × pct / 100`, rounded to whole paise (the same `Math.round` the rest
 * of the pricing layer uses), then clamped to the product cap *and* the purchase
 * price. A negative or non-finite result is floored at zero: a credit is money
 * off, never money owed.
 */
export function computeRentToOwnCredit(
  product: RentToOwnProduct,
  rental: RentToOwnRental,
): number {
  const purchasePrice = product.purchasePrice ?? 0;
  if (purchasePrice <= 0) return 0;

  const percentage = product.rentCreditPercentage ?? 0;
  const cap = product.rentCreditCap ?? purchasePrice;
  const eligible = Math.max(0, rental.rentalSubtotal);

  const byPercentage = Math.round((eligible * percentage) / 100);
  const credit = Math.min(byPercentage, cap, purchasePrice);
  return Math.max(0, credit);
}

export type RentToOwnPrice = {
  /** The purchase price on the listing, in paise. */
  purchasePrice: number;
  /** The rent credit applied, in paise. */
  credit: number;
  /** What the customer pays: `purchasePrice − credit`, floored at zero. */
  price: number;
};

/** The full price breakdown, every figure server-derived. */
export function rentToOwnPrice(
  product: RentToOwnProduct,
  rental: RentToOwnRental,
): RentToOwnPrice {
  const purchasePrice = product.purchasePrice ?? 0;
  const credit = computeRentToOwnCredit(product, rental);
  return { purchasePrice, credit, price: Math.max(0, purchasePrice - credit) };
}

/**
 * The preconditions for a buy-out, evaluated without touching the database.
 *
 * Returns the first failure rather than a list, because the caller turns it into
 * a single user-facing error and a customer does not need to be told four reasons
 * at once. The order of the checks is deliberate: "already bought" and "not
 * rent-to-own" are facts about the state, and are checked before stock, which is
 * the one that can change under a race.
 */
export type RentToOwnEvaluation =
  | { ok: true; price: RentToOwnPrice }
  | { ok: false; status: number; code: string; message: string };

export function evaluateRentToOwnBuy(input: {
  rentalStatus: string;
  alreadyPurchased: boolean;
  product: RentToOwnProduct & {
    rentToOwnEnabled: boolean;
    availableQuantity: number;
  };
  rental: RentToOwnRental;
}): RentToOwnEvaluation {
  if (input.alreadyPurchased) {
    return {
      ok: false,
      status: 409,
      code: "ALREADY_PURCHASED",
      message: "This rental has already been bought out.",
    };
  }
  if (!canPurchaseRental(input.rentalStatus)) {
    return {
      ok: false,
      status: 409,
      code: "PURCHASE_NOT_ALLOWED",
      message: "This rental can no longer be bought out.",
    };
  }
  if (!input.product.rentToOwnEnabled || !input.product.purchasePrice) {
    return {
      ok: false,
      status: 400,
      code: "RENT_TO_OWN_UNAVAILABLE",
      message: "This item doesn't support rent-to-own.",
    };
  }
  if (input.product.availableQuantity < 1) {
    return {
      ok: false,
      status: 409,
      code: "UNAVAILABLE",
      message: "This item is no longer available to buy.",
    };
  }
  return { ok: true, price: rentToOwnPrice(input.product, input.rental) };
}
