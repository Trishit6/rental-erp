import { describe, expect, it } from "vitest";
import { UPI_PAYEE_NAME, UPI_PAYEE_VPA, UPI_SANDBOX_VPA } from "../server/lib/config";
import {
  buildUpiPayload,
  buildUpiPayment,
  resolvePayeeVpa,
  sanitizeUpiReference,
} from "../server/lib/payments/upi";

/**
 * The UPI collect payload and its QR.
 *
 * ## What is worth asserting here
 *
 * Three things, all of them invariants a future edit could quietly break:
 *
 *  1. **The amount is the server's, to the paisa.** The only input is integer
 *     paise; the payload must carry the same figure in rupees and never a client's.
 *  2. **A production deploy with no VPA gets no QR.** This is the safety property:
 *     a blank configuration must not render a code that pays a placeholder account.
 *  3. **The render is a real PNG data URL**, not a stub string — a broken image is
 *     worse than no panel, because it looks like a payment option and isn't.
 *
 * The suite reads `UPI_PAYEE_VPA` rather than assuming it is blank, so a developer
 * with a real VPA in their environment still gets a meaningful run.
 */

const HAS_CONFIGURED_VPA = UPI_PAYEE_VPA.length > 0;

describe("resolvePayeeVpa", () => {
  it("uses the configured VPA when one is set, for any provider", () => {
    // Only meaningful when the environment actually configures one.
    if (!HAS_CONFIGURED_VPA) return;
    expect(resolvePayeeVpa(false)).toBe(UPI_PAYEE_VPA);
    expect(resolvePayeeVpa(true)).toBe(UPI_PAYEE_VPA);
  });

  it("falls back to the sandbox VPA for a non-production provider", () => {
    if (HAS_CONFIGURED_VPA) return;
    expect(resolvePayeeVpa(false)).toBe(UPI_SANDBOX_VPA);
  });

  it("returns null for a production provider with nothing configured", () => {
    if (HAS_CONFIGURED_VPA) return;
    // The whole point: no configured payee means no code, not a fake one.
    expect(resolvePayeeVpa(true)).toBeNull();
  });
});

describe("sanitizeUpiReference", () => {
  it("strips anything outside [A-Za-z0-9]", () => {
    expect(sanitizeUpiReference("RVPAY-123/abc")).toBe("RVPAY123abc");
  });

  it("caps the reference at 35 characters", () => {
    const long = "A".repeat(80);
    expect(sanitizeUpiReference(long)).toHaveLength(35);
  });

  it("falls back rather than emitting an empty reference", () => {
    // An empty `tr` makes some UPI apps drop the intent, so a caller that passed
    // punctuation only still gets a usable one.
    expect(sanitizeUpiReference("----")).toBe("REVARO");
    expect(sanitizeUpiReference("")).toBe("REVARO");
  });
});

describe("buildUpiPayload", () => {
  const payload = buildUpiPayload({
    payeeVpa: "someone@bank",
    amountPaise: 123456,
    reference: "RVPAY42",
    note: "Revaro order payment",
  });

  it("uses the upi://pay scheme", () => {
    expect(payload.startsWith("upi://pay?")).toBe(true);
  });

  it("carries the amount in rupees, fixed to two decimals", () => {
    const params = new URLSearchParams(payload.slice("upi://pay?".length));
    expect(params.get("am")).toBe("1234.56");
    expect(params.get("cu")).toBe("INR");
  });

  it("carries the payee and reference exactly as given", () => {
    const params = new URLSearchParams(payload.slice("upi://pay?".length));
    expect(params.get("pa")).toBe("someone@bank");
    expect(params.get("tr")).toBe("RVPAY42");
  });

  it("encodes spaces as %20 rather than +", () => {
    // The form-urlencoded serialiser would emit `+`; several UPI apps read that
    // literally and mangle the payee name on the confirmation screen.
    expect(payload).toContain("%20");
    expect(payload).not.toContain("+");
  });
});

describe("buildUpiPayment", () => {
  it("returns a full presentation for a non-production provider", async () => {
    const upi = await buildUpiPayment({
      amountPaise: 49900,
      reference: "RVPAY7",
      isProductionReady: false,
    });

    expect(upi).not.toBeNull();
    if (!upi) return;

    expect(upi.amount).toBe(49900);
    expect(upi.currency).toBe("INR");
    expect(upi.reference).toBe("RVPAY7");
    expect(upi.payeeName).toBe(UPI_PAYEE_NAME);
    // The payload's amount agrees with the returned amount — one source of truth.
    const params = new URLSearchParams(upi.payload.slice("upi://pay?".length));
    expect(params.get("am")).toBe("499.00");
    expect(params.get("pa")).toBe(upi.payeeVpa);
    // A real rendered PNG, not a placeholder string.
    expect(upi.imageDataUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect(upi.imageDataUrl.length).toBeGreaterThan(200);
  });

  it("returns null for a production provider with no configured VPA", async () => {
    if (HAS_CONFIGURED_VPA) return;
    const upi = await buildUpiPayment({
      amountPaise: 100,
      reference: "RVPAY1",
      isProductionReady: true,
    });
    expect(upi).toBeNull();
  });

  it("refuses a non-positive or fractional amount", async () => {
    await expect(
      buildUpiPayment({ amountPaise: 0, reference: "RVPAY1", isProductionReady: false }),
    ).rejects.toThrow();
    await expect(
      buildUpiPayment({ amountPaise: -5, reference: "RVPAY1", isProductionReady: false }),
    ).rejects.toThrow();
    await expect(
      buildUpiPayment({ amountPaise: 12.5, reference: "RVPAY1", isProductionReady: false }),
    ).rejects.toThrow();
  });

  it("sanitises the reference it returns and embeds", async () => {
    const upi = await buildUpiPayment({
      amountPaise: 100,
      reference: "RVPAY-9",
      isProductionReady: false,
    });
    expect(upi?.reference).toBe("RVPAY9");
    expect(upi?.payload).toContain("tr=RVPAY9");
  });
});
