import { describe, expect, it } from "vitest";
import {
  allowedRefundTransitions,
  isRefundStatus,
  isRefundTransition,
  REFUND_TRANSITIONS,
} from "../server/lib/refund-admin";
import { retryHint } from "../server/lib/transaction-admin";
import { reconcileTotals, type ReconciliationTotals } from "../server/lib/finance-reports";
import { REFUND_STATUSES } from "../server/lib/enums";
import { PERMISSION_KEYS, ROLE_PERMISSION_GRANTS } from "../server/lib/permission-catalogue";

/**
 * PROMPT 28 — the pure parts of refunds, failed-payment hints and reconciliation.
 *
 * The state machines and the summary comparison are the pieces a database cannot
 * make wrong on its own, so they are asserted without one. The route wiring and the
 * live queries are covered indirectly (the gate coverage in
 * `admin-permissions.test.ts`, the emitters in `notification-events.test.ts`).
 */

describe("the refund state machine", () => {
  it("lets a pending request be approved, processed, failed or cancelled", () => {
    expect(allowedRefundTransitions("PENDING").sort()).toEqual(
      ["CANCELLED", "FAILED", "PROCESSING", "SUCCEEDED"].sort(),
    );
  });

  it("only lets an in-flight refund settle", () => {
    expect(allowedRefundTransitions("PROCESSING").sort()).toEqual(["FAILED", "SUCCEEDED"]);
  });

  it("treats every decided state as terminal", () => {
    for (const status of ["SUCCEEDED", "FAILED", "CANCELLED"] as const) {
      expect(allowedRefundTransitions(status)).toEqual([]);
      expect(REFUND_TRANSITIONS[status]).toEqual([]);
    }
  });

  it("has an entry for every status in the vocabulary", () => {
    // A status with no entry would make `allowedRefundTransitions` answer `[]` by
    // accident, silently freezing a refund that is not actually final.
    for (const status of REFUND_STATUSES) {
      expect(REFUND_TRANSITIONS[status]).toBeDefined();
    }
  });

  it("refuses an unknown status rather than guessing", () => {
    expect(isRefundStatus("REFUNDED")).toBe(false);
    expect(allowedRefundTransitions("REFUNDED")).toEqual([]);
    expect(isRefundTransition("REFUNDED", "SUCCEEDED")).toBe(false);
  });

  it("never allows a decided refund to change state", () => {
    for (const from of ["SUCCEEDED", "FAILED", "CANCELLED"] as const) {
      for (const to of REFUND_STATUSES) {
        expect(isRefundTransition(from, to)).toBe(false);
      }
    }
  });
});

describe("retryHint", () => {
  it("says nothing about a settled payment", () => {
    expect(retryHint("SUCCEEDED", null)).toBeNull();
    expect(retryHint("REFUNDED", "anything")).toBeNull();
  });

  it("reads the failure reason to give a specific next step", () => {
    expect(retryHint("FAILED", "The attempt expired")).toMatch(/new checkout/i);
    expect(retryHint("FAILED", "This payment is not recognised.")).toMatch(/closed the page/i);
    expect(retryHint("FAILED", "The proof did not verify")).toMatch(/retrying the same attempt is safe/i);
  });

  it("falls back to a generic retry rather than nothing", () => {
    expect(retryHint("FAILED", null)).toMatch(/declined/i);
    expect(retryHint("FAILED", "some unmodelled reason")).toMatch(/declined/i);
  });

  it("explains a cancelled or in-flight attempt", () => {
    expect(retryHint("CANCELLED", null)).toMatch(/cancelled/i);
    expect(retryHint("PENDING", null)).toMatch(/still open/i);
    expect(retryHint("PROCESSING", null)).toMatch(/still settling/i);
  });

  it("is case-insensitive about the provider's wording", () => {
    expect(retryHint("FAILED", "EXPIRED")).toBe(retryHint("FAILED", "expired"));
  });
});

describe("reconcileTotals", () => {
  const balanced: ReconciliationTotals = {
    ordersCollected: 500_00,
    capturedPayments: 500_00,
    refunded: 0,
    completedPayouts: 0,
  };

  it("flags nothing when the two sides agree", () => {
    expect(reconcileTotals(balanced)).toEqual([]);
  });

  it("flags orders that collected more than the ledger captured", () => {
    const mismatches = reconcileTotals({ ...balanced, capturedPayments: 480_00 });
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].kind).toBe("ORDERS_VS_PAYMENTS_TOTAL");
    expect(mismatches[0].severity).toBe("HIGH");
    expect(mismatches[0].amount).toBe(20_00);
  });

  it("flags the opposite direction too, not just the sales-favouring one", () => {
    const mismatches = reconcileTotals({ ...balanced, capturedPayments: 520_00 });
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].amount).toBe(-20_00);
  });

  it("returns a stable machine key so a UI can group the finding", () => {
    const [mismatch] = reconcileTotals({ ...balanced, ordersCollected: 1 });
    expect(mismatch.kind).toBe("ORDERS_VS_PAYMENTS_TOTAL");
    expect(mismatch.entityType).toBe("summary");
  });
});

describe("the refund permissions", () => {
  it("exist in the catalogue", () => {
    expect(PERMISSION_KEYS).toContain("refunds.view");
    expect(PERMISSION_KEYS).toContain("refunds.approve");
  });

  it("let FINANCE approve but not a SUPPORT agent", () => {
    expect(ROLE_PERMISSION_GRANTS.FINANCE).toContain("refunds.approve");
    expect(ROLE_PERMISSION_GRANTS.FINANCE).toContain("refunds.view");
    expect(ROLE_PERMISSION_GRANTS.SUPPORT).toContain("refunds.view");
    expect(ROLE_PERMISSION_GRANTS.SUPPORT).not.toContain("refunds.approve");
  });
});
