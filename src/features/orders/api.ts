import { api } from "@/lib/api/client";
import type { OrderDetailsResponse, OrderListResponse } from "./types";
import type { OrdersSearch } from "./components/schema";

/**
 * Every network call the orders feature makes.
 *
 * No React, no state, no UI: this module takes a query and returns data, which
 * is what keeps it usable from a query hook, a prefetch, or a test without
 * mounting anything.
 *
 * The user is never a parameter. The server derives the owner from the session
 * cookie, so there is no way to request someone else's orders even by editing a
 * request — the same reason no function here accepts a `userId`.
 */

function toQueryString(search: OrdersSearch, keys: (keyof OrdersSearch)[]): string {
  const params = new URLSearchParams();
  for (const key of keys) {
    const value = search[key];
    if (value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function getOrders(search: OrdersSearch = {}): Promise<OrderListResponse> {
  const { data, pagination } = await api.get<OrderListResponse["orders"]>(
    `/orders${toQueryString(search, ["page", "search", "status", "type", "sort", "from", "to"])}`,
  );

  return {
    orders: data,
    total: pagination?.total ?? data.length,
    page: pagination?.page ?? search.page ?? 1,
    pageSize: pagination?.pageSize ?? data.length,
    totalPages: pagination?.totalPages ?? 1,
  };
}

/**
 * One order, by its public `RV-2026-XXXXXX` number or its legacy numeric id.
 *
 * The number is what the UI links with, because a URL is user-visible and
 * shareable and a sequential database id leaks how much business the marketplace
 * does. The server accepts either so old links keep working.
 */
export async function getOrderByRef(ref: string | number): Promise<OrderDetailsResponse> {
  return (await api.get<OrderDetailsResponse>(`/orders/${encodeURIComponent(String(ref))}`)).data;
}
