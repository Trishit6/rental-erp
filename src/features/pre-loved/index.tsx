import { Link, useSearch } from "@tanstack/react-router";
import { ArrowLeft, Leaf } from "lucide-react";
import { ProductGrid } from "@/components/shared/product-grid";
import { Badge } from "@/components/ui/badge";
import { usePreLovedProducts } from "./query";

export function PreLovedPage() {
  const search = useSearch({ from: "/pre-loved" });
  const { data: items, isLoading } = usePreLovedProducts(search.q);

  return (
    <div className="page-wrap space-y-7 pb-6 pt-8">
      <div>
        <Link to="/" className="nav-link inline-flex items-center gap-1 text-sm font-semibold">
          <ArrowLeft size={15} />
          Back home
        </Link>
        <p className="eyebrow mt-5 flex items-center gap-1.5">
          <Leaf size={13} /> Second life, first choice
        </p>
        <h1 className="section-title mt-1 text-3xl sm:text-4xl">Pre-loved finds</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Give a neighbour's pre-loved things a new home — condition clearly marked on every card.
        </p>
      </div>
      <Badge className="bg-accent/10 text-accent">
        Every purchase keeps good things in circulation
      </Badge>
      <ProductGrid
        products={items ?? []}
        isLoading={isLoading}
        emptyMessage="No pre-loved finds right now."
      />
    </div>
  );
}
