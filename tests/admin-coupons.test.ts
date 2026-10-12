import { describe, expect, it } from "vitest";
import {
  COUPON_DISCOUNT_TYPES,
  COUPON_STATUSES,
  COUPON_WRITABLE_SCOPES,
  couponStatusSchema,
  couponWriteSchema,
} from "../server/lib/coupon-admin";
import {
  COUPON_DISCOUNT_TYPES as CLIENT_DISCOUNT_TYPES,
  COUPON_DISCOUNT_TYPE_LABELS,
  COUPON_SCOPES as CLIENT_SCOPES,
  COUPON_SCOPE_LABELS,
  COUPON_STATUSES as CLIENT_STATUSES,
  COUPON_STATUS_LABELS,
} from "../src/features/admin/api";
import { ROLE_PERMISSION_GRANTS } from "../server/lib/permission-catalogue";

/**
 * PROMPT 31 — the pure parts of the coupon desk.
 *
 * The write schema is the piece worth pinning without a database: it is where the
 * "PERCENT is basis points" and "CATEGORY names a category" rules live, and a mistake
 * there is a coupon that either discounts 100× too much or applies to everything.
 */

const validPercent = {
  code: "save10",
  description: "10% off",
  discountType: "PERCENT" as const,
  discountValue: 1000,
  maxDiscountPaise: 50_000,
  minimumOrderPaise: 0,
  usageLimit: 100,
  perUserLimit: 1,
  startsAt: null,
  endsAt: null,
  status: "ACTIVE" as const,
  appliesTo: "ALL" as const,
  categoryId: null,
};

describe("the coupon vocabularies", () => {
  it("agree between the server and the client", () => {
    expect([...CLIENT_STATUSES]).toEqual([...COUPON_STATUSES]);
    expect([...CLIENT_DISCOUNT_TYPES]).toEqual([...COUPON_DISCOUNT_TYPES]);
    expect([...CLIENT_SCOPES]).toEqual([...COUPON_WRITABLE_SCOPES]);
  });

  it("label every status, type and scope the desk can show", () => {
    for (const status of COUPON_STATUSES) {
      expect(COUPON_STATUS_LABELS[status]).toBeTruthy();
    }
    for (const type of COUPON_DISCOUNT_TYPES) {
      expect(COUPON_DISCOUNT_TYPE_LABELS[type]).toBeTruthy();
    }
    for (const scope of COUPON_WRITABLE_SCOPES) {
      expect(COUPON_SCOPE_LABELS[scope]).toBeTruthy();
    }
  });

  it("does not offer the PRODUCT scope the table cannot express", () => {
    // `COUPON_SCOPES` in the enum names PRODUCT, but there is no product column on
    // `coupons`; the writable set is deliberately narrower.
    expect([...COUPON_WRITABLE_SCOPES]).not.toContain("PRODUCT");
  });
});

describe("couponWriteSchema", () => {
  it("accepts a well-formed percentage coupon", () => {
    const parsed = couponWriteSchema.parse(validPercent);
    expect(parsed.code).toBe("save10");
    expect(parsed.discountType).toBe("PERCENT");
  });

  it("accepts a flat coupon with unlimited use", () => {
    const parsed = couponWriteSchema.parse({
      ...validPercent,
      code: "FLAT200",
      discountType: "FLAT",
      discountValue: 20_000,
      maxDiscountPaise: null,
      usageLimit: null,
      perUserLimit: null,
    });
    expect(parsed.usageLimit).toBeNull();
  });

  it("defaults the optional fields", () => {
    const parsed = couponWriteSchema.parse({
      code: "MIN",
      discountType: "FLAT",
      discountValue: 100,
    });
    expect(parsed.minimumOrderPaise).toBe(0);
    expect(parsed.status).toBe("ACTIVE");
    expect(parsed.appliesTo).toBe("ALL");
  });

  it("refuses a percentage above 100%", () => {
    expect(() => couponWriteSchema.parse({ ...validPercent, discountValue: 10_001 })).toThrow();
  });

  it("refuses a CATEGORY coupon with no category", () => {
    expect(() =>
      couponWriteSchema.parse({ ...validPercent, appliesTo: "CATEGORY", categoryId: null }),
    ).toThrow();
  });

  it("accepts a CATEGORY coupon with a category", () => {
    expect(
      couponWriteSchema.parse({ ...validPercent, appliesTo: "CATEGORY", categoryId: 7 }),
    ).toMatchObject({ appliesTo: "CATEGORY", categoryId: 7 });
  });

  it("refuses an unknown status, type or scope", () => {
    expect(() => couponWriteSchema.parse({ ...validPercent, status: "LIVE" })).toThrow();
    expect(() => couponWriteSchema.parse({ ...validPercent, discountType: "BOGO" })).toThrow();
    expect(() => couponWriteSchema.parse({ ...validPercent, appliesTo: "PRODUCT" })).toThrow();
  });

  it("refuses an end before the start", () => {
    expect(() =>
      couponWriteSchema.parse({
        ...validPercent,
        startsAt: "2026-02-01T00:00:00.000Z",
        endsAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toThrow();
  });

  it("refuses a code with characters a code should not have", () => {
    expect(() => couponWriteSchema.parse({ ...validPercent, code: "SAVE 10%" })).toThrow();
  });

  it("refuses unknown keys rather than dropping them silently", () => {
    expect(() => couponWriteSchema.parse({ ...validPercent, sneaky: true })).toThrow();
  });
});

describe("couponStatusSchema", () => {
  it("accepts a known status and refuses anything else", () => {
    expect(couponStatusSchema.parse({ status: "PAUSED" })).toEqual({ status: "PAUSED" });
    expect(() => couponStatusSchema.parse({ status: "LIVE" })).toThrow();
  });
});

describe("who can work the coupon desk", () => {
  it("lets ADMIN manage coupons", () => {
    expect(ROLE_PERMISSION_GRANTS.ADMIN).toContain("coupons.manage");
  });

  it("lets FINANCE audit codes but not change them", () => {
    expect(ROLE_PERMISSION_GRANTS.FINANCE).toContain("coupons.view");
    expect(ROLE_PERMISSION_GRANTS.FINANCE).not.toContain("coupons.manage");
  });

  it("lets CONTENT_MANAGER run promotions", () => {
    expect(ROLE_PERMISSION_GRANTS.CONTENT_MANAGER).toContain("coupons.view");
    expect(ROLE_PERMISSION_GRANTS.CONTENT_MANAGER).toContain("coupons.manage");
  });

  it("keeps SUPPORT out of the coupon desk", () => {
    expect(ROLE_PERMISSION_GRANTS.SUPPORT).not.toContain("coupons.view");
    expect(ROLE_PERMISSION_GRANTS.SUPPORT).not.toContain("coupons.manage");
  });
});
