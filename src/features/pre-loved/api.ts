import { api } from "@/lib/api/client";
import type { ProductCardData } from "@/lib/types";

export async function fetchPreLovedProducts(q?: string): Promise<ProductCardData[]> {
  const params = new URLSearchParams({ type: "SALE", sort: "newest", pageSize: "12" });
  if (q) params.set("q", q);
  return (await api.get<ProductCardData[]>(`/products?${params.toString()}`)).data;
}
