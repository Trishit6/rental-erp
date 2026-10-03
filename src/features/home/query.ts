import { useQuery } from "@tanstack/react-query";
import { useCategoryDirectory } from "@/lib/categories";
import { getFeaturedProducts, getPreLovedProducts, getRentalProducts, getStats } from "./api";

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
