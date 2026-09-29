import { useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Star } from "lucide-react";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import type { ProductCardData } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ProductGrid } from "@/components/shared/product-grid";

type SellerProfile = {
  id: number;
  name: string;
  avatarUrl: string | null;
  verified: boolean;
  bio: string | null;
  listingCount: number;
  ratingAverage: number;
  ratingCount: number;
};

export function SellerPage() {
  const { id } = useParams({ from: "/seller/$id" });

  const { data: seller } = useQuery({
    queryKey: queryKeys.seller(id),
    queryFn: async () => (await api.get<SellerProfile>(`/seller/profile/${id}`)).data,
  });

  const { data: products, isLoading } = useQuery({
    queryKey: queryKeys.products({ seller: id }),
    queryFn: async () => {
      const { data } = await api.get<ProductCardData[]>(`/products?seller=${id}&pageSize=12`);
      return data;
    },
  });

  return (
    <div className="page-wrap space-y-7 pb-10 pt-8">
      <Card className="flex flex-wrap items-center gap-5 p-6">
        <span className="inset-surface flex size-20 items-center justify-center rounded-full font-heading text-2xl font-black text-primary">
          {seller?.name.charAt(0) ?? "?"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="section-title text-2xl sm:text-3xl">{seller?.name ?? "Seller"}</h1>
            {seller?.verified && <BadgeCheck size={20} className="text-accent" />}
          </div>
          {seller?.bio && (
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">{seller.bio}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted-foreground">
            {seller && seller.ratingCount > 0 && (
              <span className="flex items-center gap-1 font-bold text-foreground">
                <Star size={14} className="fill-primary text-primary" />
                {seller.ratingAverage.toFixed(1)} ({seller.ratingCount})
              </span>
            )}
            <span>{seller?.listingCount ?? 0} active listings</span>
          </div>
        </div>
        <Badge className="bg-accent/10 text-accent">Neighbour seller</Badge>
      </Card>

      <section className="space-y-4">
        <h2 className="section-title text-xl">Listings</h2>
        <ProductGrid
          products={products ?? []}
          isLoading={isLoading}
          emptyMessage="No active listings right now."
        />
      </section>
    </div>
  );
}
