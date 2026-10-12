import { useQuery } from "@tanstack/react-query";
import { useCategoryDirectory } from "@/lib/categories";
import { queryKeys } from "@/lib/query/keys";
import {
  getFeaturedProducts,
  getPreLovedProducts,
  getPublicBanners,
  getPublicBlocks,
  getRentalProducts,
  getStats,
} from "./api";

/** Stable home-scoped query keys (public data — long cache, survives navigation). */
export const homeKeys = {
  all: ["home"] as const,
  stats: () => [...homeKeys.all, "stats"] as const,
  categories: () => [...homeKeys.all, "categories"] as const,
  featuredProducts: () => [...homeKeys.all, "featured"] as const,
  rentalProducts: () => [...homeKeys.all, "rentals"] as const,
  preLovedProducts: () => [...homeKeys.all, "pre-loved"] as const,
};

/** Public marketplace data is safe to cache aggressively. */
const PUBLIC_STALE_TIME = 5 * 60_000;

export function useMarketplaceStats() {
  return useQuery({ queryKey: homeKeys.stats(), queryFn: getStats, staleTime: PUBLIC_STALE_TIME });
}

/** Delegates to the shared category directory; see `src/lib/categories.ts`. */
export const useHomeCategories = useCategoryDirectory;

export function useFeaturedProducts() {
  return useQuery({
    queryKey: homeKeys.featuredProducts(),
    queryFn: getFeaturedProducts,
    staleTime: PUBLIC_STALE_TIME,
  });
}

export function useRentalProducts() {
  return useQuery({
    queryKey: homeKeys.rentalProducts(),
    queryFn: getRentalProducts,
    staleTime: PUBLIC_STALE_TIME,
  });
}

export function usePreLovedProducts() {
  return useQuery({
    queryKey: homeKeys.preLovedProducts(),
    queryFn: getPreLovedProducts,
    staleTime: PUBLIC_STALE_TIME,
  });
}

/* ---------------------------- public CMS content ---------------------------- */

/**
 * The live HERO banners.
 *
 * Keyed under the shared `["cms", …]` prefix rather than `homeKeys` on purpose: an
 * admin write invalidates `["cms"]`, so a saved banner reaches this query and the
 * storefront reflects it on the next read. A home-scoped key would not be touched by
 * that invalidation and would serve the old banner until its own cache expired.
 *
 * With nothing live, the query returns an empty list and the hero keeps its built-in
 * slides — an unconfigured deployment must still look finished.
 */
export function useHeroBanners() {
  return useQuery({
    queryKey: queryKeys.cmsBanners("HERO"),
    queryFn: () => getPublicBanners("HERO"),
    staleTime: PUBLIC_STALE_TIME,
  });
}

/** Every published homepage block, keyed — one request for the whole page. */
export function useHomeBlocks() {
  return useQuery({
    queryKey: queryKeys.cmsBlocks,
    queryFn: getPublicBlocks,
    staleTime: PUBLIC_STALE_TIME,
  });
}
