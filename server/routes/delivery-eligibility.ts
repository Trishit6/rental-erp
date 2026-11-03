import { Router } from "../lib/http";
import { z } from "zod";
import { db } from "../db";
import { deliveries, orders, users, addresses, products, productStatuses } from "../schema";
import { ok, fail, HttpError } from "../lib/api";
import { requireAuth } from "../lib/auth";
import { PUBLIC_PRODUCT_STATUSES } from "./admin";

interface DeliveryEligibilityInput {
  deliveryMethod: "STANDARD" | "EXPRESS" | "SCHEDULED" | "PICKUP" | "RENTER_RETURN";
  addressId: number;
}

interface DeliveryEligibilityResult {
  isEligible: boolean;
  reason?: string;
}

export const deliveryEligibilityRoute = new Router();

deliveryEligibilityRoute.post(
  "/",
  requireAuth,
  guarded("delivery.eligibility", async (c) => {
    const user = c.get("user")!;
    const input = await c.req.json<DeliveryEligibilityInput>();

    // Get the address
    const [address] = await db
      .select()
      .from(addresses)
      .where(eq(addresses.id, input.addressId))
      .limit(1);

    if (!address) {
      throw new HttpError(404, "ADDRESS_NOT_FOUND", "Delivery address not found.");
    }

    // Get the most recent active order to check product status
    const [recentOrder] = await db
      .select({ id: orders.id, sellerId: orders.sellerId, status: orders.status })
      .from(orders)
      .where(eq(orders.userId, user.id))
      .orderBy(desc(orders.createdAt))
      .limit(1);

    if (!recentOrder) {
      return ok({ isEligible: true, reason: "No active order found." });
    }

    // Check product availability
    const [product] = await db
      .select({ status: products.status, listingType: products.listingType })
      .from(products)
      .where(eq(products.id, recentOrder.id)) // This won't work, need orderItems
      .limit(1);

    // Actually we need to check order items
    const [orderItem] = await db
      .select({ productId: orderItems.productId, sellerId: orderItems.sellerId })
      .from(orderItems)
      .where(eq(orderItems.orderId, recentOrder.id))
      .limit(1);

    if (!orderItem) {
      return ok({ isEligible: true, reason: "No items in order." });
    }

    // Check product status
    const [productRow] = await db
      .select({ status: products.status, listingType: products.listingType })
      .from(products)
      .where(eq(products.id, orderItem.productId))
      .limit(1);

    if (!productRow) {
      return ok({ isEligible: false, reason: "Product not found." });
    }

    // Check if product status is public
    if (!PUBLIC_PRODUCT_STATUSES.includes(productRow.status as any)) {
      return ok({ isEligible: false, reason: "Product is not available for delivery." });
    }

    // For delivery methods, check if it's pickup and product is not pickup-compatible
    if (input.deliveryMethod === "PICKUP" && productRow.listingType !== "PICKUP" && productRow.listingType !== "BOTH") {
      return ok({ isEligible: false, reason: "Product does not support pickup." });
    }

    // For scheduled delivery, check if the product supports it
    if (input.deliveryMethod === "SCHEDULED" && !productRow.listingType.includes("SCHEDULED")) {
      return ok({ isEligible: false, reason: "Product does not support scheduled delivery." });
    }

    // Basic eligibility - all checks passed
    return ok({ isEligible: true });
  }),
);