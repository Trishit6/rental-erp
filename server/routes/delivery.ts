import { Router } from "../lib/http";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  deliveries,
  deliveryServiceAreas,
  deliveryMethodsConfiguration,
  deliveryEvents,
  orders,
  users,
  addresses,
  orderItems,
} from "../schema";
import { ok, fail, HttpError } from "../lib/api";
import { generateReferenceNumber } from "../lib/reference-numbers";
import { notificationEventKey } from "../lib/notification-events";
import { notify } from "../lib/notifications";
import { guarded } from "../lib/rate-limit";
import { createMachine } from "../lib/delivery/state-machine";
import { requireDeliveryPartner } from "../lib/delivery/access";

export const deliveryRoute = new Router();

/* ------------------------------ list my deliveries ------------------------------ */
deliveryRoute.get("/", async (c) => {
  const user = c.get("user")!;

  const [rows] = await db
    .select({
      id: deliveries.id,
      deliveryNumber: deliveries.deliveryNumber,
      orderId: deliveries.orderId,
      deliveryMethod: deliveries.deliveryMethod,
      deliveryStatus: deliveries.deliveryStatus,
      deliveryFeePaise: deliveries.deliveryFeePaise,
      currency: deliveries.currency,
      estimatedDeliveryStart: deliveries.estimatedDeliveryStart,
      estimatedDeliveryEnd: deliveries.estimatedDeliveryEnd,
      scheduledDate: deliveries.scheduledDate,
      scheduledSlot: deliveries.scheduledSlot,
      trackingNumber: deliveries.trackingNumber,
      carrierName: deliveries.carrierName,
      dispatchAt: deliveries.dispatchAt,
      deliveredAt: deliveries.deliveredAt,
      deliveryInstructions: deliveries.deliveryInstructions,
      orderOrderNumber: orders.orderNumber,
      productTitle: orderItems.titleSnapshot,
      sellerName: users.name,
      createdAt: deliveries.createdAt,
    })
    .from(deliveries)
    .innerJoin(orders, eq(deliveries.orderId, orders.id))
    .innerJoin(users, eq(deliveries.sellerId, users.id))
    .leftJoin(orderItems, eq(deliveries.orderId, orderItems.orderId))
    .where(eq(orders.userId, user.id))
    .orderBy(desc(deliveries.createdAt))
    .limit(50);

  return ok(rows);
});

/* ------------------------------ one delivery ------------------------------ */
deliveryRoute.get("/:id", async (c) => {
  const user = c.get("user")!;
  const raw = c.req.param("id");

  const isDeliveryNumber = /^RV-DL-\d{4}-[A-Z0-9]{6}$/i.test(raw);
  const numericId = Number(raw);
  if (!isDeliveryNumber && (!Number.isInteger(numericId) || numericId <= 0)) {
    throw new HttpError(404, "NOT_FOUND", "Delivery not found.");
  }

  const identifier = isDeliveryNumber
    ? eq(deliveries.deliveryNumber, raw.toUpperCase())
    : eq(deliveries.id, numericId);

  const [row] = await db
    .select({
      id: deliveries.id,
      deliveryNumber: deliveries.deliveryNumber,
      orderId: deliveries.orderId,
      sellerId: deliveries.sellerId,
      customerId: deliveries.customerId,
      addressId: deliveries.addressId,
      deliveryMethod: deliveries.deliveryMethod,
      deliveryStatus: deliveries.deliveryStatus,
      deliveryFeePaise: deliveries.deliveryFeePaise,
      currency: deliveries.currency,
      estimatedDeliveryStart: deliveries.estimatedDeliveryStart,
      estimatedDeliveryEnd: deliveries.estimatedDeliveryEnd,
      scheduledDate: deliveries.scheduledDate,
      scheduledSlot: deliveries.scheduledSlot,
      trackingNumber: deliveries.trackingNumber,
      carrierName: deliveries.carrierName,
      dispatchAt: deliveries.dispatchAt,
      deliveredAt: deliveries.deliveredAt,
      deliveryInstructions: deliveries.deliveryInstructions,
      // Snapshot the address at purchase time
      addressName: addresses.name,
      addressPhone: addresses.phone,
      addressLine1: addresses.addressLine1,
      addressLine2: addresses.addressLine2,
      addressCity: addresses.city,
      addressState: addresses.state,
      addressPostalCode: addresses.postalCode,
      addressCountry: addresses.country,
      // Order info
      orderOrderNumber: orders.orderNumber,
      orderStatus: orders.status,
      orderPaymentStatus: orders.paymentStatus,
      // Product info (for multi-line orders, take the first item)
      productTitle: orderItems.titleSnapshot,
      productImage: orderItems.imageSnapshot,
      sellerName: users.name,
      sellerVerified: users.verified,
    })
    .from(deliveries)
    .innerJoin(orders, eq(deliveries.orderId, orders.id))
    .innerJoin(users, eq(deliveries.sellerId, users.id))
    .innerJoin(addresses, eq(deliveries.addressId, addresses.id))
    .leftJoin(orderItems, eq(deliveries.orderId, orderItems.orderId))
    .where(identifier)
    .limit(1);

  if (!row) throw new HttpError(404, "NOT_FOUND", "Delivery not found.");

  // Load delivery events
  const events = await db
    .select({
      id: deliveryEvents.id,
      status: deliveryEvents.status,
      description: deliveryEvents.description,
      location: deliveryEvents.location,
      eventTime: deliveryEvents.eventTime,
      createdBy: deliveryEvents.createdBy,
    })
    .from(deliveryEvents)
    .where(eq(deliveryEvents.deliveryId, row.id))
    .orderBy(deliveryEvents.eventTime);

  return ok({
    ...row,
    events,
  });
});

/* ------------------------------ create delivery (on order) ------------------------------ */
interface CreateDeliveryInput {
  deliveryMethod: "STANDARD" | "EXPRESS" | "SCHEDULED" | "PICKUP";
  addressId: number;
  deliveryInstructions?: string | null;
}

deliveryRoute.post(
  "/",
  guarded("checkout.order", async (c) => {
    const user = c.get("user")!;
    const input = (await c.req.json<CreateDeliveryInput>());

    // Determine the order from the request context or find the most recent active order
    const [recentOrder] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.userId, user.id))
      .orderBy(desc(orders.createdAt))
      .limit(1);

    if (!recentOrder) {
      throw new HttpError(404, "NO_ORDER", "No order found to associate delivery with.");
    }

    // Check if delivery already exists for this order
    const [existingDelivery] = await db
      .select({ id: deliveries.id })
      .from(deliveries)
      .where(eq(deliveries.orderId, recentOrder.id))
      .limit(1);

    if (existingDelivery) {
      throw new HttpError(409, "DELIVERY_EXISTS", "A delivery record already exists for this order.");
    }

    // Get the order items to determine the seller
    const [order] = await db
      .select({ sellerId: orderItems.sellerId })
      .from(orderItems)
      .where(eq(orderItems.orderId, recentOrder.id))
      .limit(1);

    // Get the delivery address
    const [address] = await db
      .select()
      .from(addresses)
      .where(eq(addresses.id, input.addressId))
      .limit(1);

    if (!address) {
      throw new HttpError(404, "ADDRESS_NOT_FOUND", "Delivery address not found.");
    }

    // Create the delivery record
    const deliveryNumber = generateReferenceNumber("DL");

    const [newDelivery] = await db
      .insert(deliveries)
      .values({
        deliveryNumber,
        orderId: recentOrder.id,
        sellerId: order?.sellerId ?? user.id,
        customerId: user.id,
        addressId: input.addressId,
        deliveryMethod: input.deliveryMethod,
        deliveryStatus: "PENDING",
        deliveryFeePaise: 0, // Will be computed on payment confirmation
        currency: "INR",
        estimatedDeliveryStart: null,
        estimatedDeliveryEnd: null,
        scheduledDate: null,
        scheduledSlot: null,
        trackingNumber: null,
        carrierName: null,
        dispatchAt: null,
        deliveredAt: null,
        deliveryInstructions: input.deliveryInstructions,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // Record the creation event
    await db
      .insert(deliveryEvents)
      .values({
        deliveryId: newDelivery.id,
        status: "PENDING",
        description: "Delivery record created for order",
        location: null,
        eventTime: new Date(),
        createdBy: "SYSTEM",
      });

    // Notify the customer
    await notify({
      userId: user.id,
      type: "DELIVERY_CREATED",
      title: "Delivery initiated",
      body: `Delivery has been initiated for order ${recentOrder.orderNumber}.`,
      context: { deliveryId: newDelivery.id, orderId: recentOrder.id },
      eventKey: notificationEventKey("DELIVERY_CREATED", newDelivery.id, user.id),
      link: `/deliveries/${newDelivery.deliveryNumber}`,
    });

    return ok({
      id: newDelivery.id,
      deliveryNumber: newDelivery.deliveryNumber,
      deliveryMethod: newDelivery.deliveryMethod,
      deliveryStatus: newDelivery.deliveryStatus,
    });
  }),
);

/* ------------------------------ update delivery status ------------------------------ */
interface UpdateDeliveryStatusInput {
  status: "PENDING" | "CONFIRMED" | "PREPARING" | "DISPATCHED" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "DELIVERY_FAILED" | "RETURN_TO_SENDER" | "CANCELLED";
  carrierName?: string | null;
  trackingNumber?: string | null;
}

deliveryRoute.post(
  "/:id/status",
  guarded("delivery.action", async (c) => {
    const user = c.get("user")!;
    const raw = c.req.param("id");

    const isDeliveryNumber = /^RV-DL-\d{4}-[A-Z0-9]{6}$/i.test(raw);
    const numericId = Number(raw);
    if (!isDeliveryNumber && (!Number.isInteger(numericId) || numericId <= 0)) {
      throw new HttpError(404, "NOT_FOUND", "Delivery not found.");
    }

    const identifier = isDeliveryNumber
      ? eq(deliveries.deliveryNumber, raw.toUpperCase())
      : eq(deliveries.id, numericId);

    const [delivery] = await db
      .select()
      .from(deliveries)
      .where(identifier)
      .limit(1);

    if (!delivery) throw new HttpError(404, "NOT_FOUND", "Delivery not found.");

    // Only the seller or admin can update delivery status
    const [order] = await db
      .select({ userId: orders.userId })
      .from(orders)
      .where(eq(orders.id, delivery.orderId))
      .limit(1);

    if (order.userId !== user.id && user.role !== "ADMIN") {
      throw new HttpError(403, "FORBIDDEN", "You are not authorized to update this delivery.");
    }

    const statusInput = z
      .object({
        status: z.enum([
          "PENDING",
          "CONFIRMED",
          "PREPARING",
          "DISPATCHED",
          "IN_TRANSIT",
          "OUT_FOR_DELIVERY",
          "DELIVERED",
          "DELIVERY_FAILED",
          "RETURN_TO_SENDER",
          "CANCELLED",
        ]),
        carrierName: z.string().optional(),
        trackingNumber: z.string().optional(),
      })
      .parse(await c.req.json());

    const now = new Date();

    // Validate status transition
    const validTransitions: Record<string, string[]> = {
      PENDING: ["CONFIRMED", "CANCELLED"],
      CONFIRMED: ["PREPARING", "CANCELLED"],
      PREPARING: ["DISPATCHED", "CANCELLED"],
      DISPATCHED: ["IN_TRANSIT", "CANCELLED"],
      IN_TRANSIT: ["OUT_FOR_DELIVERY", "CANCELLED"],
      OUT_FOR_DELIVERY: ["DELIVERED", "DELIVERY_FAILED", "RETURN_TO_SENDER", "CANCELLED"],
      DELIVERED: [], // terminal
      DELIVERY_FAILED: ["RETURN_TO_SENDER", "CANCELLED"],
      RETURN_TO_SENDER: ["CANCELLED"],
      CANCELLED: [], // terminal
    };

    const currentStatus = delivery.deliveryStatus;
    const allowedNext = validTransitions[currentStatus] ?? [];

    if (!allowedNext.includes(statusInput.status)) {
      throw new HttpError(
        409,
        "INVALID_TRANSITION",
        `Cannot transition from "${currentStatus}" to "${statusInput.status}".`,
      );
    }

    await db
      .update(deliveries)
      .set({
        deliveryStatus: statusInput.status,
        carrierName: statusInput.carrierName ?? delivery.carrierName,
        trackingNumber: statusInput.trackingNumber ?? delivery.trackingNumber,
        updatedAt: now,
      })
      .where(identifier);

    // Record the event
    await db
      .insert(deliveryEvents)
      .values({
        deliveryId: delivery.id,
        status: statusInput.status,
        description: `Delivery status updated to ${statusInput.status}`,
        location: null,
        eventTime: now,
        createdBy: user.id !== order.userId ? "SELLER" : "SYSTEM",
      });

    // Notify relevant parties
    if (statusInput.status === "DISPATCHED") {
      await notify({
        userId: order.userId,
        type: "DELIVERY_DISPATCHED",
        title: "Delivery dispatched",
        body: `Your delivery has been dispatched.`,
        context: { deliveryId: delivery.id, orderId: delivery.orderId },
        eventKey: notificationEventKey("DELIVERY_DISPATCHED", delivery.id, order.userId),
        link: `/deliveries/${delivery.deliveryNumber}`,
      });
    }

    if (statusInput.status === "DELIVERED") {
      await notify({
        userId: order.userId,
        type: "DELIVERY_DELIVERED",
        title: "Delivery delivered",
        body: `Your delivery has been delivered.`,
        context: { deliveryId: delivery.id, orderId: delivery.orderId },
        eventKey: notificationEventKey("DELIVERY_DELIVERED", delivery.id, order.userId),
        link: `/deliveries/${delivery.deliveryNumber}`,
      });
    }

    if (statusInput.status === "DELIVERY_FAILED") {
      await notify({
        userId: order.userId,
        type: "DELIVERY_FAILED",
        title: "Delivery failed",
        body: `Your delivery could not be delivered.`,
        context: { deliveryId: delivery.id, orderId: delivery.orderId },
        eventKey: notificationEventKey("DELIVERY_FAILED", delivery.id, order.userId),
        link: `/deliveries/${delivery.deliveryNumber}`,
      });
    }

    return ok({
      id: delivery.id,
      deliveryStatus: delivery.deliveryStatus,
    });
  }),
);

/* ------------------------------ list delivery events ------------------------------ */
deliveryRoute.get("/:id/events", async (c) => {
  const user = c.get("user")!;
  const raw = c.req.param("id");

  const isDeliveryNumber = /^RV-DL-\d{4}-[A-Z0-9]{6}$/i.test(raw);
  const numericId = Number(raw);
  if (!isDeliveryNumber && (!Number.isInteger(numericId) || numericId <= 0)) {
    throw new HttpError(404, "NOT_FOUND", "Delivery not found.");
  }

  const identifier = isDeliveryNumber
    ? eq(deliveries.deliveryNumber, raw.toUpperCase())
    : eq(deliveries.id, numericId);

  // Verify ownership
  const [delivery] = await db
    .select({ orderId: deliveries.orderId })
    .from(deliveries)
    .where(identifier)
    .limit(1);

  const [order] = await db
    .select({ userId: orders.userId })
    .from(orders)
    .where(eq(orders.id, delivery.orderId))
    .limit(1);

  if (order.userId !== user.id && user.role !== "ADMIN") {
    throw new HttpError(403, "FORBIDDEN", "You are not authorized to view these events.");
  }

  const events = await db
    .select({
      id: deliveryEvents.id,
      status: deliveryEvents.status,
      description: deliveryEvents.description,
      location: deliveryEvents.location,
      eventTime: deliveryEvents.eventTime,
      createdBy: deliveryEvents.createdBy,
    })
    .from(deliveryEvents)
    .where(eq(deliveryEvents.deliveryId, delivery.id))
    .orderBy(deliveryEvents.eventTime);

  return ok(events);
});

/* ------------------------------ configure delivery methods (admin) ------------------------------ */
interface CreateDeliveryMethodInput {
  key: string;
  method: "STANDARD" | "EXPRESS" | "SCHEDULED" | "PICKUP";
  isActive?: boolean;
  baseFeePaise?: number;
  estimatedHandlingDays?: number;
  expressSurchargePaise?: number;
  schedulingAvailable?: boolean;
  maxAdvanceDays?: number;
  eligibilityRules?: string;
  sortOrder?: number;
}

deliveryRoute.post(
  "/admin/methods",
  guarded("admin.action", async (c) => {
    const admin = c.get("user")!;
    if (admin.role !== "ADMIN") {
      throw new HttpError(403, "FORBIDDEN", "Admin access required.");
    }

    const input = (await c.req.json<CreateDeliveryMethodInput>());

    const [existing] = await db
      .select({ id: deliveryMethodsConfiguration.id })
      .from(deliveryMethodsConfiguration)
      .where(eq(deliveryMethodsConfiguration.key, input.key))
      .limit(1);

    if (existing) {
      // Update
      await db
        .update(deliveryMethodsConfiguration)
        .set({
          isActive: input.isActive ?? deliveryMethodsConfiguration.is_active,
          method: input.method ?? deliveryMethodsConfiguration.method,
          baseFeePaise: input.baseFeePaise ?? deliveryMethodsConfiguration.baseFeePaise,
          estimatedHandlingDays: input.estimatedHandlingDays ?? deliveryMethodsConfiguration.estimatedHandlingDays,
          expressSurchargePaise: input.expressSurchargePaise ?? deliveryMethodsConfiguration.expressSurchargePaise,
          schedulingAvailable: input.schedulingAvailable ?? deliveryMethodsConfiguration.schedulingAvailable,
          maxAdvanceDays: input.maxAdvanceDays ?? deliveryMethodsConfiguration.maxAdvanceDays,
          eligibilityRules: input.eligibilityRules ?? deliveryMethodsConfiguration.eligibilityRules,
          sortOrder: input.sortOrder ?? deliveryMethodsConfiguration.sortOrder,
          updatedAt: new Date(),
        })
        .where(eq(deliveryMethodsConfiguration.id, existing.id));
    } else {
      // Create
      const methodKey = input.key || input.method?.toLowerCase() || "standard";

      const [newMethod] = await db
        .insert(deliveryMethodsConfiguration)
        .values({
          key: methodKey,
          method: input.method || "STANDARD",
          isActive: input.isActive ?? true,
          baseFeePaise: input.baseFeePaise ?? 4900,
          estimatedHandlingDays: input.estimatedHandlingDays ?? 3,
          expressSurchargePaise: input.expressSurchargePaise ?? 2900,
          schedulingAvailable: input.schedulingAvailable ?? false,
          maxAdvanceDays: input.maxAdvanceDays ?? 30,
          eligibilityRules: input.eligibilityRules ?? "{}",
          sortOrder: input.sortOrder ?? 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Notify admins
      await notify({
        userId: admin.id,
        type: "DELIVERY_METHOD_CREATED",
        title: "New delivery method configured",
        body: `New delivery method "${input.method || "STANDARD"}" has been configured.`,
        context: { deliveryMethodId: newMethod.id },
        eventKey: notificationEventKey("DELIVERY_METHOD_CREATED", newMethod.id, admin.id),
        link: `/admin/delivery-methods`,
      });
    }

    return ok({ success: true });
  }),
);

/* ------------------------------ list delivery methods (admin) ------------------------------ */
deliveryRoute.get(
  "/admin/methods",
  guarded("admin.action", async (c) => {
    const admin = c.get("user")!;
    if (admin.role !== "ADMIN") {
      throw new HttpError(403, "FORBIDDEN", "Admin access required.");
    }

    const methods = await db
      .select()
      .from(deliveryMethodsConfiguration)
      .orderBy(deliveryMethodsConfiguration.sortOrder, asc(deliveryMethodsConfiguration.key));

    return ok(methods);
  }),
);

/* ------------------------------ manage service areas (admin) ------------------------------ */
interface CreateServiceAreaInput {
  name: string;
  postalCodes: string;
  isActive?: boolean;
}

deliveryRoute.post(
  "/admin/service-areas",
  guarded("admin.action", async (c) => {
    const admin = c.get("user")!;
    if (admin.role !== "ADMIN") {
      throw new HttpError(403, "FORBIDDEN", "Admin access required.");
    }

    const input = (await c.req.json<CreateServiceAreaInput>());

    // Check if area already exists
    const [existing] = await db
      .select({ id: deliveryServiceAreas.id })
      .from(deliveryServiceAreas)
      .where(eq(deliveryServiceAreas.name, input.name))
      .limit(1);

    if (existing) {
      await db
        .update(deliveryServiceAreas)
        .set({
          postalCodes: input.postalCodes,
          isActive: input.isActive ?? deliveryServiceAreas.is_active,
          updatedAt: new Date(),
        })
        .where(eq(deliveryServiceAreas.id, existing.id));
    } else {
      const [newArea] = await db
        .insert(deliveryServiceAreas)
        .values({
          name: input.name,
          postalCodes: input.postalCodes,
          isActive: input.isActive ?? true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
    }

    return ok({ success: true });
  }),
);

/* ------------------------------ list service areas (admin) ------------------------------ */
deliveryRoute.get(
  "/admin/service-areas",
  guarded("admin.action", async (c) => {
    const admin = c.get("user")!;
    if (admin.role !== "ADMIN") {
      throw new HttpError(403, "FORBIDDEN", "Admin access required.");
    }

    const areas = await db
      .select()
      .from(deliveryServiceAreas)
      .orderBy(deliveryServiceAreas.name);

    return ok(areas);
  }),
);