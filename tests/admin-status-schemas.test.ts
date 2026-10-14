import { describe, expect, it } from "vitest";
import { REPORT_STATUSES } from "../server/lib/enums";
import { PRODUCT_STATUSES } from "../server/lib/product-status";
import { adminProductStatusSchema, adminReportStatusSchema } from "../server/routes/admin";

/**
 * PROMPT R4 — the two admin handlers no longer cast the body.
 *
 * Before this, each handler did `const body = (await c.req.json()) as { status?: string }`
 * and then checked `allowed.includes(body.status)`. That type assertion is a lie: it
 * tells the compiler the field is a string without checking it, and the runtime check
 * that followed only guarded `status`. Every other key in the body — including one that
 * shadowed a field the handler read later — was accepted and ignored.
 *
 * The schemas replace the cast, so the input is *validated* rather than asserted. Three
 * ways a body can now be wrong, and each is asserted for both handlers:
 *
 *  - an unknown status (the `SOLD` bug: a value accepted here and nowhere else),
 *  - a missing status,
 *  - an extra key, which `.strict()` turns from "quietly ignored" into a 400.
 */

describe("adminProductStatusSchema", () => {
  it("accepts exactly the product-lifecycle vocabulary", () => {
    for (const status of PRODUCT_STATUSES) {
      expect(adminProductStatusSchema.parse({ status })).toEqual({ status });
    }
  });

  it("refuses a status that lives nowhere else in the app", () => {
    // `SOLD` was accepted by the old handler and is a member of no vocabulary, so a
    // product set to it became invisible to every public query.
    expect(() => adminProductStatusSchema.parse({ status: "SOLD" })).toThrow();
  });

  it("refuses a missing, non-string or extra field", () => {
    expect(() => adminProductStatusSchema.parse({})).toThrow();
    expect(() => adminProductStatusSchema.parse({ status: 7 })).toThrow();
    expect(() => adminProductStatusSchema.parse({ status: "PUBLISHED", note: "hi" })).toThrow();
  });
});

describe("adminReportStatusSchema", () => {
  it("accepts exactly the four report statuses", () => {
    for (const status of REPORT_STATUSES) {
      expect(adminReportStatusSchema.parse({ status })).toEqual({ status });
    }
  });

  it("refuses an unknown status", () => {
    expect(() => adminReportStatusSchema.parse({ status: "CLOSED" })).toThrow();
  });

  it("refuses a missing, non-string or extra field", () => {
    expect(() => adminReportStatusSchema.parse({})).toThrow();
    expect(() => adminReportStatusSchema.parse({ status: null })).toThrow();
    expect(() => adminReportStatusSchema.parse({ status: "OPEN", adminId: 1 })).toThrow();
  });

  it("shares its vocabulary with the report-status schema, not a private copy", () => {
    // The old handler hard-coded the four strings; the schema derives them from
    // `REPORT_STATUSES`, so a fifth status added to the enum cannot be missing here.
    expect(adminReportStatusSchema.shape.status.options).toEqual([...REPORT_STATUSES]);
  });
});
