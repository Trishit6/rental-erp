import type { db } from "../db";
import { notificationEventKey } from "./notification-events";
import { notify } from "./notifications";

/**
 * The one place an order status becomes a customer notification.
 *
 * ## Why this is shared, not copied
 *
 * An admin moving an order and a seller fulfilling their lines are the same event
 * from the customer's point of view: their order moved. Before this module each
 * writer that needed to say so carried its own status→type map and its own copy,
 * and the two drifted — `READY_FOR_PICKUP` was once folded into `ORDER_PROCESSING`
 * on the reasoning that one umbrella type per stage was tidier, which told a
 * customer their pickup was "being prepared" and left `ORDER_READY_FOR_PICKUP`
 * declared with no emitter. The map lives here now, so a status added in one
 * place cannot be announced with different words somewhere else.
 *
 * ## The discriminator is mandatory when several writers can act
 *
 * `notifications.event_key` is globally unique, so two callers passing the same
 * key collapse to one row. In a multi-seller order, Seller A shipping and Seller
 * B shipping are two events on one order id — so any caller that is not the sole
 * writer for an order passes a `discriminator` (the actor's id). The default
 * (no discriminator) is for the paths where exactly one writer owns the order.
 */

type NotificationExecutor = Pick<typeof db, "insert" | "select">;

/**
 * Which status change tells the customer something, and as what.
 *
 * `PENDING_PAYMENT` and `CANCELLED` are deliberately absent: they are announced by
 * the payment and cancellation paths, which is where they actually originate, and
 * announcing them here too would be the same event with two keys.
 */
export const ORDER_STATUS_NOTIFICATION: Record<string, string> = {
  CONFIRMED: "ORDER_CONFIRMED",
  PROCESSING: "ORDER_PROCESSING",
  READY_FOR_PICKUP: "ORDER_READY_FOR_PICKUP",
  SHIPPED: "ORDER_SHIPPED",
  DELIVERED: "ORDER_DELIVERED",
  COMPLETED: "ORDER_COMPLETED",
};

export const ORDER_STATUS_BODY: Record<string, string> = {
  CONFIRMED: "Your order {number} has been confirmed and is being prepared.",
  PROCESSING: "Your order {number} is being prepared.",
  READY_FOR_PICKUP: "Your order {number} is ready for collection.",
  SHIPPED: "Your order {number} has been shipped.",
  DELIVERED: "Your order {number} has been delivered.",
  COMPLETED: "Your order {number} is complete. Thanks for shopping with Revaro.",
};

/** `READY_FOR_PICKUP` → `ready for pickup`, for use inside a sentence. */
export function orderStatusLabel(status: string): string {
  return status.replaceAll("_", " ").toLowerCase();
}

/**
 * Tell the customer their order moved. A no-op for a status nobody hears about,
 * so a caller can pass any status without first asking whether it is announced.
 */
export async function notifyOrderProgress(
  executor: NotificationExecutor,
  input: {
    orderId: number;
    orderNumber: string | null;
    userId: number;
    status: string;
    /** The actor's id when more than one writer can announce this order. */
    discriminator?: string | number;
  },
): Promise<boolean> {
  const type = ORDER_STATUS_NOTIFICATION[input.status];
  const body = ORDER_STATUS_BODY[input.status];
  if (!type || !body) return false;

  const number = input.orderNumber ?? `#${input.orderId}`;
  return notify(executor, {
    userId: input.userId,
    type,
    title: `Order ${number} is ${orderStatusLabel(input.status)}`,
    body: body.replace("{number}", number),
    context: { orderId: input.orderId, orderNumber: input.orderNumber },
    eventKey: notificationEventKey(type, input.orderId, input.discriminator),
  });
}
