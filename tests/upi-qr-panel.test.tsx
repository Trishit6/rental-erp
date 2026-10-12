import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UpiQrPanel } from "@/features/payment/components/UpiQrPanel";
import type { UpiPayment } from "@/features/payment/types";

/**
 * The UPI collect panel.
 *
 * ## The one behaviour worth a test
 *
 * A UPI QR is a *request* for money. Rendering one must never, on its own, present
 * the payment as done — the server's verified status is the only thing that may do
 * that. So the assertions here are about what the panel *shows* (the exact amount,
 * the payee and reference the server decided) and what it refuses to imply (a
 * receipt or a success state). The image is asserted to be the server's data URL by
 * identity, not re-derived.
 */

function upi(overrides: Partial<UpiPayment> = {}): UpiPayment {
  return {
    payload: "upi://pay?pa=revaro.sandbox@mockupi&am=499.00&cu=INR&tr=RVPAY7",
    imageDataUrl: "data:image/png;base64,AAAA",
    payeeVpa: "revaro.sandbox@mockupi",
    payeeName: "Revaro Marketplace",
    amount: 49900,
    currency: "INR",
    reference: "RVPAY7",
    note: "Revaro order payment",
    ...overrides,
  };
}

describe("the UPI collect panel", () => {
  beforeEach(() => {
    // jsdom has no clipboard; the copy button swallows the rejection, so a stub
    // keeps the interaction from logging an unhandled error.
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("renders the server's QR image, amount, payee and reference", () => {
    const payment = upi();
    render(<UpiQrPanel upi={payment} status="PENDING" />);

    const image = screen.getByTestId("upi-qr-image") as HTMLImageElement;
    expect(image.getAttribute("src")).toBe(payment.imageDataUrl);
    expect(screen.getByText(payment.payeeVpa)).toBeDefined();
    expect(screen.getByText(payment.reference)).toBeDefined();
    // The amount is the server's, formatted; the client never recomputes it.
    expect(screen.getByText(/499/)).toBeDefined();
  });

  it("says plainly that the code is not a receipt", () => {
    render(<UpiQrPanel upi={upi()} status="PENDING" />);

    expect(screen.getByTestId("upi-not-proof")).toBeDefined();
    expect(screen.getByText(/not a receipt/i)).toBeDefined();
  });

  it("offers a server re-check but claims nothing itself", async () => {
    const onCheckStatus = vi.fn();
    render(
      <UpiQrPanel upi={upi()} status="PENDING" onCheckStatus={onCheckStatus} onCancel={vi.fn()} />,
    );

    await userEvent.click(screen.getByRole("button", { name: /check status/i }));
    expect(onCheckStatus).toHaveBeenCalledTimes(1);

    // The only controls are copy, re-check and cancel — there is deliberately no
    // "I've paid" button, because the client is not what decides that.
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("lets the customer cancel without the panel deciding either way", async () => {
    const onCancel = vi.fn();
    render(<UpiQrPanel upi={upi()} status="PENDING" onCancel={onCancel} />);

    await userEvent.click(screen.getByRole("button", { name: /cancel payment/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("copies the payee VPA", async () => {
    render(<UpiQrPanel upi={upi()} status="PENDING" />);

    await userEvent.click(screen.getByRole("button", { name: "Copy UPI ID" }));
    expect(vi.mocked(navigator.clipboard.writeText)).toHaveBeenCalledWith("revaro.sandbox@mockupi");
  });
});
