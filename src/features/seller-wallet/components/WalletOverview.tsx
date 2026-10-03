import { Banknote, Clock, Lock, TrendingUp } from "lucide-react";
import { formatInr } from "@/lib/pricing";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { WalletBalance } from "../types";

/**
 * The four balance cards.
 *
 * ## Every number here came from a `SUM`
 *
 * `formatInr` is the only arithmetic-adjacent thing on this component, and it divides
 * by 100 to render a string. Nothing is added, subtracted or netted in the browser.
 * That is the point of the arrangement: if the client computed "available = earnings
 * − reserved − paid out" it would be a *second* implementation of the balance, and the
 * two would disagree the moment a payout moved between buckets — which is precisely
 * when a seller is most likely to be looking.
 *
 * ## The four cards answer four different questions
 *
 *  - **Available** — can I be paid out right now?
 *  - **Settling** — have I earned it but not got it yet?
 *  - **Reserved** — have I asked for it and not been paid yet?
 *  - **Paid out** — how much of this has left, ever?
 *
 * Conflating the middle two is the mistake worth avoiding. "Settling" is money the
 * seller has earned and the platform is holding through a return window; "Reserved" is
 * money the seller has explicitly asked for and an administrator has not yet acted on.
 * They have different reasons and different next steps, so they get different cards.
 */
export function WalletBalanceCards({
  balance,
  loading = false,
  settlementDelayDays = 3,
}: {
  balance: WalletBalance | undefined;
  loading?: boolean;
  /** Read from the server response so the copy cannot drift from the enforcement. */
  settlementDelayDays?: number;
}) {
  if (loading && !balance) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index} className="space-y-3 p-5">
            <Skeleton className="size-10 rounded-2xl" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-28" />
          </Card>
        ))}
        <span className="sr-only">Loading your balance…</span>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <BalanceCard
        icon={Banknote}
        label="Available to withdraw"
        value={balance?.availablePaise ?? 0}
        note="Released and not reserved"
        emphasis
      />
      <BalanceCard
        icon={Clock}
        label="Settling"
        value={balance?.pendingPaise ?? 0}
        note={
          settlementDelayDays > 0
            ? `Released ${settlementDelayDays} days after delivery`
            : "Released after delivery"
        }
      />
      <BalanceCard
        icon={Lock}
        label="Reserved by payouts"
        value={balance?.reservedPaise ?? 0}
        note="Requested, awaiting payment"
      />
      <BalanceCard
        icon={TrendingUp}
        label="Paid out"
        value={balance?.lifetimePaidOutPaise ?? 0}
        note="All time, once confirmed"
      />
    </div>
  );
}

function BalanceCard({
  icon: Icon,
  label,
  value,
  note,
  emphasis = false,
}: {
  icon: React.ComponentType<{ size?: number | string }>;
  label: string;
  value: number;
  note: string;
  emphasis?: boolean;
}) {
  return (
    <Card className={`p-5 ${emphasis ? "border-primary/30" : ""}`}>
      <span className="soft-button flex size-10 items-center justify-center rounded-2xl text-primary">
        <Icon size={18} aria-hidden />
      </span>
      <p className="mt-3 text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="font-heading text-2xl font-black">{formatInr(value)}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
    </Card>
  );
}

/**
 * The lifetime strip.
 *
 * Gross, fees and refunds as three separate numbers rather than one net figure.
 * "You earned ₹84,200, we kept ₹4,210" is a statement the seller can check; a single
 * netted number invites the question and cannot answer it. The refund figure is shown
 * too, because money that came back is a fact a seller wants stated plainly rather
 * than discovered later.
 */
export function WalletLifetimeStrip({ balance }: { balance: WalletBalance | undefined }) {
  if (!balance) return null;

  return (
    <div className="inset-surface flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl px-5 py-3 text-sm">
      <Stat label="Earned" value={balance.lifetimeEarnedPaise} />
      <Stat label="Platform fees" value={-balance.lifetimeFeesPaise} muted />
      <Stat label="Refunded" value={-balance.lifetimeRefundsPaise} muted />
      <p className="text-xs text-muted-foreground">
        Security deposits are excluded — they are held, not earned.
      </p>
    </div>
  );
}

function Stat({ label, value, muted = false }: { label: string; value: number; muted?: boolean }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <span className={`font-bold ${muted ? "text-muted-foreground" : ""}`}>
        {formatInr(value)}
      </span>
    </span>
  );
}
