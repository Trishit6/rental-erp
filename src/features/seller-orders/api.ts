import { api, type Pagination } from "@/lib/api/client";
import type {
  BulkFulfillmentPayload,
  SellerOrderDetail,
  SellerOrderSummary,
  SellerOrdersFilters,
} from "./types";

/**
 * Every network call the seller order desk makes. Components use `./query`, so
 * caching and invalidation stay in one place.
 *
 * ## What the client is never allowed to send
 *
 * There is no `sellerId` or `userId` below, and no way to name another seller's
 * order except by its own public reference — which the server looks up *through*
 * the caller's lines. A request for someone else's order is a 404, indistinguish-
 * able from an order that does not exist.
 */

/** Blank values are omitted, so a cleared filter is absent rather than `status=`. */
function toQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

function fallbackPagination(filters: SellerOrdersFilters, rowCount: number): Pagination {
  return { page: filters.page, pageSize: filters.pageSize, total: rowCount, totalPages: 1 };
}

/* ---------------------------------- list ----------------------------------- */

export async function fetchSellerOrders(
  filters: SellerOrdersFilters,
): Promise<{ items: SellerOrderSummary[]; pagination: Pagination }> {
  const result = await api.get<SellerOrderSummary[]>(
    `/seller/orders${toQueryString({
      page: filters.page,
      pageSize: filters.pageSize,
      search: filters.search.trim() || undefined,
      // `ALL` is the page's own tab, not a server filter — sending it would ask
      // the server to filter on a status that does not exist.
      status: filters.status === "ALL" ? undefined : filters.status,
      sort: filters.sort,
    })}`,
  );
  return {
    items: result.data,
    pagination: result.pagination ?? fallbackPagination(filters, result.data.length),
  };
}

/* --------------------------------- detail ---------------------------------- */

export async function fetchSellerOrder(reference: string | number): Promise<SellerOrderDetail> {
  return (await api.get<SellerOrderDetail>(`/seller/orders/${encodeURIComponent(reference)}`)).data;
}

/* ------------------------------- single write ------------------------------ */

export async function setSellerFulfillment(
  reference: string | number,
  status: string,
): Promise<SellerOrderDetail> {
  return (
    await api.patch<SellerOrderDetail>(
      `/seller/orders/${encodeURIComponent(reference)}/fulfillment`,
      {
        status,
      },
    )
  ).data;
}

export async function cancelSellerOrder(
  reference: string | number,
  reason: string,
): Promise<SellerOrderDetail> {
  return (
    await api.post<SellerOrderDetail>(`/seller/orders/${encodeURIComponent(reference)}/cancel`, {
      reason,
    })
  ).data;
}

/* -------------------------------- bulk write ------------------------------- */

export async function bulkFulfill(
  payload: BulkFulfillmentPayload,
): Promise<{ updated: number; references: string[] }> {
  return (
    await api.patch<{ updated: number; references: string[] }>(
      "/seller/orders/bulk-fulfillment",
      payload,
    )
  ).data;
}
