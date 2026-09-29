import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";

export type MyProduct = {
  id: number;
  title: string;
  slug: string;
  status: string;
  listingType: string;
  purchasePrice: number | null;
  rentalPricePerDay: number | null;
  viewCount: number;
  favoriteCount: number;
  createdAt: string;
  primaryImage: string | null;
};

export function useMyProducts() {
  return useQuery({
    queryKey: queryKeys.myProducts,
    queryFn: async () => (await api.get<MyProduct[]>("/seller/products")).data,
  });
}

export function useProductStatusActions() {
  const queryClient = useQueryClient();
  return {
    async setStatus(id: number, status: string) {
      await api.patch(`/seller/products/${id}/status`, { status });
      void queryClient.invalidateQueries({ queryKey: queryKeys.myProducts });
      toast(
        `Listing ${status === "PUBLISHED" ? "published" : status === "PAUSED" ? "paused" : "archived"}.`,
      );
    },
    async deleteProduct(id: number) {
      await api.delete(`/seller/products/${id}`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.myProducts });
      toast("Product deleted.");
    },
  };
}
