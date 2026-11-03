import { Router } from "../lib/http";
import { z } from "zod";
import { db } from "../db";
import { deliveries, orders, users, addresses, products, orderItems } from "../schema";
import { ok, fail, HttpError } from "../lib/api";
import { requireAuth } from "../lib/auth";
import { PUBLIC_PRODUCT_STATUSES } from "./admin";

interface DeliveryEstimateInput {
  deliveryMethod: "STANDARD" | "EXPRESS" | "SCHEDULED" | "PICKUP" | "RENTER_RETURN";
  addressId: number;
}

interface DeliveryEstimateResult {
  estimatedDeliveryStart: string | null;
  estimatedDeliveryEnd: string | null;
  scheduledDate: string | null;
  scheduledSlot: string | null;
}

function calculateHandlingDays(deliveryMethod: string): number {
  const days: Record<string, number> = {
    STANDARD: 3,
    EXPRESS: 1,
    SCHEDULED: 5,
    PICKUP: 0,
    RENTER_RETURN: 0,
  };
  return days[deliveryMethod] || 0;
}

function formatDate(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date.toISOString().split('T')[0];
}

export const deliveryEstimateRoute = new Router();

deliveryEstimateRoute.post(
  "/",
  requireAuth,
  guarded("delivery.estimate", async (c) => {
    const user = c.get("user")!;
    const input = await c.req.json<DeliveryEstimateInput>();

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
      // No order - return default estimates
      const handlingDays = calculateHandlingDays(input.deliveryMethod);
      const now = new Date();
      const start = new Date(now.getTime() + handlingDays * 24 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 3 * 24 * 60 * 60 * 1000);
      return ok({
        estimatedDeliveryStart: start.toISOString().split('T')[0],
        estimatedDeliveryEnd: end.toISOString().split('T')[0],
        scheduledDate: null,
        scheduledSlot: null,
      });
    }

    // Get the order item to check product
    const [orderItem] = await db
      .select({ productId: orderItems.productId })
      .from(orderItems)
      .where(eq(orderItems.orderId, recentOrder.id))
      .limit(1);

    if (!orderItem) {
      // No items - return default estimates
      const handlingDays = calculateHandlingDays(input.deliveryMethod);
      const now = new Date();
      const start = new Date(now.getTime() + handlingDays * 24 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 3 * 24 * 60 * 60 * 1000);
      return ok({
        estimatedDeliveryStart: start.toISOString().split('T')[0],
        estimatedDeliveryEnd: end.toISOString().split('T')[0],
        scheduledDate: null,
        scheduledSlot: null,
      });
    }

    // Check product availability
    const [productRow] = await db
      .select({ status: products.status, listingType: products.listingType })
      .from(products)
      .where(eq(products.id, orderItem.productId))
      .limit(1);

    if (!productRow) {
      // Product not found - return default estimates
      const handlingDays = calculateHandlingDays(input.deliveryMethod);
      const now = new Date();
      const start = new Date(now.getTime() + handlingDays * 24 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 3 * 24 * 60 * 60 * 1000);
      return ok({
        estimatedDeliveryStart: start.toISOString().split('T')[0],
        estimatedDeliveryEnd: end.toISOString().split('T')[0],
        scheduledDate: null,
        scheduledSlot: null,
      });
    }

    // Check if product status is public
    if (!PUBLIC_PRODUCT_STATUSES.includes(productRow.status as any)) {
      return ok({
        estimatedDeliveryStart: null,
        estimatedDeliveryEnd: null,
        scheduledDate: null,
        scheduledSlot: null,
        message: "Product is not available for delivery.",
      });
    }

    // Calculate delivery dates based on method
    const handlingDays = calculateHandlingDays(input.deliveryMethod);
    const now = new Date();
    const start = new Date(now.getTime() + handlingDays * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 3 * 24 * 60 * 60 * 1000); // 3-day window

    let scheduledDate: string | null = null;
    let scheduledSlot: string | null = null;

    // Schedule-specific logic
    if (input.deliveryMethod === "SCHEDULED") {
      // Schedule for 7-14 days out
      const scheduleDays = 7 + Math.floor(Math.random() * 7); // 7-14 days
      const scheduleDate = new Date(now.getTime() + scheduleDays * 24 * 60 * 60 * 1000);
      scheduledDate = scheduleDate.toISOString().split('T')[0];
      // Generate a slot time
      const hour = 9 + Math.floor(Math.random() * 8); // 9-16
      scheduledSlot = `${hour}:00`;
    }

    return ok({
      estimatedDeliveryStart: start.toISOString().split('T')[0],
      estimatedDeliveryEnd: end.toISOString().split('T')[0],
      scheduledDate,
      scheduledSlot,
    });
  }),
);