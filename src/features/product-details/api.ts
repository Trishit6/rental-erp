import { api } from "@/lib/api/client";
import type { ProductAvailability, ProductDetails, RelatedProduct } from "./types";

/**
 * Every network call this feature makes. `productId` accepts either the numeric
 * id or the slug — the backend resolves both, so deep links keep working.
 */

function ref(productId: string): string {
  return encodeURIComponent(productId);
}

export async function getProductById(productId: string): Promise<ProductDetails> {
  return (await api.get<ProductDetails>(`/products/${ref(productId)}`)).data;
}

export async function getRelatedProducts(productId: string, limit = 8): Promise<RelatedProduct[]> {
  const query = new URLSearchParams({ limit: String(limit) });
  return (await api.get<RelatedProduct[]>(`/products/${ref(productId)}/related?${query}`)).data;
}

export async function checkProductAvailability(
  productId: string,
  range?: { startDate: string; endDate: string },
): Promise<ProductAvailability> {
  const query = new URLSearchParams();
  if (range) {
    query.set("startDate", range.startDate);
    query.set("endDate", range.endDate);
  }
  const suffix = query.size > 0 ? `?${query}` : "";
  return (await api.get<ProductAvailability>(`/products/${ref(productId)}/availability${suffix}`))
    .data;
}

/** The cart mutation is the shared one — there is exactly one cart system. */
export { useAddToCart } from "@/lib/query/cart";

/*
 * There is deliberately no `contactProductSeller` here any more.
 *
 * It used to `POST /conversations` with a caller-supplied `sellerId`, and nothing called
 * it. `POST /api/conversations` now takes a `productId` and resolves the counterparty
 * from `products.sellerId` server-side — that resolution *is* the authorization, and a
 * client that can name the other party can message whoever it likes. A function taking
 * a `sellerId` cannot be made safe, only unused, so it was removed rather than left
 * behind as a trap. `features/messages/api.ts#startConversation` owns the call.
 */
