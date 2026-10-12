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

/* ---------------------------- public CMS content ---------------------------- */

/** A live banner as `GET /api/cms/banners` returns it. */
export type PublicBanner = {
  id: number;
  placement: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  linkUrl: string | null;
  sortOrder: number;
};

/**
 * Live banners for a placement.
 *
 * "Live" is decided by the server, not here: it filters out drafts, paused banners and
 * anything outside its `startsAt`/`endsAt` window before responding. The client never
 * sees a banner it is trusted to hide, which is why a scheduled banner simply appears
 * when its window opens and disappears when it closes — no client clock involved.
 */
export async function getPublicBanners(placement: string): Promise<PublicBanner[]> {
  return (await api.get<PublicBanner[]>(`/cms/banners?placement=${placement}`)).data;
}

/**
 * Every published block, keyed.
 *
 * One request rather than one per block, because the home page reads several and each
 * would otherwise be its own round trip.
 */
export async function getPublicBlocks(): Promise<Record<string, Record<string, unknown>>> {
  return (await api.get<Record<string, Record<string, unknown>>>("/cms/blocks")).data;
}
