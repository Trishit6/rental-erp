import { toDataURL } from "qrcode";
import { UPI_PAYEE_NAME, UPI_PAYEE_VPA, UPI_SANDBOX_VPA } from "../config";
import type { UpiPayment } from "./types";

/**
 * UPI collect payloads and their QR renderings.
 *
 * ## What this module is careful about
 *
 *  - **The amount is the server's.** It takes the transaction's integer paise and
 *    formats rupees to two decimals; there is no field a caller can use to ask
 *    for a different figure or currency.
 *  - **The reference is fixed and printable.** UPI apps cap `tr` at 35 characters
 *    and expect it to survive being read aloud to support, so it is stripped to
 *    `[A-Za-z0-9]` rather than passed through.
 *  - **A blank VPA means no payload.** `resolvePayeeVpa` returns `null` for a
 *    production-ready provider with nothing configured, so the caller omits the
 *    QR entirely instead of rendering a code that pays a placeholder account.
 */

/**
 * The VPA to collect into, or `null` when none is configured for this provider.
 *
 * The development mock falls back to a clearly-sandbox address; a real provider
 * does not. That asymmetry is the whole safety property: a production deploy that
 * forgot `UPI_PAYEE_VPA` shows no QR, while local development still exercises the
 * path end to end.
 */
export function resolvePayeeVpa(isProductionReady: boolean): string | null {
  if (UPI_PAYEE_VPA) return UPI_PAYEE_VPA;
  return isProductionReady ? null : UPI_SANDBOX_VPA;
}

/**
 * UPI's `tr` field: alphanumerics, at most 35 characters.
 *
 * The fallback is not empty-avoidance theatre — an empty `tr` makes some UPI apps
 * drop the whole intent, so a caller that passed an unusable reference still gets
 * a valid, if generic, one.
 */
export function sanitizeUpiReference(reference: string): string {
  const cleaned = reference.replace(/[^A-Za-z0-9]/g, "").slice(0, 35);
  return cleaned.length > 0 ? cleaned : "REVARO";
}

/**
 * Build the `upi://pay` URI for an exact amount and reference.
 *
 * `URLSearchParams` is used for correct escaping, then `+` is rewritten to `%20`:
 * the WHATWG form-urlencoded serialiser encodes a space as `+`, which a number of
 * UPI apps read literally rather than as a plus-encoded space, mangling the payee
 * name in the confirmation screen.
 */
export function buildUpiPayload(input: {
  payeeVpa: string;
  amountPaise: number;
  reference: string;
  note: string;
}): string {
  const params = new URLSearchParams({
    pa: input.payeeVpa,
    pn: UPI_PAYEE_NAME,
    am: (input.amountPaise / 100).toFixed(2),
    cu: "INR",
    tr: input.reference,
    tn: input.note,
  });
  return `upi://pay?${params.toString().replace(/\+/g, "%20")}`;
}

/**
 * A complete UPI presentation: payload, rendered QR and the facts beside it.
 *
 * Returns `null` when no payee VPA is configured. Throws — loudly — on an amount
 * that is not a positive integer number of paise, because that is a programming
 * error at the call site and silently producing a "0.00" code would be worse.
 */
export async function buildUpiPayment(input: {
  amountPaise: number;
  reference: string;
  note?: string;
  isProductionReady: boolean;
}): Promise<UpiPayment | null> {
  const payeeVpa = resolvePayeeVpa(input.isProductionReady);
  if (!payeeVpa) return null;

  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
    throw new Error("A UPI payment amount must be a positive whole number of paise.");
  }

  const reference = sanitizeUpiReference(input.reference);
  const note = (input.note ?? "Revaro order payment").slice(0, 50);
  const payload = buildUpiPayload({ payeeVpa, amountPaise: input.amountPaise, reference, note });

  const imageDataUrl = await toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
  });

  return {
    payload,
    imageDataUrl,
    payeeVpa,
    payeeName: UPI_PAYEE_NAME,
    amount: input.amountPaise,
    currency: "INR",
    reference,
    note,
  };
}
