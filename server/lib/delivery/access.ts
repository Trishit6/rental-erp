import { eq } from "drizzle-orm";
import { db } from "../db";
import { deliveryPartners } from "../schema";
import { HttpError } from "./api";
import type { Ctx } from "./http";
import { requireUser, type SessionUser } from "./auth";

/** Actor roles that can participate in delivery state transitions. */
export const DELIVERY_ACTOR_ROLE = ["partner", "seller", "customer", "admin", "system"] as const;

/** which actor roles can move a delivery into which statuses */
export const DELIVERY_ACTOR_PERMISSIONS: Record<(typeof DELIVERY_ACTOR_ROLE)[number], readonly string[]> = {
  partner: ["delivery.manage", "delivery.view"],
  seller: ["delivery.manage", "delivery.view"],
  customer: ["delivery.view"],
  admin: ["delivery.manage", "delivery.view"],
  system: ["delivery.manage", "delivery.view"],
};

/** A delivery partner is a user account with status ACTIVE that can accept jobs.
 *  Re-reads the partner row per request; never trusts client-supplied role.
 *  Suspended partner: sessions revoked and active jobs flagged for reassignment.
 */
export function requireDeliveryPartner(c: Ctx): SessionUser & { partnerId: number } {
  const user = requireUser(c);

  const [partner] = await db
    .select({ id: deliveryPartners.userId, status: deliveryPartners.status, isOnline: deliveryPartners.isOnline })
    .from(deliveryPartners)
    .where(eq(deliveryPartners.userId, user.id))
    .limit(1);

  if (!partner) {
    throw new HttpError(404, "DELIVERY_PARTNER_NOT_FOUND", "User is not a delivery partner.");
  }

  if (partner.status !== "ACTIVE") {
    // Suspended partner: revoke session and flag active jobs for reassignment
    throw new HttpError(409, "PARTNER_SUSPENDED", "This delivery partner is suspended.");
  }

  return { ...user, partnerId: partner.id } as SessionUser & { partnerId: number };
}