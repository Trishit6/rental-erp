import { format } from "date-fns";
import { Receipt } from "lucide-react";
import { formatInr } from "@/lib/pricing";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { payoutStatusLabel, payoutStatusTone } from "./labels";
import type { WalletPayout } from "../types";

/**
 * Every payout this seller has asked for.
 *
 * ## "Requested" is not "paid"
 *
 * There is no provider behind this. The strongest claim the page can make is that the
 * request exists and has not yet been confirmed, so the heading says exactly that and
 * the badge is `payoutStatusLabel`'s wording rather than a tick. A green "Paid out"
 * badge that appeared the moment the button was pressed would be a lie about somebody
 * else's money — the whole reason this workflow stops at "requested" is that a human
 * has to go and do the transfer first.
 *
 * ## The failure reason is shown, not hidden behind a status chip
 *
 * A seller whose payout came back needs to know *why*, and "FAILED" alone is not an
 * answer. The reason is written by the administrator who refused it and is displayed
 * verbatim, because a paraphrase would be the platform inventing an explanation for
 * its own decision.
 *
 * ## Rows are clickable rather than nested links
 *
 * The whole row opens the detail panel through an accessible button, rather than a
 * `<Link>` wrapped around cells that already contain text. A link whose contents are
 * a formatted amount is announced as "link, minus two thousand rupees", which is not
 * what the seller is choosing.
 */
export function WalletPayoutHistory({
  payouts,
  loading = false,
  onSelect,
}: {
  payouts: WalletPayout[];
  loading?: boolean;
  /** Opens the detail panel. Omitted on the overview, where the list stands alone. */
  onSelect?: (payoutNumber: string) => void;
}) {
  if (loading && payouts.length === 0) {
    return (
      <Card className="space-y-3 p-5" aria-busy="true">
        <div className="h-5 w-44 animate-pulse rounded bg-muted" />
        <div className="h-16 animate-pulse rounded-2xl bg-muted" />
        <span className="sr-only">Loading your payouts…</span>
      </Card>
    );
  }

  if (payouts.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="No payouts yet"
        description="When you request a payout, it will appear here with its status and anything we need to tell you about it."
      />
    );
  }

  return (
    <Card className="space-y-3 p-5">
      <h2 className="font-heading text-lg font-extrabold">Payouts</h2>

      <ul className="divide-y divide-border/40">
        {payouts.map((payout) => (
          <li key={payout.id}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(payout.payoutNumber)}
                className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 py-3 text-left transition hover:bg-primary/5"
              >
                <PayoutBody payout={payout} />
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                <PayoutBody payout={payout} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * One row's contents.
 *
 * Split out so the button and non-interactive variants cannot drift — the button's
 * extra behaviour is the `onClick`, not a second copy of the layout.
 */
function PayoutBody({ payout }: { payout: WalletPayout }) {
  return (
    <>
      <span className="w-28 shrink-0 font-mono text-xs">{payout.payoutNumber}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{formatInr(payout.amount)}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {payout.methodLabel}
          {payout.note && ` · ${payout.note}`}
        </span>
        {payout.failureReason && (
          <span className="mt-1 block text-xs font-semibold text-destructive">
            {payout.failureReason}
          </span>
        )}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {format(new Date(payout.requestedAt), "d MMM yyyy")}
      </span>
      <Badge className={payoutStatusTone(payout.status)}>{payoutStatusLabel(payout.status)}</Badge>
    </>
  );
}
