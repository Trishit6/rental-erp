import { api } from "@/lib/api/client";
import type {
  AnalyticsParams,
  OnboardingPayload,
  PublicSeller,
  SellerAnalytics,
  SellerEarnings,
  SellerProfile,
  SellerStatus,
  SellerSummary,
  SellerTransaction,
} from "./types";

/**
 * Every network call the seller dashboard, analytics, onboarding and settings
 * pages make. Components never import this file — they use `./query`, so
 * caching and invalidation stay in one place.
 *
 * ## What the client is never allowed to send
 *
 * There is deliberately **no `sellerId`, `userId` or `ownerId`** anywhere below.
 * The server takes the seller from the session cookie and puts it in the same
 * `WHERE` clause as every other predicate, so a body carrying one would be
 * ignored rather than obeyed — and silently ignoring it is precisely how the
 * next maintainer wires one up expecting it to do something.
 */

/**
 * Fetch only what the server will accept.
 *
 * `toQueryString` below omits blank values, and the `period`/`metric` values are
 * narrowed to their unions before they get here, so an out-of-vocabulary value
 * cannot be sent by a caller holding a loosened type.
 */
function toQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

/* ------------------------------- onboarding ------------------------------- */

/** Gated on `requireUser`, not `requireSeller` — it answers "am I one yet?". */
export async function fetchSellerStatus(): Promise<SellerStatus> {
  return (await api.get<SellerStatus>("/seller/onboarding")).data;
}

export async function becomeSeller(payload: OnboardingPayload) {
  return (
    await api.post<{ isSeller: boolean; profileId: number }>("/seller/onboarding", payload)
  ).data;
}

/* -------------------------------- summary --------------------------------- */

export async function fetchSellerSummary(): Promise<SellerSummary> {
  return (await api.get<SellerSummary>("/seller/summary")).data;
}

/* ------------------------------- analytics -------------------------------- */

export async function fetchSellerAnalytics(
  params: AnalyticsParams,
): Promise<SellerAnalytics> {
  return (
    await api.get<SellerAnalytics>(
      `/seller/analytics${toQueryString({
        period: params.period,
        from: params.from,
        to: params.to,
        metric: params.metric,
      })}`,
    )
  ).data;
}

/* -------------------------------- earnings -------------------------------- */

export async function fetchSellerEarnings(): Promise<SellerEarnings> {
  return (await api.get<SellerEarnings>("/seller/earnings")).data;
}

export async function fetchSellerTransactions(): Promise<SellerTransaction[]> {
  return (await api.get<SellerTransaction[]>("/seller/transactions")).data;
}

/* --------------------------------- profile -------------------------------- */

/** The caller's own shopfront record, editable. Seller-scoped. */
export async function fetchOwnSellerProfile(): Promise<SellerProfile> {
  return (await api.get<SellerProfile>("/seller/profile")).data;
}

export async function updateOwnSellerProfile(payload: {
  bio?: string | null;
  location?: string | null;
  responseRateHours?: number | null;
}) {
  return (await api.patch<{ updated: boolean }>("/seller/profile", payload)).data;
}

/**
 * Somebody else's shopfront — **public**, no session required.
 *
 * Note the path: `/sellers/:id`, not `/seller/profile/:id`. The old one sat
 * inside the router that every seller-management handler now gates on a role
 * check, so keeping it there would have meant a public read inheriting a 403.
 */
export async function fetchPublicSeller(id: number): Promise<PublicSeller> {
  return (await api.get<PublicSeller>(`/sellers/${id}`)).data;
}