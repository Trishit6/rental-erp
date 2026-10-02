import { api } from "@/lib/api/client";
import type { MarketplaceStats, ProductCardData } from "@/lib/types";

export async function getStats(): Promise<MarketplaceStats> {
  return (await api.get<MarketplaceStats>("/stats")).data;
}

/** The category directory lives in `src/lib/categories.ts` — see the note there. */

export async function getFeaturedProducts(): Promise<ProductCardData[]> {
  return (await api.get<ProductCardData[]>("/products?sort=recommended&pageSize=8")).data;
}

export async function getRentalProducts(): Promise<ProductCardData[]> {
  return (await api.get<ProductCardData[]>("/products?type=RENT&sort=most_viewed&pageSize=4")).data;
}

export async function getPreLovedProducts(): Promise<ProductCardData[]> {
  return (await api.get<ProductCardData[]>("/products?type=SALE&sort=newest&pageSize=4")).data;
}
