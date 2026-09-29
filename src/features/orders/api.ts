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

/* ------------------------------- mutations --------------------------------- */

/**
 * Cancel one of the caller's own orders. The reason is information for the
 * seller; *whether* the cancellation happens is decided entirely by the server.
 * The body is strict on the server, so no client-side amount or status field
 * could ever be smuggled through even by accident.
 */
export async function cancelOrder(
  ref: string | number,
  reason: { reason?: string; reasonCode?: string },
): Promise<void> {
  await api.post(`/orders/${encodeURIComponent(String(ref))}/cancel`, reason);
}

export type OrderAgainResponse = {
  added: boolean;
  merged: boolean;
  itemId: number;
  productId: number;
  mode: "BUY" | "RENT";
};

/**
 * Repeat an order line ("Buy again" / "Rent again"). The server validates the
 * product is still listed, purchasable and available before touching the cart —
 * an unavailable product is a 409 with a readable code, never a silently added
 * line that checkout would later have to reject.
 */
export async function orderAgain(
  ref: string | number,
  orderItemId?: number,
): Promise<OrderAgainResponse> {
  return (
    await api.post<OrderAgainResponse>(`/orders/${encodeURIComponent(String(ref))}/again`, {
      ...(orderItemId !== undefined ? { orderItemId } : {}),
    })
  ).data;
}
