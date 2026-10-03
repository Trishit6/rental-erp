import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { addresses, cartItems, carts, products } from "../schema";
import { HttpError } from "./api";
import { DELIVERY_FEE_PAISE } from "./config";
import { priceCartLine, validateCartLine, type CartIssue, type CartLinePricing } from "./cart";
import { assertRentalAvailability, type QueryExecutor } from "./rental-availability";
import { rentalDays } from "../../src/lib/pricing";

/**
 * Server-authoritative checkout quote.
 *
 * This is the single place that decides what a customer is charged. It is used
 * by `GET /api/payments/summary` (to *display* an amount) and by order creation
 * (to *charge* that amount) — one function, so the two can never disagree. If
 * they were computed separately, a price change between rendering the summary
 * and pressing Pay would silently charge a different amount than the one the
 * customer agreed to.
 *
 * Nothing here is ever computed from browser input. The only client-supplied
 * values are *choices* (which address, delivery or pickup) — never an amount,
 * a product price, a seller id or a user id.
 */

export const CURRENCY = "INR";

export type DeliveryMethod = "DELIVERY" | "PICKUP";

export type CheckoutLine = {
  cartItemId: number;
  productId: number;
  sellerId: number;
  title: string;
  imageUrl: string | null;
  mode: "BUY" | "RENT";
  quantity: number;
  startDate: string | null;
  endDate: string | null;
  rentalDays: number | null;
  listingType: string;
  pricing: CartLinePricing;
};

export type CheckoutBreakdown = {
  /** Purchases + rental charges. Excludes deposits. */
  subtotal: number;
  /** The rental portion of `subtotal`. Zero for a pure purchase. */
  rentalAmount: number;
  /** Refundable, held separately. Never seller revenue. */
  securityDeposit: number;
  deliveryFee: number;
  discount: number;
  tax: number;
  /** What the customer is actually charged: subtotal + deposit + fee - discount + tax. */
  grandTotal: number;
  currency: string;
};

export type CheckoutQuote = {
  lines: CheckoutLine[];
  breakdown: CheckoutBreakdown;
  /** Everything blocking checkout, in cart-line vocabulary. */
  issues: CartIssue[];
  /** True only when there is at least one line and nothing is blocking. */
  isPayable: boolean;
  deliveryMethod: DeliveryMethod;
  deliveryAddressId: number | null;
  /** Null for pickup. Only the customer's own address is ever loaded. */
  deliveryAddress: {
    id: number;
    name: string;
    phone: string;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  } | null;
};

export type BuildQuoteInput = {
  userId: number;
  deliveryMethod: DeliveryMethod;
  deliveryAddressId?: number | null;
  /**
   * Run inside the caller's transaction so the quote and the order it creates
   * are computed against the same consistent snapshot.
   */
  executor?: QueryExecutor;
};

const productColumns = {
  id: products.id,
  title: products.title,
  sellerId: products.sellerId,
  status: products.status,
  listingType: products.listingType,
  purchasePrice: products.purchasePrice,
  rentalPricePerDay: products.rentalPricePerDay,
  rentalPricePerWeek: products.rentalPricePerWeek,
  rentalPricePerMonth: products.rentalPricePerMonth,
  securityDeposit: products.securityDeposit,
  quantity: products.quantity,
  availableQuantity: products.availableQuantity,
  minimumRentalDays: products.minimumRentalDays,
  maximumRentalDays: products.maximumRentalDays,
  primaryImage: sql<string | null>`(
    SELECT pi.url FROM product_images pi
    WHERE pi.product_id = ${products.id}
    ORDER BY pi.sort_order ASC LIMIT 1
  )`,
};

function toDateString(value: Date | null): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

export async function buildCheckoutQuote(input: BuildQuoteInput): Promise<CheckoutQuote> {
  const executor = input.executor ?? db;
  const { userId, deliveryMethod } = input;

  /* --- 1. Resolve the delivery address, scoped to this user. --------------- */
  let deliveryAddress: CheckoutQuote["deliveryAddress"] = null;
  if (deliveryMethod === "DELIVERY") {
    if (!input.deliveryAddressId) {
      throw new HttpError(400, "ADDRESS_REQUIRED", "Choose a delivery address to continue.");
    }
    const [row] = await executor
      .select()
      .from(addresses)
      .where(and(eq(addresses.id, input.deliveryAddressId), eq(addresses.userId, userId)))
      .limit(1);
    // A 404 (not a 400) for someone else's address: it does not exist *for
    // this user*, and saying so reveals nothing about whether it exists.
    if (!row) throw new HttpError(404, "NOT_FOUND", "Address not found.");
    deliveryAddress = {
      id: row.id,
      name: row.name,
      phone: row.phone,
      addressLine1: row.addressLine1,
      addressLine2: row.addressLine2,
      city: row.city,
      state: row.state,
      postalCode: row.postalCode,
      country: row.country,
    };
  }

  /* --- 2. Load the cart's active lines with their products. ---------------- */
  const [cart] = await executor
    .select({ id: carts.id })
    .from(carts)
    .where(eq(carts.userId, userId))
    .limit(1);
  if (!cart) throw new HttpError(400, "EMPTY_CART", "Your cart is empty.");

  const rows = await executor
    .select({
      cartItemId: cartItems.id,
      productId: cartItems.productId,
      mode: cartItems.mode,
      quantity: cartItems.quantity,
      startDate: cartItems.startDate,
      endDate: cartItems.endDate,
      snapshotUnitPrice: cartItems.unitPriceSnapshot,
    })
    .from(cartItems)
    .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.savedForLater, false)))
    .orderBy(cartItems.id);

  if (rows.length === 0) {
    throw new HttpError(400, "EMPTY_CART", "Your cart is empty.");
  }

  const productIds = rows.map((r) => r.productId);
  const productRows = await executor
    .select(productColumns)
    .from(products)
    .where(inArray(products.id, productIds));
  const productById = new Map(productRows.map((p) => [p.id, p]));

  /* --- 3. Price and validate every line. ---------------------------------- */
  const issues: CartIssue[] = [];
  const lines: CheckoutLine[] = [];

  for (const row of rows) {
    const product = productById.get(row.productId) ?? null;
    const mode = row.mode === "RENT" ? "RENT" : "BUY";

    issues.push(
      ...validateCartLine({
        product,
        mode,
        quantity: row.quantity,
        startDate: row.startDate,
        endDate: row.endDate,
        snapshotUnitPrice: row.snapshotUnitPrice,
        buyerId: userId,
      }),
    );

    if (!product) continue;

    // Rental availability is re-checked here, not only when the line was added
    // to the cart: the window may have been booked by someone else since.
    if (mode === "RENT" && row.startDate && row.endDate) {
      try {
        await assertRentalAvailability(
          product.id,
          row.quantity,
          row.startDate,
          row.endDate,
          undefined,
          executor,
        );
      } catch (error) {
        if (error instanceof HttpError) {
          issues.push({
            code: "RENTAL_UNAVAILABLE",
            message: error.message,
            field: "rentalDuration",
          });
        } else {
          throw error;
        }
      }
    }

    const pricing = priceCartLine(product, mode, row.quantity, row.startDate, row.endDate);

    lines.push({
      cartItemId: row.cartItemId,
      productId: product.id,
      sellerId: product.sellerId,
      title: product.title,
      imageUrl: product.primaryImage,
      mode,
      quantity: row.quantity,
      startDate: toDateString(row.startDate),
      endDate: toDateString(row.endDate),
      rentalDays:
        mode === "RENT" && row.startDate && row.endDate
          ? rentalDays({ startDate: row.startDate, endDate: row.endDate })
          : null,
      listingType: product.listingType,
      pricing,
    });
  }

  if (lines.length === 0) throw new HttpError(400, "EMPTY_CART", "Your cart is empty.");

  /* --- 4. Roll the per-line numbers up into the amount owed. --------------- */
  const subtotal = lines.reduce((sum, l) => sum + l.pricing.lineTotal - l.pricing.depositTotal, 0);
  const rentalAmount = lines.reduce((sum, l) => sum + l.pricing.rentalCharge, 0);
  const securityDeposit = lines.reduce((sum, l) => sum + l.pricing.depositTotal, 0);
  const deliveryFee = deliveryMethod === "DELIVERY" ? DELIVERY_FEE_PAISE : 0;
  // No promotion engine in this feature. The columns exist so a discount can
  // be added without another migration, but an unearned discount must not be
  // expressible today, so both are fixed at zero here.
  const discount = 0;
  const tax = 0;

  const breakdown: CheckoutBreakdown = {
    subtotal,
    rentalAmount,
    securityDeposit,
    deliveryFee,
    discount,
    tax,
    grandTotal: subtotal + securityDeposit + deliveryFee - discount + tax,
    currency: CURRENCY,
  };

  if (lines.some((l) => l.sellerId === userId)) {
    issues.push({
      code: "OWN_LISTING",
      message: "You cannot order your own listing.",
    });
  }

  return {
    lines,
    breakdown,
    issues,
    isPayable: issues.length === 0 && lines.length > 0,
    deliveryMethod,
    deliveryAddressId: input.deliveryAddressId ?? null,
    deliveryAddress,
  };
}
