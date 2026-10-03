import { eq } from "drizzle-orm";
import { db } from "../db";
import { sellerProfiles } from "../schema";
import { HttpError } from "./api";
import type { Ctx } from "./http";
import { requireUser, type SessionUser } from "./auth";

/**
 * Seller authorization.
 *
 * ## Why this exists at all
 *
 * Until now `/api/seller/*` was gated on `requireUser` alone, and creating a
 * product silently promoted the caller's `users.role` to `SELLER`. That made
 * "become a seller" an invisible side effect of a different action: nobody chose
 * it, nothing announced it, and there was no point at which a customer could see
 * that they were now a seller and opt out of it. It also meant no route could
 * distinguish a seller from a customer, because by the time anyone asked, every
 * customer who had ever listed had been promoted.
 *
 * So seller status is now **explicit and separate**:
 *
 *  - `users.role` is the authorization answer, set by onboarding and only by
 *    onboarding.
 *  - `seller_profiles` is the seller's public shopfront data, created in the same
 *    transaction so the two can never disagree.
 *
 * ## Why the guard is `role`-based and not "has listings"
 *
 * "Has a product row" would let any customer keep selling after an admin
 * demoted them, and would make `/seller` unreachable for a brand-new seller —
 * the one person who most needs the dashboard. The role is the durable,
 * auditable answer.
 *
 * ## Why `ADMIN` passes
 *
 * Admins moderate the whole marketplace and already read every seller surface.
 * Making them a 403 here would buy nothing and break the admin tools.
 */
export const SELLER_ROLES = ["SELLER", "ADMIN"] as const;

export function isSellerRole(role: string | null | undefined): boolean {
  return !!role && (SELLER_ROLES as readonly string[]).includes(role);
}

/**
 * Gate a seller endpoint.
 *
 * `403 SELLER_REQUIRED` rather than `401`: the caller *is* authenticated, they
 * are simply not a seller yet. The code is branchable, so the client can offer
 * "Become a seller" instead of a dead end.
 */
export function requireSeller(c: Ctx): SessionUser {
  const user = requireUser(c);
  if (!isSellerRole(user.role)) {
    throw new HttpError(
      403,
      "SELLER_REQUIRED",
      "Finish setting up your seller profile to use this.",
    );
  }
  return user;
}

/**
 * What onboarding status looks like to the client.
 *
 * `hasProfile` is reported separately from `isSeller` because the two can
 * legitimately disagree: a seller created before this flow existed has a role
 * and no profile row. The dashboard treats that as "finish your shopfront"
 * rather than as an error, and the settings page can create the missing row.
 */
export type SellerStatus = {
  isSeller: boolean;
  hasProfile: boolean;
  profile: {
    bio: string | null;
    location: string | null;
    responseRateHours: number | null;
  } | null;
};

export async function getSellerStatus(user: SessionUser): Promise<SellerStatus> {
  const [profile] = await db
    .select({
      bio: sellerProfiles.bio,
      location: sellerProfiles.location,
      responseRateHours: sellerProfiles.responseRateHours,
    })
    .from(sellerProfiles)
    .where(eq(sellerProfiles.userId, user.id))
    .limit(1);

  return {
    isSeller: isSellerRole(user.role),
    hasProfile: !!profile,
    profile: profile ?? null,
  };
}
