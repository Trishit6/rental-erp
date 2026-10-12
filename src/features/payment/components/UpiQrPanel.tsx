import { useState } from "react";
import { Check, Copy, QrCode, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatInr } from "@/lib/pricing";
import type { PaymentStatus, UpiPayment } from "../types";

/**
 * The UPI collect panel.
 *
 * ## The one rule this component exists to honour
 *
 * A UPI QR is a *request* for money, not a receipt. Anyone can screenshot it,
 * scan it and pay it, and none of that tells the server anything — so this panel
 * never advances the checkout. It shows the code, then waits for the payment
 * status the server derives from the provider. The only button that moves the
 * flow forward asks the server to re-check; the confirm/cancel controls below it
 * belong to the surrounding page, not to the QR.
 *
 * The amount and the reference are the server's, passed through untouched. The
 * client does not format the payload or recompute a total — it renders an image
 * and repeats three strings.
 */
export function UpiQrPanel({
  upi,
  status,
  isChecking = false,
  onCheckStatus,
  onCancel,
}: {
  upi: UpiPayment;
  status: PaymentStatus;
  isChecking?: boolean;
  onCheckStatus?: () => void;
  onCancel?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyVpa() {
    try {
      await navigator.clipboard.writeText(upi.payeeVpa);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused (insecure context, denied permission). The
      // VPA is on screen and selectable either way, so there is nothing to recover.
    }
  }

  return (
    <Card className="space-y-4 p-6" data-testid="upi-qr-panel">
      <div className="flex items-center gap-2">
        <QrCode size={17} className="text-primary" aria-hidden="true" />
        <h2 className="font-heading text-lg font-extrabold">Scan to pay with any UPI app</h2>
      </div>

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <img
          src={upi.imageDataUrl}
          alt={`UPI payment QR code for ${formatInr(upi.amount)}`}
          width={320}
          height={320}
          className="size-56 shrink-0 rounded-2xl border border-border/60 bg-white p-2"
          data-testid="upi-qr-image"
        />

        <div className="min-w-0 flex-1 space-y-3 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Amount
            </p>
            <p className="font-heading text-2xl font-black">{formatInr(upi.amount)}</p>
          </div>

          <dl className="space-y-1.5">
            <div className="flex items-center gap-2">
              <dt className="w-20 shrink-0 text-xs font-semibold text-muted-foreground">Pay to</dt>
              <dd className="min-w-0 truncate font-semibold">{upi.payeeVpa}</dd>
              <button
                type="button"
                onClick={() => void copyVpa()}
                className="soft-button inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                aria-label="Copy UPI ID"
              >
                {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <dt className="w-20 shrink-0 text-xs font-semibold text-muted-foreground">Reference</dt>
              <dd className="min-w-0 truncate font-mono text-xs">{upi.reference}</dd>
            </div>
          </dl>

          <div
            className="flex items-start gap-2 rounded-xl bg-accent/10 p-3 text-xs leading-relaxed text-muted-foreground"
            data-testid="upi-not-proof"
          >
            <ShieldAlert size={14} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
            <p>
              <strong className="text-foreground">This QR is not a receipt.</strong> Revaro confirms
              your payment with the provider automatically — you do not need to tap anything once
              you have paid.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {onCheckStatus && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onCheckStatus}
                disabled={isChecking}
              >
                <RefreshCw size={14} aria-hidden="true" className={isChecking ? "animate-spin" : undefined} />
                {isChecking ? "Checking…" : "Check status"}
              </Button>
            )}
            {onCancel && (
              <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
                Cancel payment
              </Button>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground" aria-live="polite">
            {statusCopy(status)}
          </p>
        </div>
      </div>
    </Card>
  );
}

/** One line per non-terminal status; the terminal ones are handled by the page. */
function statusCopy(status: PaymentStatus): string {
  switch (status) {
    case "PROCESSING":
      return "We can see your payment is being processed.";
    case "PENDING":
      return "Waiting for the payment to reach us. This updates on its own.";
    default:
      return "Checking with the payment provider…";
  }
}
