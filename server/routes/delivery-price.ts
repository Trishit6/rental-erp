import { Router } from "../lib/http";
import { z } from "zod";
import { db } from "../db";
import { deliveries, orders, users, addresses, products, orderItems } from "../schema";
import { ok, fail, HttpError } from "../lib/api";
import { requireAuth } from "../lib/auth";
import { PUBLIC_PRODUCT_STATUSES } from "./admin";

interface DeliveryPriceInput {
  deliveryMethod: "STANDARD" | "EXPRESS" | "SCHEDULED" | "PICKUP" | "RENTER_RETURN";
  addressId: number;
}

interface DeliveryPriceQuote {
  deliveryFeePaise: number;
  currency: string;
  estimatedDeliveryStart: string | null;
  estimatedDeliveryEnd: string | null;
  message?: string | null;
}

function calculateBaseFee(deliveryMethod: string): number {
  const fees: Record<string, number> = {
    STANDARD: 4900,  // ₹49.00
    EXPRESS: 9900,   // ₹99.00
    SCHEDULED: 7900, // ₹79.00
    PICKUP: 0,
    RENTER_RETURN: 0,
  };
  return fees[deliveryMethod] || 0;
}

function estimateDeliveryDate(deliveryMethod: string): { start: string | null; end: string | null } {
  const now = new Date();
  const handlingDays: Record<string, number> = {
    STANDARD: 3,
    EXPRESS: 1,
    SCHEDULED: 5,
    PICKUP: 0,
    RENTER_RETURN: 0,
  };
  const days = handlingDays[deliveryMethod] || 0;
  const start = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 2 * 24 * 60 * 60 * 1000); // 2-day window
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

export const deliveryPriceRoute = new Router();

deliveryPriceRoute.post(
  "/",
  requireAuth,
  guarded("delivery.price", async (c) => {
    const user = c.get("user")!;
    const input = await c.req.json<DeliveryPriceInput>();

    // Get the address
    const [address] = await db
      .select()
      .from(addresses)
      .where(eq(addresses.id, input.addressId))
      .limit(1);

    if (!address) {
      throw new HttpError(404, "ADDRESS_NOT_FOUND", "Delivery address not found.");
    }

    // Get the most recent active order
    const [recentOrder] = await db
      .select({ id: orders.id, sellerId: orders.sellerId })
      .from(orders)
      .where(eq(orders.userId, user.id))
      .orderBy(desc(orders.createdAt))
      .limit(1);

    if (!recentOrder) {
      // No order, return default price
      const { start, end } = estimateDeliveryDate(input.deliveryMethod);
      return ok({
        deliveryFeePaise: calculateBaseFee(input.deliveryMethod),
        currency: "INR",
        estimatedDeliveryStart: start,
        estimatedDeliveryEnd: end,
        message: "No active order found - using default rates.",
      });
    }

    // Get the order item to check product
    const [orderItem] = await db
      .select({ productId: orderItems.productId, sellerId: orderItems.sellerId })
      .from(orderItems)
      .where(eq(orderItems.orderId, recentOrder.id))
      .limit(1);

    if (!orderItem) {
      const { start, end } = estimateDeliveryDate(input.deliveryMethod);
      return ok({
        deliveryFeePaise: calculateBaseFee(input.deliveryMethod),
        currency: "INR",
        estimatedDeliveryStart: start,
        estimatedDeliveryEnd: end,
        message: "No items in order - using default rates.",
      });
    }

    // Check product availability
    const [productRow] = await db
      .select({ status: products.status, listingType: products.listingType })
      .from(products)
      .where(eq(products.id, orderItem.productId))
      .limit(1);

    if (!productRow) {
      const { start, end } = estimateDeliveryDate(input.deliveryMethod);
      return ok({
        deliveryFeePaise: calculateBaseFee(input.deliveryMethod),
        currency: "INR",
        estimatedDeliveryStart: start,
        estimatedDeliveryEnd: end,
        message: "Product not found - using default rates.",
      });
    }

    // Check if product status is public
    if (!PUBLIC_PRODUCT_STATUSES.includes(productRow.status as any)) {
      return ok({
        deliveryFeePaise: 0,
        currency: "INR",
        estimatedDeliveryStart: null,
        estimatedDeliveryEnd: null,
        message: "Product is not available for delivery.",
      });
    }

    // Calculate fee based on method
    const baseFee = calculateBaseFee(input.deliveryMethod);

    // For delivery methods, add any surcharges based on product type
    let fee = baseFee;
    let message: string | null = null;

    if (input.deliveryMethod === "STANDARD" || input.deliveryMethod === "EXPRESS") {
      // Standard/express delivery has base fee
      fee = baseFee;
    } else if (input.deliveryMethod === "PICKUP") {
      fee = 0;
      message = "Free pickup available";
    } else if (input.deliveryMethod === "SCHEDULED") {
      fee = baseFee; // Same base, but with scheduling
      message = "Scheduled delivery available";
    } else if (input.deliveryMethod === "RENTER_RETURN") {
      fee = 0;
      message = "Return shipping is free";
    }

    const { start, end } = estimateDeliveryDate(input.deliveryMethod);

    return ok({
      deliveryFeePaise: fee,
      currency: "INR",
      estimatedDeliveryStart: start,
      estimatedDeliveryEnd: end,
      message,
    });
  }),
);