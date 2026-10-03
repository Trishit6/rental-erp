import { describe, expect, it } from "vitest";
import {
  allowedTransitions,
  assertCancellable,
  assertFulfillmentTransition,
  effectiveFulfillment,
  isSellerFulfillmentState,
  SELLER_FULFILLMENT_STATES,
} from "../server/lib/order-fulfillment";
import { HttpError } from "../server/lib/api";

describe("effective fulfillment", () => {
  it("inherits the order's status until the seller acts", () => {
    // A line with no recorded state is not "unknown" — it is wherever the order
    // is, which is what makes the seller view correct without a backfill.
    expect(effectiveFulfillment(null, "CONFIRMED")).toBe("CONFIRMED");
    expect(effectiveFulfillment(null, "PROCESSING")).toBe("PROCESSING");
  });

  it("prefers the line's own recorded state", () => {
    expect(effectiveFulfillment("SHIPPED", "CONFIRMED")).toBe("SHIPPED");
  });

  it("falls back rather than echoing a status the vocabulary does not know", () => {
    expect(effectiveFulfillment(null, "PAID")).toBe("CONFIRMED");
  });
});

describe("the transition table", () => {
  it("walks the happy path forward", () => {
    expect(allowedTransitions("CONFIRMED", null).next).toEqual(["PROCESSING"]);
    expect(allowedTransitions("CONFIRMED", "PROCESSING").next).toEqual([
      "READY_FOR_PICKUP",
      "SHIPPED",
    ]);
    expect(allowedTransitions("CONFIRMED", "SHIPPED").next).toEqual(["DELIVERED"]);
    expect(allowedTransitions("CONFIRMED", "DELIVERED").next).toEqual(["COMPLETED"]);
  });

  it("refuses to move backwards", () => {
    expect(() => assertFulfillmentTransition("CONFIRMED", "COMPLETED", "PROCESSING")).toThrow(
      HttpError,
    );
    expect(() => assertFulfillmentTransition("CONFIRMED", "SHIPPED", "PROCESSING")).toThrow(
      HttpError,
    );
  });

  it("treats completed and cancelled as terminal", () => {
    for (const terminal of ["COMPLETED", "CANCELLED"] as const) {
      expect(allowedTransitions("CONFIRMED", terminal).next).toEqual([]);
      expect(() => assertFulfillmentTransition("CONFIRMED", terminal, "PROCESSING")).toThrow(
        HttpError,
      );
    }
  });

  it("will not let a seller work an order that has not been paid for", () => {
    expect(allowedTransitions("PENDING_PAYMENT", null).next).toEqual([]);
    expect(() => assertFulfillmentTransition("PENDING_PAYMENT", null, "PROCESSING")).toThrow(
      HttpError,
    );
  });

  it("allows every forward step to be applied to a fresh CONFIRMED line", () => {
    expect(() => assertFulfillmentTransition("CONFIRMED", null, "PROCESSING")).not.toThrow();
    expect(() => assertFulfillmentTransition("CONFIRMED", "PROCESSING", "SHIPPED")).not.toThrow();
    expect(() => assertFulfillmentTransition("CONFIRMED", "SHIPPED", "DELIVERED")).not.toThrow();
    expect(() => assertFulfillmentTransition("CONFIRMED", "DELIVERED", "COMPLETED")).not.toThrow();
  });

  it("names the state in the refusal instead of saying 'invalid'", () => {
    try {
      assertFulfillmentTransition("CONFIRMED", "COMPLETED", "PROCESSING");
      throw new Error("expected a refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).message).toContain("completed");
    }
  });
});

describe("cancellation is only offered before the goods leave", () => {
  it("permits it while nothing has shipped", () => {
    for (const state of ["CONFIRMED", "PROCESSING", "READY_FOR_PICKUP"]) {
      expect(allowedTransitions("CONFIRMED", state).canCancel).toBe(true);
      expect(() => assertCancellable("CONFIRMED", state)).not.toThrow();
    }
  });

  it("refuses once it has shipped", () => {
    expect(allowedTransitions("CONFIRMED", "SHIPPED").canCancel).toBe(false);
    expect(() => assertCancellable("CONFIRMED", "SHIPPED")).toThrow(HttpError);
    expect(() => assertCancellable("CONFIRMED", "DELIVERED")).toThrow(HttpError);
  });

  it("says already-cancelled rather than unavailable", () => {
    try {
      assertCancellable("CONFIRMED", "CANCELLED");
      throw new Error("expected a refusal");
    } catch (error) {
      expect((error as HttpError).message).toMatch(/already cancelled/i);
    }
  });
});

describe("vocabulary guards", () => {
  it("accepts exactly the seller-settable states", () => {
    for (const state of SELLER_FULFILLMENT_STATES)
      expect(isSellerFulfillmentState(state)).toBe(true);
    // Not settable by a seller: these belong to the order's own lifecycle.
    for (const state of ["PENDING_PAYMENT", "CONFIRMED", "CANCELLED", "PAID", ""]) {
      expect(isSellerFulfillmentState(state)).toBe(false);
    }
    expect(isSellerFulfillmentState(7)).toBe(false);
  });

  it("describes a state in prose inside a refusal", () => {
    // The message is read by a person, so it must not shout the enum at them,
    // and it must not be Title Cased like a label — labels belong to the client.
    try {
      assertFulfillmentTransition("CONFIRMED", "DELIVERED", "PROCESSING");
      throw new Error("expected a refusal");
    } catch (error) {
      expect((error as HttpError).message).toBe(
        "An order that is delivered cannot be moved to processing.",
      );
    }
  });
});
