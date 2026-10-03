import { format } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatInr } from "@/lib/pricing";
import { payoutStatusLabel, payoutStatusTone } from "./labels";
import { useWalletPayout } from "../query";
import type { WalletPayout } from "../types";

/**
 * One payout, in full.
 *
 * ## The timeline is the point, not the status badge
 *
 * A seller asking "did my money go?" wants to know *where it stopped*. The steps are
 * therefore rendered as an ordered list of timestamps, with the ones that have
 * happened dated and the ones that have not left blank — because "Waiting for an
 * administrator" is a materially different answer from "Paid on 3 Oct", and a single
 * badge cannot say which.
 *
 * A blank future step is deliberately shown rather than hidden: a four-step timeline
 * ending at step two tells the seller there is something still to come, which is the
 * honest reading of a workflow with a human in it.
 *
 * ## The failure reason is the administrator's, verbatim
 *
 * It is not paraphrased, softened or rewritten into house style. The platform did not
 * decide why a transfer bounced; the person who recorded the outcome knows, and their
 * words are what the seller needs.
 */
export function WalletPayoutDetails({
  payoutNumber,
  onClose,
}: {
  /** The public `PAY-…` reference, or `null` to close. */
  payoutNumber: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={payoutNumber !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {payoutNumber ? <PayoutDetailsBody reference={payoutNumber} /> : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Split out so the hooks run unconditionally.
 *
 * A `useWalletPayout(reference ?? "")` inline would be guarded by `enabled`, which is
 * correct — but only because the query key carries the reference and the fetch is
 * disabled for the empty one. Making that structural rather than a convention means
 * there is no way to add a render that forgets the guard.
 */
function PayoutDetailsBody({ reference }: { reference: string }) {
  const { data, isLoading, isError } = useWalletPayout(reference);

  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-32 w-full" />
        <span className="sr-only">Loading payout {reference}…</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <>
        <DialogTitle>Payout not found</DialogTitle>
        <DialogDescription>
          We could not find {reference}. If it is not yours, that is expected — this page only ever
          shows your own payouts.
        </DialogDescription>
      </>
    );
  }

  return (
    <>
      <DialogTitle>{data.payoutNumber}</DialogTitle>
      <DialogDescription>
        {payoutStatusLabel(data.status)} · requested{" "}
        {format(new Date(data.requestedAt), "d MMM yyyy, HH:mm")}
      </DialogDescription>

      <div className="mt-4 space-y-4">
        <div className="inset-surface flex items-baseline justify-between rounded-2xl px-4 py-3">
          <span className="text-sm text-muted-foreground">Amount</span>
          <span className="font-heading text-xl font-black">{formatInr(data.amount)}</span>
        </div>

        <dl className="space-y-2 text-sm">
          <Row label="Destination" value={data.methodLabel} />
          <Row label="Currency" value={data.currency} />
          {data.note && <Row label="Your note" value={data.note} />}
        </dl>

        <ol className="space-y-2">
          <Step
            label="Requested"
            at={data.requestedAt}
            note="You asked for this amount. Nothing has left your account yet."
          />
          <Step label="Being sent" at={data.processingAt} />
          <Step
            label="Paid out"
            at={data.completedAt}
            note="Recorded only after an administrator confirmed the transfer."
          />
        </ol>

        {data.failureReason && (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3">
            <p className="text-xs font-bold uppercase text-destructive">
              Why this did not complete
            </p>
            <p className="mt-1 text-sm">{data.failureReason}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              The amount is back in your available balance. Request it again once the problem is
              sorted.
            </p>
          </div>
        )}

        <p className="flex items-center gap-2">
          <Badge className={payoutStatusTone(data.status)}>{payoutStatusLabel(data.status)}</Badge>
          <StatusSentence payout={data} />
        </p>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  );
}

/**
 * One timeline step.
 *
 * Undated steps render the label alone, in muted text. Nothing is fabricated to fill
 * them in — a placeholder date would be a lie about a financial record, and the
 * difference between "not yet" and "never happened" is exactly what the seller is
 * reading this for.
 */
function Step({ label, at, note }: { label: string; at: string | null; note?: string }) {
  return (
    <li className="inset-surface rounded-2xl px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className={`text-sm font-bold ${at ? "" : "text-muted-foreground"}`}>{label}</span>
        <span className="text-xs text-muted-foreground">
          {at ? format(new Date(at), "d MMM yyyy, HH:mm") : "Not yet"}
        </span>
      </div>
      {at && note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </li>
  );
}

/**
 * The one sentence that says what happens next.
 *
 * Written per status rather than derived from the label, because the label answers
 * "what is it" and this answers "what do I do about it" — and for a completed payout
 * the honest next step is none at all.
 */
function StatusSentence({ payout }: { payout: WalletPayout }) {
  switch (payout.status) {
    case "PENDING":
      return <span className="text-xs text-muted-foreground">Waiting for an administrator.</span>;
    case "PROCESSING":
      return <span className="text-xs text-muted-foreground">Transfer under way.</span>;
    case "COMPLETED":
      return <span className="text-xs text-muted-foreground">Nothing more to do.</span>;
    case "FAILED":
    case "CANCELLED":
      return <span className="text-xs text-muted-foreground">You can request it again.</span>;
  }
}
