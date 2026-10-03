import type { PayoutStatus, WalletFilter, WalletRange, WalletType } from "../types";

/**
 * Human labels for the wallet's stored vocabulary.
 *
 * ## Why this lives here and not in the components
 *
 * The database stores `PLATFORM_FEE`, `PAYOUT_REVERSAL`, `AVAILABLE`. A seller reads
 * "Platform fee", "Payout not completed", "Available to withdraw". The mapping is one
 * fact, and it is needed by the ledger list, the payout list, the detail panel and the
 * filter chips — so it is written once.
 *
 * It is also deliberately *not* derived by string-munging. `PAYOUT_REVERSAL`
 * lowercased and split becomes "Payout reversal", which is almost but not quite what a
 * seller needs to read — and the exception is exactly the kind of thing that gets
 * re-implemented per component and then drifts.
 */

const TYPE_LABELS: Record<WalletType, string> = {
  SALE: "Sale",
  RENTAL: "Rental",
  PLATFORM_FEE: "Platform fee",
  REFUND: "Refund",
  PAYOUT: "Payout",
  PAYOUT_REVERSAL: "Payout not completed",
  ADJUSTMENT: "Adjustment",
};

export function walletTypeLabel(type: WalletType): string {
  return TYPE_LABELS[type] ?? type;
}

/**
 * A short label for the filter chip and the ledger row's type badge.
 *
 * `Payout not completed` is right in prose and wrong in a narrow badge column, so the
 * row gets `Reversed` and the detail panel gets the full sentence.
 */
export function walletTypeBadge(type: WalletType): string {
  return type === "PAYOUT_REVERSAL" ? "Reversed" : (TYPE_LABELS[type] ?? type);
}

/**
 * Status wording for an **earning** row.
 *
 * `PENDING` is the one that matters. It does not mean "processing" — it means the
 * money has been earned and is sitting out the settlement delay so a buyer can still
 * return the item. Saying "processing" would imply somebody is doing something about
 * it, which is the impression a wallet must not give.
 */
const EARNING_STATUS_LABELS: Record<string, string> = {
  PENDING: "Settling",
  AVAILABLE: "Available",
  REVERSED: "Reversed",
};

export function earningStatusLabel(status: string): string {
  return EARNING_STATUS_LABELS[status] ?? status.charAt(0) + status.slice(1).toLowerCase();
}

/**
 * Status wording for a **payout** row.
 *
 * The distinction that carries the weight is `PENDING` → "Requested". "Pending" is
 * ambiguous in a payout list: it could mean waiting for the seller, or waiting for
 * money that has not moved. The seller is not the thing being waited on, and the page
 * should not imply they are.
 */
const PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
  PENDING: "Requested",
  PROCESSING: "Being sent",
  COMPLETED: "Paid out",
  FAILED: "Not completed",
  CANCELLED: "Cancelled",
};

export function payoutStatusLabel(status: PayoutStatus): string {
  return PAYOUT_STATUS_LABELS[status] ?? status;
}

/**
 * Badge tone for an earning status.
 *
 * `AVAILABLE` is the only positive tone. `PENDING` is deliberately neutral rather
 * than amber: amber reads as "something is wrong", and settling is the normal,
 * expected state of money earned three days ago.
 */
export function earningStatusTone(status: string): string {
  switch (status) {
    case "AVAILABLE":
      return "bg-accent/12 text-accent";
    case "PENDING":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-destructive/12 text-destructive";
  }
}

export function payoutStatusTone(status: PayoutStatus): string {
  switch (status) {
    case "COMPLETED":
      return "bg-accent/12 text-accent";
    case "FAILED":
      return "bg-destructive/12 text-destructive";
    case "CANCELLED":
      return "bg-destructive/12 text-destructive";
    case "PROCESSING":
      return "bg-primary/12 text-primary";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/**
 * Does this row **add** to the balance or take from it?
 *
 * Read off the sign of the amount, which is the whole reason the amount crosses the
 * wire signed. A debit row shown with the same `+` treatment as a credit is how a
 * refund turns into an apparent top-up.
 */
export function isCredit(amount: number): boolean {
  return amount >= 0;
}

/**
 * What a row is doing to the wallet right now.
 *
 * `PENDING` earnings are earning; `AVAILABLE` earnings are banked; `REVERSED` earns
 * nothing at all, which is the point of the state. Saying "Reversed" rather than
 * hiding the row is deliberate — a seller whose sale was returned should be able to
 * see that it happened.
 */
export function rowEffect(type: WalletType, status: string): "earning" | "withdrawn" | "reversed" {
  if (status === "REVERSED") return "reversed";
  if (type === "PAYOUT" || type === "PAYOUT_REVERSAL") return "withdrawn";
  return "earning";
}

/**
 * A plain-language sentence for the empty ledger.
 *
 * The copy matters more than usual here: an empty wallet is the *normal* state for a
 * seller whose first item has not sold yet, and "No transactions" reads as a failure
 * of the page rather than a fact about their business.
 */
export function emptyLedgerCopy(filter: WalletFilter): { title: string; description: string } {
  switch (filter) {
    case "sales":
      return {
        title: "No sales yet",
        description: "Once a customer takes delivery of something you listed, it appears here.",
      };
    case "rentals":
      return {
        title: "No rentals yet",
        description: "Rentals are recorded when an item comes back, not when it is booked.",
      };
    case "refunds":
      return {
        title: "No refunds",
        description: "Nothing you earned has been returned or reversed.",
      };
    case "fees":
      return {
        title: "No fees yet",
        description: "The platform fee on each sale and rental is recorded here.",
      };
    case "payouts":
      return {
        title: "No payouts yet",
        description: "When you request a payout, it will show up here with its status.",
      };
    case "adjustments":
      return {
        title: "No adjustments",
        description: "Any correction made to your balance by support would appear here.",
      };
    default:
      return {
        title: "Your wallet is empty",
        description:
          "Earnings appear here once a customer takes delivery of an item, or returns a rental.",
      };
  }
}

/** The chips, in the order a seller reads their own history. */
export const FILTER_CHIP_ORDER: readonly WalletFilter[] = [
  "all",
  "sales",
  "rentals",
  "refunds",
  "fees",
  "payouts",
  "adjustments",
];

/** The window chips. `today` leads because it is the question people ask most. */
export const RANGE_CHIP_ORDER: readonly WalletRange[] = [
  "today",
  "7d",
  "30d",
  "90d",
  "ytd",
  "custom",
];
