import { api, type Pagination } from "@/lib/api/client";
import type {
  ProductPayload,
  SellerProductDetail,
  SellerProductFilters,
  SellerProductRow,
  SettableStatus,
} from "./types";

/**
 * Every network call the seller-listings feature makes. Components never import
 * this file — they use the hooks in `./query`, so invalidation and caching stay
 * in one place.
 *
 * ## What the client is never allowed to send
 *
 * There is deliberately **no `sellerId`, `userId` or `ownerId`** in any body or
 * query string below. The server takes the seller from the session cookie and
 * compares it inside every `WHERE` clause, so a body that carried one would be
 * ignored rather than obeyed — but ignoring it silently is how the next
 * maintainer wires one up expecting it to do something. The only identifier a
 * body carries is the product it is *about*, which the server re-checks against
 * the session's seller id.
 */

/** Filters → query string. Blank values are omitted, not sent as `""`. */
function toQueryString(filters: Partial<SellerProductFilters>): string {
  const params = new URLSearchParams();
  if (filters.page) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.listingType) params.set("listingType", filters.listingType);
  if (filters.stock) params.set("stock", filters.stock);
  if (filters.sort) params.set("sort", filters.sort);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function fetchSellerProducts(
  filters: SellerProductFilters,
): Promise<{ rows: SellerProductRow[]; pagination: Pagination }> {
  const { data, pagination } = await api.get<SellerProductRow[]>(
    `/seller/products${toQueryString(filters)}`,
  );
  return { rows: data, pagination: pagination! };
}

export async function fetchSellerProduct(id: number): Promise<SellerProductDetail> {
  return (await api.get<SellerProductDetail>(`/seller/products/${id}`)).data;
}

export async function createSellerProduct(payload: ProductPayload) {
  return (await api.post<{ id: number; slug: string }>("/seller/products", payload)).data;
}

export async function updateSellerProduct(id: number, payload: Partial<ProductPayload>) {
  return (await api.patch<{ id: number; updated: true }>(`/seller/products/${id}`, payload)).data;
}

export async function setSellerProductStatus(id: number, status: SettableStatus) {
  return (
    await api.patch<{ id: number; status: string }>(`/seller/products/${id}/status`, {
      status,
    })
  ).data;
}

export type InventoryResponse = {
  id: number;
  quantity: number;
  availableQuantity: number;
  reservedQuantity: number;
  status: string;
};

export async function setSellerProductInventory(
  id: number,
  edit: { quantity?: number; availableQuantity?: number },
): Promise<InventoryResponse> {
  return (await api.patch<InventoryResponse>(`/seller/products/${id}/inventory`, edit)).data;
}

export async function duplicateSellerProduct(id: number) {
  return (
    await api.post<{ id: number; slug: string; status: "DRAFT" }>(
      `/seller/products/${id}/duplicate`,
    )
  ).data;
}

/**
 * Withdraw a listing while keeping every order line, review and favourite that
 * points at it. This is the action the UI offers for anything that has sold.
 */
export async function archiveSellerProduct(id: number) {
  return (await api.post<{ id: number; status: "ARCHIVED" }>(`/seller/products/${id}/archive`))
    .data;
}

/**
 * Remove a listing that has never sold.
 *
 * The server answers `409 PRODUCT_HAS_HISTORY` when the product appears in any
 * order, rental or review, because those FKs are `onDelete: "restrict"`. The
 * previous handler let the database raise that as an opaque error, so the delete
 * dialog promised a removal and returned a 500 instead.
 */
export async function deleteSellerProduct(id: number): Promise<void> {
  await api.delete(`/seller/products/${id}`);
}
