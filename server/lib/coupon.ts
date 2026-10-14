import { and, count, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { couponRedemptions, coupons, type Coupon } from "../schema";
import { HttpError } from "./api";
import { formatInr } from "../../src/lib/pricing";

/**
 * The coupon engine (PROMPT 31, shopper side).
 *
 * ## One function decides what a code is worth, and it is not the browser
 *
 * `resolveCouponForCart` is the only place a code is validated against a cart and
 * a discount is computed. Checkout calls it to *display* a discount; order
 * creation calls it again, inside the order transaction, to *charge* one. Because
 * both call the same function against the same rows, the number a customer sees
 * cannot drift from the number they pay — the failure that matters most here is
 * the two disagreeing.
 *
 * ## A discount is clamped to the money it is allowed to touch
 *
 * A coupon may only discount the *charge*; the refundable deposit is excluded
 * unless the coupon explicitly allows it. Even then the discount can never exceed
 * the amount owed, so a coupon can never make a total negative or hand back more
 * than was charged.
 *
 * ## Redemption is a write, and it lives in the order's transaction
 *
 * `redeemCoupon` increments the denormalised counter and inserts the append-only
 * redemption row inside the same transaction that creates the order. The unique
 * `(coupon_id, order_id)` index is what makes a retried checkout redeem once, and
 * a guarded increment is what stops a race from admitting one redemption past the
 * coupon's limit.
 */

/** The per-line facts the engine reads; deliberately decoupled from `CheckoutLine`. */
export type CouponLine = {
  productId: number;
  sellerId: number;
  categoryId: number;
  /** This line's charge (purchase price or rental charge), excluding any deposit. */
  charge: number;
  /** This line's refundable deposit. Zero for a purchase. */
  deposit: number;
};

export type CouponEvaluation =
  | { ok: true; discountPaise: number }
  | { ok: false; message: string };

/** Spend the coupon is allowed to discount, split charge vs. deposit. */
export type ScopedAmounts = { scopedCharge: number; scopedDeposit: number };

/**
 * Add up the cart lines a coupon actually applies to.
 *
 * `ALL` matches everything; `CATEGORY`/`SELLER`/`PRODUCT` match one field. A
 * scoped coupon whose target is not in the cart has a scoped base of zero — the
 * caller reports that as "doesn't apply to anything in your cart" rather than
 * silently discounting nothing and looking broken.
 */
export function scopedAmounts(
  coupon: Pick<Coupon, "appliesTo" | "categoryId" | "sellerId" | "productId">,
  lines: readonly CouponLine[],
): ScopedAmounts {
  const matches = (line: CouponLine): boolean => {
    switch (coupon.appliesTo) {
      case "CATEGORY":
        return coupon.categoryId != null && line.categoryId === coupon.categoryId;
      case "SELLER":
        return coupon.sellerId != null && line.sellerId === coupon.sellerId;
      case "PRODUCT":
        return coupon.productId != null && line.productId === coupon.productId;
      default:
        return true;
    }
  };

  let scopedCharge = 0;
  let scopedDeposit = 0;
  for (const line of lines) {
    if (!matches(line)) continue;
    scopedCharge += line.charge;
    scopedDeposit += line.deposit;
  }
  return { scopedCharge, scopedDeposit };
}

/**
 * The discount, in paise, clamped so it can never exceed the money the coupon is
 * allowed to touch nor the amount owed.
 *
 * `PERCENT` bound is basis points (10000 = 100%). `maxDiscountPaise` caps only a
 * percentage. `orderTotal` is the pre-discount total the customer would pay
 * (charge + deposit), so the returned discount can never push it below zero.
 */
export function computeCouponDiscount(
  coupon: Pick<Coupon, "discountType" | "discountValue" | "maxDiscountPaise" | "allowDepositDiscount">,
  amounts: ScopedAmounts & { orderTotal: number },
): number {
  const base = coupon.allowDepositDiscount
    ? amounts.scopedCharge + amounts.scopedDeposit
    : amounts.scopedCharge;
  if (base <= 0) return 0;

  let discount =
    coupon.discountType === "PERCENT"
      ? Math.floor((base * coupon.discountValue) / 10_000)
      : coupon.discountValue;

  if (coupon.discountType === "PERCENT" && coupon.maxDiscountPaise != null) {
    discount = Math.min(discount, coupon.maxDiscountPaise);
  }

  return Math.max(0, Math.min(discount, base, amounts.orderTotal));
}

/**
 * The rules that need no database: status, window, minimum order and scope.
 *
 * Split from the DB-facing resolver so the arithmetic can be tested directly, and
 * so order creation can re-run the same rules against rows it already holds a lock
 * on.
 */
export function evaluateCouponRules(input: {
  coupon: Coupon;
  lines: readonly CouponLine[];
  /** Charge subtotal for the whole cart (deposits excluded). */
  subtotal: number;
  now: Date;
}): CouponEvaluation {
  const { coupon, lines, subtotal, now } = input;

  // Only an active coupon, or a scheduled one whose window has opened, may apply.
  if (coupon.status === "PAUSED") return { ok: false, message: "That code is not active right now." };
  if (coupon.status === "RETIRED") return { ok: false, message: "That code is no longer available." };
  if (coupon.status === "EXPIRED") return { ok: false, message: "That code has expired." };
  if (coupon.status !== "ACTIVE" && coupon.status !== "SCHEDULED") {
    return { ok: false, message: "That code isn't valid." };
  }

  if (coupon.startsAt && now.getTime() < coupon.startsAt.getTime()) {
    return { ok: false, message: "That code isn't active yet." };
  }
  if (coupon.endsAt && now.getTime() > coupon.endsAt.getTime()) {
    return { ok: false, message: "That code has expired." };
  }

  if (subtotal < coupon.minimumOrderPaise) {
    return {
      ok: false,
      message: `This code needs an order of at least ${formatInr(coupon.minimumOrderPaise)}.`,
    };
  }

  const scoped = scopedAmounts(coupon, lines);
  const depositTotal = lines.reduce((sum, line) => sum + line.deposit, 0);
  const discountPaise = computeCouponDiscount(coupon, {
    ...scoped,
    orderTotal: subtotal + depositTotal,
  });

  // A scoped coupon that matches nothing, or a discount that rounds to zero, is
  // not a valid application — it is a code that does not work here.
  if (discountPaise <= 0) {
    return { ok: false, message: "This code doesn't apply to anything in your cart." };
  }

  return { ok: true, discountPaise };
}

export type CouponResolution =
  | { ok: true; coupon: Coupon; discountPaise: number }
  | { ok: false; message: string };

/**
 * Validate a code against a cart, reading the coupon and its redemption history.
 *
 * Runs on the plain pool for a preview and on the caller's transaction for order
 * creation, so the two share every rule.
 */
export async function resolveCouponForCart(input: {
  code: string;
  userId: number;
  lines: readonly CouponLine[];
  subtotal: number;
  executor?: Pick<typeof db, "select">;
  now?: Date;
}): Promise<CouponResolution> {
  const executor = input.executor ?? db;
  const code = input.code.trim().toUpperCase();
  if (code.length === 0) return { ok: false, message: "Enter a code." };

  // Codes are stored upper-cased; `utf8mb4_unicode_ci` makes the lookup itself
  // case-insensitive, but normalising first keeps the two spellings one key.
  const [coupon] = await executor.select().from(coupons).where(eq(coupons.code, code)).limit(1);
  if (!coupon) return { ok: false, message: "That code isn't valid." };

  // Total usage: the denormalised counter is authoritative and incremented in the
  // same transaction as the redemption, so checking it here is exact.
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    return { ok: false, message: "That code has reached its limit." };
  }

  if (coupon.perUserLimit != null) {
    const [row] = await executor
      .select({ value: count() })
      .from(couponRedemptions)
      .where(
        and(eq(couponRedemptions.couponId, coupon.id), eq(couponRedemptions.userId, input.userId)),
      );
    if (Number(row?.value ?? 0) >= coupon.perUserLimit) {
      return { ok: false, message: "You've already used this code." };
    }
  }

  const evaluated = evaluateCouponRules({
    coupon,
    lines: input.lines,
    subtotal: input.subtotal,
    now: input.now ?? new Date(),
  });
  if (!evaluated.ok) return { ok: false, message: evaluated.message };

  return { ok: true, coupon, discountPaise: evaluated.discountPaise };
}

/** An executor that can read and write — the order transaction. */
export type CouponWriteExecutor = Pick<typeof db, "select" | "insert" | "update">;

/**
 * Record a redemption, exactly once, inside the order's transaction.
 *
 * The increment is guarded by the coupon's own limit in the `WHERE`, so a race
 * that would push `used_count` past `usage_limit` updates no row; that becomes a
 * conflict that rolls the order back rather than a silent oversell of the code.
 * The `(coupon_id, order_id)` unique index is the second line of defence: a
 * retried checkout that somehow reached here twice inserts once and the duplicate
 * is refused, leaving the single redemption in place.
 */
export async function redeemCoupon(
  executor: CouponWriteExecutor,
  redemption: { couponId: number; userId: number; orderId: number; discountPaise: number },
): Promise<void> {
  const result = await executor
    .update(coupons)
    .set({ usedCount: sql`${coupons.usedCount} + 1` })
    .where(
      and(
        eq(coupons.id, redemption.couponId),
        sql`(${coupons.usageLimit} IS NULL OR ${coupons.usedCount} < ${coupons.usageLimit})`,
      ),
    );

  const affected = Number(result[0]?.affectedRows ?? 0);
  if (affected === 0) {
    const [current] = await executor
      .select({ id: coupons.id })
      .from(coupons)
      .where(eq(coupons.id, redemption.couponId))
      .limit(1);
    if (!current) throw new HttpError(409, "COUPON_GONE", "That coupon no longer exists.");
    throw new HttpError(409, "COUPON_EXHAUSTED", "That code has reached its limit.");
  }

  try {
    await executor.insert(couponRedemptions).values({
      couponId: redemption.couponId,
      userId: redemption.userId,
      orderId: redemption.orderId,
      discountPaise: redemption.discountPaise,
    });
  } catch (error) {
    // A duplicate means this order already redeemed this coupon — a retry that
    // slipped past the counter guard. The redemption exists once, which is the
    // contract; do not double-count it.
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Duplicate") || message.includes("duplicate")) return;
    throw error;
  }
}
