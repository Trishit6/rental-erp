import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import { fetchPreLovedProducts } from "./api";

export function usePreLovedProducts(q?: string) {
  return useQuery({
    queryKey: queryKeys.products({ preloved: true, q }),
    queryFn: () => fetchPreLovedProducts(q),
    placeholderData: (previous) => previous,
  });
}
