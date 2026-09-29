import { PaymentPage } from "./index";
import { parsePaymentSearch } from "./components/schema";

/**
 * Route options for `/payment`, kept with the feature so the thin file in
 * `src/routes` only declares the path and the guard.
 *
 * The search params carry the checkout *choices* (delivery method, address)
 * forward from `/checkout`. They are never trusted as an amount: the server
 * recomputes the total from the cart on every call, so tampering with the URL
 * can change which address is used but not what is charged.
 *
 * Parsing never throws — a hand-edited URL degrades to "delivery, no address",
 * which the server then rejects with a clear message, rather than crashing the
 * route.
 */
export const paymentRouteOptions = {
  validateSearch: (search: Record<string, unknown>) => {
    const parsed = parsePaymentSearch(search);
    return {
      deliveryMethod: parsed.deliveryMethod,
      addressId: parsed.deliveryAddressId ?? undefined,
    };
  },
  component: PaymentPage,
};
