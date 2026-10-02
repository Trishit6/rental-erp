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

export async function contactProductSeller(payload: {
  sellerId: number;
  productId: number;
  body: string;
}): Promise<void> {
  await api.post("/conversations", payload);
}
