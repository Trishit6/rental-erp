import { PiggyBank, ShieldCheck, Undo2 } from "lucide-react";
import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import { formatInr } from "@/lib/pricing";
import { cn } from "@/lib/utils/cn";
import { depositStatusLabel, type DepositStatus } from "../types";

/**
 * The security deposit, and what is happening to it.
 *
 * The status is derived by the server, and only two of the four states are
 * reachable today: `HELD` while the item is out, `RELEASE_PENDING` once it is
 * back. `RELEASED` is deliberately never shown, because no refund has actually
 * been issued — telling a customer their deposit is released when no money has
 * moved is the exact claim this avoids. When the refund lands, that is a
 * follow-up feature's job to say so.
 */
const ICONS: Record<string, ComponentType<LucideProps>> = {
  HELD: ShieldCheck,
  RELEASE_PENDING: Undo2,
  RELEASED: Undo2,
  ADJUSTED: PiggyBank,
};

const TONE: Record<string, string> = {
  HELD: "bg-accent/15 text-accent",
  RELEASE_PENDING: "bg-primary/12 text-primary",
  RELEASED: "bg-accent/15 text-accent",
  ADJUSTED: "bg-destructive/12 text-destructive",
};

export function RentalSecurityDeposit({
  amount,
  status,
  className,
}: {
  amount: number;
  status: DepositStatus | null;
  className?: string;
}) {
  if (amount <= 0) return null;

  const key = status ?? "HELD";
  const Icon = ICONS[key] ?? ShieldCheck;

  return (
    <div className={cn("inset-surface rounded-2xl p-4", className)} data-testid="rental-deposit">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Security deposit
          </p>
          <p className="mt-1 font-heading text-xl font-black tabular-nums">{formatInr(amount)}</p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold",
            TONE[key] ?? TONE.HELD,
          )}
        >
          <Icon size={11} aria-hidden="true" />
          {depositStatusLabel(status)}
        </span>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        {key === "HELD"
          ? "We're holding this while you have the item. It is returned to you once the item is checked in."
          : key === "RELEASE_PENDING"
            ? "The item is back with the seller. Your deposit is queued for release — we'll confirm once it has been paid out."
            : key === "RELEASED"
              ? "This deposit has been released to you."
              : "This deposit was adjusted."}
      </p>
    </div>
  );
}
