import { z } from "zod";
import { and, count, desc, eq, like, or, sql } from "drizzle-orm";
import { db } from "../db";
import { categories, couponRedemptions, coupons, orders, users } from "../schema";
import { buildPagination, HttpError } from "./api";

/**
 * Coupon administration (PROMPT 31).
 *
 * ## Two copies of a discount are the same discount
 *
 * `discount_value` has two meanings pinned by a CHECK: `FLAT` is paise, `PERCENT` is
 * basis points. The write schema restates that rule here so an operator gets "a
 * percentage is basis points, 10000 is 100%" *before* the database refuses the row,
 * rather than a constraint name in a toast.
 *
 * ## Redemptions are the history, and the history is not editable
 *
 * A coupon can be paused, re-scoped or re-valued; a redemption row records what was
 * actually taken off an order at the time and is append-only. So "delete" is only
 * offered for a coupon nobody has used — a used coupon is paused, because deleting it
 * would cascade the evidence of the discount away with it.
 *
 * ## `PRODUCT` scope exists in the vocabulary, not in the table
 *
 * `COUPON_SCOPES` names `PRODUCT`, but `coupons` has no product column to point at,
 * so a `PRODUCT` coupon could not name its product. Rather than ship a scope that
 * silently matches everything, the write schema accepts `ALL` and `CATEGORY` only.
 */

export const COUPON_STATUSES = ["ACTIVE", "PAUSED", "SCHEDULED", "EXPIRED"] as const;
export type CouponStatus = (typeof COUPON_STATUSES)[number];

export const COUPON_DISCOUNT_TYPES = ["PERCENT", "FLAT"] as const;
export type CouponDiscountType = (typeof COUPON_DISCOUNT_TYPES)[number];

/** The scopes an admin may actually set — see the module note on `PRODUCT`. */
export const COUPON_WRITABLE_SCOPES = ["ALL", "CATEGORY"] as const;
export type CouponWritableScope = (typeof COUPON_WRITABLE_SCOPES)[number];

const positiveId = z.number().int().positive();
const timestampInput = z.union([z.date(), z.string().datetime()]).nullish();

export const couponWriteSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(40)
      // Codes are typed, shared and read aloud; anything outside this set is either a
      // typo or a URL fragment waiting to happen.
      .regex(/^[A-Za-z0-9_-]+$/, "Codes may use letters, numbers, hyphen and underscore only"),
    description: z.string().trim().max(200).nullish(),
    discountType: z.enum(COUPON_DISCOUNT_TYPES),
    /** `FLAT` = paise; `PERCENT` = basis points. */
    discountValue: z.number().int().positive(),
    maxDiscountPaise: z.number().int().nonnegative().nullish(),
    minimumOrderPaise: z.number().int().nonnegative().default(0),
    usageLimit: z.number().int().positive().nullish(),
    perUserLimit: z.number().int().positive().nullish(),
    startsAt: timestampInput,
    endsAt: timestampInput,
    status: z.enum(COUPON_STATUSES).default("ACTIVE"),
    appliesTo: z.enum(COUPON_WRITABLE_SCOPES).default("ALL"),
    categoryId: positiveId.nullish(),
  })
  .strict()
  .refine((value) => value.discountType !== "PERCENT" || value.discountValue <= 10_000, {
    message: "A percentage coupon is in basis points, so 10000 is the maximum (100%)",
    path: ["discountValue"],
  })
  .refine((value) => value.appliesTo !== "CATEGORY" || value.categoryId != null, {
    message: "A category coupon must name a category",
    path: ["categoryId"],
  })
  .refine(
    (value) =>
      value.startsAt == null ||
      value.endsAt == null ||
      new Date(value.endsAt) > new Date(value.startsAt),
    { message: "The end date must be after the start date", path: ["endsAt"] },
  );

export type CouponWriteInput = z.infer<typeof couponWriteSchema>;

export type CouponAdminFilters = {
  search: string;
  status: CouponStatus | null;
  discountType: CouponDiscountType | null;
  page: number;
  pageSize: number;
};

export type CouponAdminRow = {
  id: number;
  code: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  maxDiscountPaise: number | null;
  minimumOrderPaise: number;
  usageLimit: number | null;
  perUserLimit: number | null;
  usedCount: number;
  redemptionCount: number;
  startsAt: Date | null;
  endsAt: Date | null;
  status: string;
  appliesTo: string;
  categoryId: number | null;
  categoryName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** The live count, distinct from the denormalised `usedCount` the checkout reads. */
const redemptionCountSql = sql<number>`(
  SELECT COUNT(*) FROM coupon_redemptions
  WHERE coupon_redemptions.coupon_id = ${coupons.id}
)`;

export async function listCouponsForAdmin(
  filters: CouponAdminFilters,
): Promise<{ rows: CouponAdminRow[]; pagination: ReturnType<typeof buildPagination> }> {
  const conditions = [];
  if (filters.status) conditions.push(eq(coupons.status, filters.status));
  if (filters.discountType) conditions.push(eq(coupons.discountType, filters.discountType));
  if (filters.search) {
    const pattern = `%${filters.search}%`;
    conditions.push(or(like(coupons.code, pattern), like(coupons.description, pattern))!);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ total }] = await db.select({ total: count() }).from(coupons).where(where);

  const rows = await db
    .select({
      id: coupons.id,
      code: coupons.code,
      description: coupons.description,
      discountType: coupons.discountType,
      discountValue: coupons.discountValue,
      maxDiscountPaise: coupons.maxDiscountPaise,
      minimumOrderPaise: coupons.minimumOrderPaise,
      usageLimit: coupons.usageLimit,
      perUserLimit: coupons.perUserLimit,
      usedCount: coupons.usedCount,
      redemptionCount: redemptionCountSql,
      startsAt: coupons.startsAt,
      endsAt: coupons.endsAt,
      status: coupons.status,
      appliesTo: coupons.appliesTo,
      categoryId: coupons.categoryId,
      categoryName: categories.name,
      createdAt: coupons.createdAt,
      updatedAt: coupons.updatedAt,
    })
    .from(coupons)
    .leftJoin(categories, eq(categories.id, coupons.categoryId))
    .where(where)
    .orderBy(desc(coupons.createdAt))
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);

  return {
    rows: rows.map((row) => ({ ...row, redemptionCount: Number(row.redemptionCount) })),
    pagination: buildPagination(filters.page, filters.pageSize, Number(total)),
  };
}

export type CouponRedemptionRow = {
  id: number;
  orderId: number;
  orderNumber: string | null;
  userId: number;
  userName: string;
  discountPaise: number;
  createdAt: Date;
};

export type CouponDetail = {
  coupon: CouponAdminRow;
  redemptionCount: number;
  totalDiscountPaise: number;
  redemptions: CouponRedemptionRow[];
};

async function loadCouponRow(id: number): Promise<CouponAdminRow> {
  const [row] = await db
    .select({
      id: coupons.id,
      code: coupons.code,
      description: coupons.description,
      discountType: coupons.discountType,
      discountValue: coupons.discountValue,
      maxDiscountPaise: coupons.maxDiscountPaise,
      minimumOrderPaise: coupons.minimumOrderPaise,
      usageLimit: coupons.usageLimit,
      perUserLimit: coupons.perUserLimit,
      usedCount: coupons.usedCount,
      redemptionCount: redemptionCountSql,
      startsAt: coupons.startsAt,
      endsAt: coupons.endsAt,
      status: coupons.status,
      appliesTo: coupons.appliesTo,
      categoryId: coupons.categoryId,
      categoryName: categories.name,
      createdAt: coupons.createdAt,
      updatedAt: coupons.updatedAt,
    })
    .from(coupons)
    .leftJoin(categories, eq(categories.id, coupons.categoryId))
    .where(eq(coupons.id, id))
    .limit(1);
  if (!row) throw new HttpError(404, "NOT_FOUND", "That coupon does not exist.");
  return { ...row, redemptionCount: Number(row.redemptionCount) };
}

export async function getCouponDetail(id: number): Promise<CouponDetail> {
  const coupon = await loadCouponRow(id);

  const [totals] = await db
    .select({
      redemptionCount: count(),
      totalDiscountPaise: sql<number>`COALESCE(SUM(${couponRedemptions.discountPaise}), 0)`,
    })
    .from(couponRedemptions)
    .where(eq(couponRedemptions.couponId, id));

  const redemptions = await db
    .select({
      id: couponRedemptions.id,
      orderId: couponRedemptions.orderId,
      orderNumber: orders.orderNumber,
      userId: couponRedemptions.userId,
      userName: users.name,
      discountPaise: couponRedemptions.discountPaise,
      createdAt: couponRedemptions.createdAt,
    })
    .from(couponRedemptions)
    .innerJoin(orders, eq(orders.id, couponRedemptions.orderId))
    .innerJoin(users, eq(users.id, couponRedemptions.userId))
    .where(eq(couponRedemptions.couponId, id))
    .orderBy(desc(couponRedemptions.createdAt))
    .limit(25);

  return {
    coupon,
    redemptionCount: Number(totals?.redemptionCount ?? 0),
    totalDiscountPaise: Number(totals?.totalDiscountPaise ?? 0),
    redemptions,
  };
}

/** Codes are compared case-insensitively, so two spellings must not both exist. */
async function assertCodeFree(code: string, exceptId?: number): Promise<void> {
  const [existing] = await db
    .select({ id: coupons.id })
    .from(coupons)
    .where(eq(coupons.code, code.toUpperCase()))
    .limit(1);
  if (existing && existing.id !== exceptId) {
    throw new HttpError(409, "DUPLICATE_CODE", `The code ${code.toUpperCase()} is already in use.`);
  }
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

export async function createCoupon(
  adminId: number,
  input: CouponWriteInput,
): Promise<{ id: number; code: string }> {
  const code = input.code.toUpperCase();
  await assertCodeFree(code);

  const result = await db.insert(coupons).values({
    code,
    description: input.description ?? null,
    discountType: input.discountType,
    discountValue: input.discountValue,
    maxDiscountPaise: input.maxDiscountPaise ?? null,
    minimumOrderPaise: input.minimumOrderPaise,
    usageLimit: input.usageLimit ?? null,
    perUserLimit: input.perUserLimit ?? null,
    startsAt: toDate(input.startsAt),
    endsAt: toDate(input.endsAt),
    status: input.status,
    appliesTo: input.appliesTo,
    categoryId: input.appliesTo === "CATEGORY" ? (input.categoryId ?? null) : null,
    createdBy: adminId,
  });
  return { id: result[0]!.insertId, code };
}

export async function updateCoupon(
  id: number,
  input: CouponWriteInput,
): Promise<{ id: number; code: string }> {
  const existing = await loadCouponRow(id);
  const code = input.code.toUpperCase();
  await assertCodeFree(code, id);

  // The `used_count <= usage_limit` CHECK would refuse this at the database with an
  // opaque constraint name; answering it here says which number is wrong.
  if (input.usageLimit != null && input.usageLimit < existing.usedCount) {
    throw new HttpError(
      409,
      "USAGE_LIMIT_BELOW_USED",
      `This coupon has already been used ${existing.usedCount} times; the limit cannot go below that.`,
    );
  }

  await db
    .update(coupons)
    .set({
      code,
      description: input.description ?? null,
      discountType: input.discountType,
      discountValue: input.discountValue,
      maxDiscountPaise: input.maxDiscountPaise ?? null,
      minimumOrderPaise: input.minimumOrderPaise,
      usageLimit: input.usageLimit ?? null,
      perUserLimit: input.perUserLimit ?? null,
      startsAt: toDate(input.startsAt),
      endsAt: toDate(input.endsAt),
      status: input.status,
      appliesTo: input.appliesTo,
      categoryId: input.appliesTo === "CATEGORY" ? (input.categoryId ?? null) : null,
    })
    .where(eq(coupons.id, id));

  return { id, code };
}

/**
 * Delete a coupon, but only one nobody has used.
 *
 * A redemption cascades from its coupon (the FK says so), and a redemption is the
 * record of money taken off a real order. Deleting a used coupon would delete that
 * record, so the safe answer is "pause it" and this refuses with the count that says
 * why.
 */
export async function deleteCoupon(id: number): Promise<{ id: number; code: string }> {
  const existing = await loadCouponRow(id);
  if (existing.usedCount > 0 || existing.redemptionCount > 0) {
    throw new HttpError(
      409,
      "COUPON_IN_USE",
      "This coupon has been redeemed and cannot be deleted; pause it instead.",
    );
  }
  await db.delete(coupons).where(eq(coupons.id, id));
  return { id, code: existing.code };
}

export const couponStatusSchema = z.object({ status: z.enum(COUPON_STATUSES) }).strict();

/** The quick pause/activate a listing needs: one field, no rest of the coupon resent. */
export async function setCouponStatus(
  id: number,
  status: CouponStatus,
): Promise<{ id: number; code: string; status: CouponStatus }> {
  const existing = await loadCouponRow(id);
  await db.update(coupons).set({ status }).where(eq(coupons.id, id));
  return { id, code: existing.code, status };
}
