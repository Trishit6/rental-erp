import { useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import { AlertTriangle, Info, Wallet } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import { formatInr } from "@/lib/pricing";
import { useAuth } from "@/lib/auth/auth-context";
import { Button } from "@/components/ui/button";
import {
  useCancelPayment,
  useCreatePaymentIntent,
  useIdempotencyKey,
  usePaymentProviderInfo,
  usePaymentStatus,
  usePaymentSummary,
  useVerifyPayment,
} from "../query";
import {
  isReviewRequired,
  type OrderConfirmation,
  type PaymentIntent,
  type PaymentMethod,
} from "../types";
import { parsePaymentSearch, type PaymentStep } from "./schema";
import { PaymentCancelled } from "./PaymentCancelled";
import { PaymentErrorState } from "./PaymentErrorState";
import { PaymentFailed } from "./PaymentFailed";
import { PaymentMethodSelector } from "./PaymentMethodSelector";
import { PaymentProcessing, DevPaymentSimulator } from "./PaymentProcessing";
import { PaymentSecurityNotice } from "./PaymentSecurityNotice";
import { PaymentSkeleton } from "./PaymentSkeleton";
import { PaymentSuccess } from "./PaymentSuccess";
import { PaymentSummary as PaymentSummaryView } from "./PaymentSummary";

/**
 * The payment page.
 *
 * A small explicit state machine — `method → processing → success | failed |
 * cancelled` — rather than a pile of booleans. The transitions are the part
 * that has to be right: a payment is never shown as successful because the
 * browser said so, only because the server returned a confirmed order.
 *
 * Everything shown here is the server's. The page renders `PaymentSummary`
 * figures verbatim and sends no amount in any request.
 */
export function PaymentPage() {
  const { user } = useAuth();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const { deliveryMethod, deliveryAddressId } = parsePaymentSearch(search);

  const [step, setStep] = useState<PaymentStep>("method");
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [confirmation, setConfirmation] = useState<OrderConfirmation | null>(null);
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [reviewCode, setReviewCode] = useState<string | null>(null);

  const getIdempotencyKey = useIdempotencyKey();

  const providerQuery = usePaymentProviderInfo();
  const summaryQuery = usePaymentSummary({ deliveryMethod, deliveryAddressId });
  const statusQuery = usePaymentStatus(
    step === "processing" ? (intent?.transactionId ?? null) : null,
  );

  const createIntent = useCreatePaymentIntent();
  const verify = useVerifyPayment(intent?.transactionId ?? 0);
  const cancel = useCancelPayment();

  /* --- 1. Not signed in. The route guards this; this is belt and braces. --- */
  if (!user) {
    return (
      <PaymentErrorState
        title="Sign in to pay"
        description="You need to be signed in to complete a payment."
      />
    );
  }

  /* --- 2. Could not load the page at all. --------------------------------- */
  if (summaryQuery.isError) {
    const error = summaryQuery.error;
    return (
      <PaymentErrorState
        description={
          error instanceof ApiError && error.code === "EMPTY_CART"
            ? "There's nothing in your cart to pay for."
            : "Something went wrong loading your payment details. Please try again."
        }
      />
    );
  }

  if (summaryQuery.isPending || !summaryQuery.data) {
    return <PaymentSkeleton />;
  }

  const summary = summaryQuery.data;
  const isDevelopmentMock = summary.isProductionReady === false;

  /* --- 3. Terminal states ------------------------------------------------- */
  if (step === "success" && confirmation) {
    return <PaymentSuccess confirmation={confirmation} isDevelopmentMock={isDevelopmentMock} />;
  }
  if (step === "failed") {
    return (
      <PaymentFailed
        reason={failureReason}
        isRetrying={verify.isPending}
        onRetry={() => {
          setFailureReason(null);
          setReviewCode(null);
          setStep(intent?.resumable ? "processing" : "method");
        }}
      />
    );
  }
  if (step === "cancelled") {
    return (
      <PaymentCancelled
        onResume={() => {
          setStep("method");
          setIntent(null);
        }}
      />
    );
  }

  /* --- 4. In flight ------------------------------------------------------ */
  if (step === "processing" && intent) {
    const serverStatus = statusQuery.data?.status ?? intent.status;
    return (
      <>
        <PaymentProcessing
          status={serverStatus}
          amount={intent.amount}
          currency={intent.currency}
          onCheckStatus={() => void statusQuery.refetch()}
          onCancel={() => handleCancel()}
        />
        {isDevelopmentMock && intent.status === "PENDING" && (
          <DevPaymentSimulator
            amount={intent.amount}
            currency={intent.currency}
            isSubmitting={verify.isPending}
            onApprove={() => handleProviderComplete("approve")}
            onDecline={() => handleProviderComplete("decline")}
          />
        )}
      </>
    );
  }

  /* --- 5. Choose and pay -------------------------------------------------- */

  async function handlePay() {
    if (!selectedMethod) return;
    try {
      const created = await createIntent.mutateAsync({
        deliveryMethod,
        deliveryAddressId,
        paymentMethod: selectedMethod,
        // Reused across retries, so a double-submit re-opens the same attempt
        // instead of creating a second charge.
        idempotencyKey: getIdempotencyKey(),
      });
      setIntent(created);
      setStep("processing");
    } catch (error) {
      if (error instanceof ApiError) setReviewCode(error.code);
      toast.error(error instanceof Error ? error.message : "Could not start the payment.");
    }
  }

  /**
   * Ask the server to confirm. The request carries no amount and no success
   * flag — the server queries the provider, and only a real confirmation from
   * there produces an order.
   */
  async function handleProviderComplete(outcome: "approve" | "decline") {
    if (!intent) return;
    if (outcome === "decline") {
      await handleCancel();
      return;
    }
    try {
      const result = await verify.mutateAsync({
        paymentMethod: selectedMethod ?? undefined,
      });
      setConfirmation(result);
      setStep("success");
    } catch (error) {
      if (error instanceof ApiError && isReviewRequired(error.code)) {
        setReviewCode(error.code);
        setStep("method");
        void summaryQuery.refetch();
        return;
      }
      setFailureReason(error instanceof Error ? error.message : null);
      setStep("failed");
    }
  }

  async function handleCancel() {
    if (!intent) {
      setStep("cancelled");
      return;
    }
    try {
      await cancel.mutateAsync(intent.transactionId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel the payment.");
      return;
    }
    setStep("cancelled");
  }

  const blockingIssues = summary.issues;
  const canPay = summary.isPayable && Boolean(selectedMethod) && !createIntent.isPending;

  return (
    <div className="page-wrap max-w-5xl space-y-6 pb-28 pt-8 lg:pb-12">
      <div>
        <p className="eyebrow">Secure checkout</p>
        <h1 className="section-title mt-1 text-3xl">Payment</h1>
      </div>

      {/* The amount moved under the customer. Stop and make them look again
          rather than charging the new figure. */}
      {reviewCode && (
        <div
          className="raised-surface flex items-start gap-3 border-l-4 border-l-primary p-4"
          role="alert"
          data-testid="payment-review-required"
        >
          <AlertTriangle size={17} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
          <div className="text-sm">
            <p className="font-bold">Payment amount changed.</p>
            <p className="mt-0.5 text-muted-foreground">
              Please review your checkout again before paying.
            </p>
            <Button asChild size="sm" className="mt-3">
              <Link to="/checkout">Review checkout</Link>
            </Button>
          </div>
        </div>
      )}

      {isDevelopmentMock && (
        <div
          className="flex items-start gap-3 rounded-2xl bg-accent/10 p-4"
          data-testid="dev-mock-banner"
        >
          <Info size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            <strong className="text-foreground">Development mode.</strong> No payment provider is
            configured, so payments are simulated and no real money moves.
          </p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        {/* --- Method selection --- */}
        <div className="space-y-4">
          {blockingIssues.length > 0 ? (
            <section
              className="raised-surface space-y-3 p-5"
              role="alert"
              data-testid="payment-issues"
            >
              <h2 className="flex items-center gap-2 font-heading text-lg font-extrabold">
                <AlertTriangle size={17} className="text-primary" aria-hidden="true" />
                Your cart needs attention
              </h2>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                {blockingIssues.map((issue, i) => (
                  <li key={`${issue.code}-${i}`}>{issue.message}</li>
                ))}
              </ul>
              <Button asChild size="sm">
                <Link to="/cart">Review cart</Link>
              </Button>
            </section>
          ) : (
            <PaymentMethodSelector
              methods={providerQuery.data?.methods ?? []}
              value={selectedMethod}
              onChange={setSelectedMethod}
              isLoading={providerQuery.isPending}
              disabled={createIntent.isPending}
            />
          )}

          <PaymentSecurityNotice />
        </div>

        {/* --- Amount + pay --- */}
        <aside className="h-fit space-y-4 lg:sticky lg:top-24">
          <div className="raised-surface p-5">
            <PaymentSummaryView summary={summary} />
          </div>

          {/* Sticky on small screens so the primary action is always reachable
              without covering the summary above it.

              Not `MobileActionBar`: this one keeps its markup at `lg` (it becomes
              an inline block in the summary column rather than disappearing), so
              it cannot be swapped for a `lg:hidden` component. It still takes the
              `--layer-mobile-bar` rung — it used to be a bare `z-20`, the only
              un-tokenised layer in the app — and the same safe-area padding as the
              other two bars, so it clears a phone's home indicator. */}
          <div className="fixed inset-x-0 bottom-0 z-[var(--layer-mobile-bar)] border-t border-border/60 bg-background/95 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            <Button
              size="lg"
              className="w-full"
              onClick={handlePay}
              disabled={!canPay}
              aria-describedby="payment-pay-help"
            >
              <Wallet size={16} aria-hidden="true" />
              {createIntent.isPending
                ? "Starting payment..."
                : `Pay ${formatInr(summary.breakdown.grandTotal)}`}
            </Button>
            <p id="payment-pay-help" className="mt-2 text-center text-[11px] text-muted-foreground">
              {selectedMethod
                ? "You'll confirm on your provider's secure page."
                : "Choose a payment method to continue."}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
