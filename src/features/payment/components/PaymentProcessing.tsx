import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/pricing";
import type { PaymentStatus } from "../types";
import { statusCopy } from "./schema";

/** How long to wait for the provider before offering a way out. */
const PROVIDER_TIMEOUT_MS = 45_000;
/** Spinner rotations before the animation gives up and becomes static. */
const MAX_ROTATIONS = 45;

export function PaymentProcessing({
  status,
  amount,
  currency,
  onCancel,
  onCheckStatus,
}: {
  status: PaymentStatus;
  amount: number;
  currency: string;
  onCancel?: () => void;
  onCheckStatus?: () => void;
}) {
  const [timedOut, setTimedOut] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const copy = statusCopy(status);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), PROVIDER_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="page-wrap max-w-lg py-16 text-center" data-testid="payment-processing">
      <div className="mx-auto flex size-20 items-center justify-center">
        {prefersReducedMotion || timedOut ? (
          <Loader2 size={40} className="text-primary" aria-hidden="true" />
        ) : (
          <motion.span
            className="flex size-20 items-center justify-center"
            animate={{ rotate: 360 }}
            transition={{
              duration: 1.1,
              ease: "linear",
              // Bounded rather than infinite: an animation that never stops
              // would outlive the provider it is waiting for.
              repeat: MAX_ROTATIONS,
            }}
          >
            <Loader2 size={40} className="text-primary" aria-hidden="true" />
          </motion.span>
        )}
      </div>

      <h1 className="section-title mt-6 text-2xl">{copy.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{copy.description}</p>
      <p className="mt-4 font-heading text-xl font-black tabular-nums">
        {formatInr(amount)}{" "}
        <span className="text-xs font-semibold text-muted-foreground">{currency}</span>
      </p>

      {/* Announced politely: a screen-reader user would otherwise get silence
          while a payment is in flight. */}
      <p role="status" aria-live="polite" className="sr-only">
        {copy.title}. {copy.description}
      </p>

      {timedOut && (
        <div
          className="raised-surface mt-8 space-y-3 p-5 text-left"
          role="alert"
          data-testid="payment-timeout"
        >
          <p className="flex items-start gap-2 text-sm font-semibold">
            <TriangleAlert size={15} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
            This is taking longer than usual.
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Your payment provider has not confirmed yet. Do not pay again — check the status first,
            and we will only charge you once.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {onCheckStatus && (
              <Button size="sm" onClick={onCheckStatus}>
                Check status
              </Button>
            )}
            {onCancel && (
              <Button size="sm" variant="secondary" onClick={onCancel}>
                Cancel payment
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The development provider's stand-in.
 *
 * Exists only because no real provider is configured, and it is deliberately
 * loud about that: a bordered, labelled simulation panel rather than something
 * that looks like a bank's page. The buttons it offers are the two a real
 * provider's UI would return — approval and cancellation — so swapping in a
 * genuine SDK later changes the wiring, not the flow.
 */
export function DevPaymentSimulator({
  amount,
  currency,
  isSubmitting,
  onApprove,
  onDecline,
}: {
  amount: number;
  currency: string;
  isSubmitting: boolean;
  onApprove: () => void;
  onDecline: () => void;
}) {
  return (
    <div
      className="page-wrap max-w-lg pb-16"
      data-testid="dev-payment-simulator"
      role="group"
      aria-label="Simulated payment provider"
    >
      <div className="raised-surface space-y-4 border-2 border-dashed border-primary/40 p-5">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
            Simulated
          </span>
          <h2 className="text-sm font-bold">Development payment provider</h2>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          This is a stand-in for a real payment provider. No bank is contacted, no money moves and
          no credentials are collected. A real provider would render its own secure payment page
          here instead.
        </p>

        <p className="text-sm font-semibold tabular-nums">
          Simulated charge: {formatInr(amount)}{" "}
          <span className="text-xs text-muted-foreground">{currency}</span>
        </p>

        <div className="flex flex-wrap gap-2">
          <Button onClick={onApprove} disabled={isSubmitting} data-testid="dev-approve">
            {isSubmitting ? "Confirming..." : "Simulate approval"}
          </Button>
          <Button variant="secondary" onClick={onDecline} disabled={isSubmitting}>
            Simulate decline
          </Button>
        </div>
      </div>
    </div>
  );
}
