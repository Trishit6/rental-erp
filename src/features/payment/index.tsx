export { PaymentPage } from "./components/PaymentPage";

/**
 * Payment feature entry point.
 *
 * The heavy lifting lives in the components; this module is the face of the
 * feature and the single place another feature is allowed to reach for. It
 * deliberately exports no cart state: a consumer that needs the cart imports
 * `@/lib/query/cart`, so there stays exactly one cart system in the app.
 */
export type {
  OrderConfirmation,
  PaymentBreakdown,
  PaymentIntent,
  PaymentMethod,
  PaymentStatus,
  PaymentSummary,
} from "./types";
