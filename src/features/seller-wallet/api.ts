import { api } from "@/lib/api/client";
import { timezoneOffsetMinutes } from "./components/schema";
import type {
  PayoutMethod,
  RequestPayoutResult,
  WalletOverview,
  WalletPayout,
  WalletParams,
  WalletTransaction,
} from "./types";
import { resolveWalletRequest } from "./resolve";

/**
 * Every network call the wallet page makes. Components never import this file — they
 * use `./query`, so caching and invalidation stay in one place.
 *
 * ## What the client is never allowed to send
 *
 * There is deliberately **no `sellerId`, `userId` or `ownerId`** anywhere below. The
 * server takes the seller from the session cookie and puts it in the same `WHERE`
 * clause as every other predicate, so a body carrying one would be ignored rather
 * than obeyed — and silently ignoring one is precisely how the next maintainer wires
 * it up expecting it to do something.
 *
 * There is no `status` on a payout request either. A seller cannot mark their own
 * payout paid, so there is no field in which to even express the attempt.
 */

/**
 * The parts of `WalletParams` the server needs, plus this browser's offset.
 *
 * The offset is the reason this helper exists rather than a bare `toQueryString`: it
 * is what makes `range=today` mean the seller's today rather than UTC's, and it has
 * to be attached to **every** request that carries a window, including the ones that
 * only draw a chart.
 */
function walletQuery(params: Partial<WalletParams> & { search?: string }): string {
  const resolved = resolveWalletRequest(params);
  const search = new URLSearchParams();

  if (params.filter && params.filter !== "all") search.set("filter", params.filter);
  if (params.range) search.set("range", resolved.range);
  if (resolved.range === "custom" && resolved.from && resolved.to) {
    search.set("from", resolved.from);
    search.set("to", resolved.to);
  }
  if (params.search) search.set("search", params.search);
  search.set("tz", String(timezoneOffsetMinutes()));

  return `?${search.toString()}`;
}

/** `GET /api/seller/wallet/overview` — the balance card, breakdown and chart. */
export async function fetchWalletOverview(
  params: Partial<WalletParams> = {},
): Promise<WalletOverview> {
  return (await api.get<WalletOverview>(`/seller/wallet/overview${walletQuery(params)}`)).data;
}

/**
 * `GET /api/seller/wallet/transactions` — one page of the ledger.
 *
 * `page` is appended rather than folded into `walletQuery`, because a filter change
 * must reset it and the page number is the one parameter that must **not** travel
 * with it.
 */
export async function fetchWalletTransactions(params: WalletParams): Promise<{
  rows: WalletTransaction[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}> {
  const query = walletQuery(params);
  const page = params.page > 1 ? `${query}&page=${params.page}` : query;
  const response = await api.get<WalletTransaction[]>(`/seller/wallet/transactions${page}`);

  return {
    rows: response.data,
    pagination: response.pagination ?? { page: 1, pageSize: 20, total: 0, totalPages: 1 },
  };
}

/**
 * `POST /api/seller/wallet/payouts` — request a payout.
 *
 * `idempotencyKey` is minted once per attempt and reused on a retry, so a request
 * that failed *after* the server committed does not reserve the money twice. The
 * server answers a repeat with the payout that already exists rather than creating
 * another, and the response's `created` flag is what tells the two apart.
 *
 * The amount crosses the wire as **whole paise**. The browser never multiplies a
 * rupee figure by 100 and calls the result money — that arithmetic belongs to the
 * server's integer column, and a float that reached it would poison every balance
 * derived from it.
 */
export async function requestPayout(input: {
  amount: number;
  methodId: number;
  note?: string;
  idempotencyKey: string;
}): Promise<RequestPayoutResult> {
  return (
    await api.post<RequestPayoutResult>("/seller/wallet/payouts", {
      amount: input.amount,
      methodId: input.methodId,
      ...(input.note ? { note: input.note } : {}),
      idempotencyKey: input.idempotencyKey,
    })
  ).data;
}

export async function fetchWalletPayouts(
  params: Partial<WalletParams> = {},
): Promise<WalletPayout[]> {
  return (await api.get<WalletPayout[]>(`/seller/wallet/payouts${walletQuery(params)}`)).data;
}

export async function fetchWalletPayout(reference: string): Promise<WalletPayout> {
  return (await api.get<WalletPayout>(`/seller/wallet/payouts/${reference}`)).data;
}

/**
 * Saved destinations. Only a masked label and a holder name exist to fetch — there
 * is no account-number endpoint because there is no account-number column.
 */
export async function fetchPayoutMethods(): Promise<PayoutMethod[]> {
  return (await api.get<PayoutMethod[]>("/seller/wallet/methods")).data;
}

export async function savePayoutMethod(input: {
  type: "BANK" | "UPI";
  accountHolder: string;
  maskedLabel: string;
  isDefault: boolean;
}): Promise<{ id: number }> {
  return (await api.post<{ id: number }>("/seller/wallet/methods", input)).data;
}

export async function deletePayoutMethod(id: number): Promise<void> {
  await api.delete<{ deleted: boolean }>(`/seller/wallet/methods/${id}`);
}
