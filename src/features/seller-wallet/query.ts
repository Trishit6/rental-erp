import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query/keys";
import { syncWalletPayouts, syncWalletTransactions } from "@/lib/tanstack-db/sync";
import {
  deletePayoutMethod as deletePayoutMethodRequest,
  fetchPayoutMethods,
  fetchWalletOverview,
  fetchWalletPayout,
  fetchWalletPayouts,
  fetchWalletTransactions,
  requestPayout as requestPayoutRequest,
  savePayoutMethod as savePayoutMethodRequest,
} from "./api";
import { walletKeyOf } from "./resolve";
import type { WalletParams } from "./types";

/**
 * Wallet queries and mutations.
 *
 * ## Why the keys carry the whole parameter bag
 *
 * `["seller","me","wallet","transactions", {filter,range,search,page}]` — the whole
 * window, not just the page. Two filter sets are different data, and a key that
 * omitted the filter would show the seller's payouts under the heading "Sales" the
 * moment they changed chip.
 *
 * ## Why a payout invalidates the whole `walletAll` prefix
 *
 * Requesting one changes the available balance, adds a ledger row, adds a payout row
 * and, if the seller then watches it, moves all four. Rather than enumerate the six
 * keys that could be stale, one prefix invalidate reconciles them together — and the
 * response already carries the new balance, so the cards never have to be patched by
 * hand. Guessing at which keys a write touched is how a page ends up showing a
 * ₹50,000 balance next to a ₹60,000 ledger.
 */

/**
 * The overview: balance, breakdown and the series.
 *
 * `placeholderData: previous` keeps the chart on screen while the window changes.
 * Without it every chip click blanks the page for a moment, which reads as "you have
 * no earnings" rather than "loading" — the same reason the analytics page does it.
 */
export function useWalletOverview(params: Partial<WalletParams> = {}) {
  return useQuery({
    queryKey: queryKeys.walletOverview(walletKeyOf(params)),
    queryFn: () => fetchWalletOverview(params),
    placeholderData: (previous) => previous,
  });
}

/**
 * The paginated ledger.
 *
 * Mirrored into TanStack DB after it lands, so the balance card's "latest entries" and
 * this list read the same rows rather than being two fetches that happened to agree.
 */
export function useWalletTransactions(params: WalletParams) {
  return useQuery({
    queryKey: queryKeys.walletTransactions(walletKeyOf(params)),
    queryFn: async () => {
      const result = await fetchWalletTransactions(params);
      syncWalletTransactions(result.rows);
      return result;
    },
    placeholderData: (previous) => previous,
  });
}

export function useWalletPayouts(params: Partial<WalletParams> = {}) {
  return useQuery({
    queryKey: queryKeys.walletPayouts(walletKeyOf(params)),
    queryFn: async () => {
      const rows = await fetchWalletPayouts(params);
      syncWalletPayouts(rows);
      return rows;
    },
    placeholderData: (previous) => previous,
  });
}

export function useWalletPayout(reference: string) {
  return useQuery({
    queryKey: queryKeys.walletPayout(reference),
    queryFn: () => fetchWalletPayout(reference),
    enabled: reference.length > 0,
  });
}

/** Saved destinations. Nothing here is cacheable across sessions. */
export function usePayoutMethods() {
  return useQuery({
    queryKey: queryKeys.walletMethods,
    queryFn: fetchPayoutMethods,
  });
}

/**
 * Request a payout.
 *
 * ## The toast is conditional, and that is the point
 *
 * `created: false` means the server recognised the idempotency key and returned the
 * payout that already existed. That is a **retry succeeding**, not a new request —
 * two different things that look identical to the seller if the confirmation is a
 * fixed string, and one of them would leave them believing they had asked twice.
 */
export function useRequestPayout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      amount: number;
      methodId: number;
      note?: string;
      idempotencyKey: string;
    }) => requestPayoutRequest(input),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.walletAll });
      toast.success(
        result.created
          ? `Requested ${result.payout.payoutNumber}. We'll confirm once it's been paid out.`
          : `We already have this request — ${result.payout.payoutNumber} is on its way.`,
      );
    },
  });
}

/**
 * Save a destination.
 *
 * Invalidates the methods list *and* the whole wallet prefix, because setting a new
 * default changes which destination the request form pre-selects — and a form still
 * pointing at the old one would send the next payout somewhere the seller had just
 * stopped using.
 */
export function useSavePayoutMethod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      type: "BANK" | "UPI";
      accountHolder: string;
      maskedLabel: string;
      isDefault: boolean;
    }) => savePayoutMethodRequest(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.walletAll });
      toast.success("Payout destination saved.");
    },
  });
}

export function useDeletePayoutMethod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deletePayoutMethodRequest(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.walletAll });
      toast.success("Payout destination removed.");
    },
  });
}
