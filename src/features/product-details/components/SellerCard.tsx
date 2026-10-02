import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { BadgeCheck, Package, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/shared/avatar";
import { cn } from "@/lib/utils/cn";
import type { ProductSeller } from "../types";

/**
 * Seller trust block. Every figure comes from the backend (listings, rating,
 * joined date) — nothing is inferred or invented, and fields the API omits are
 * simply not rendered.
 */
export function SellerCard({ seller, className }: { seller: ProductSeller; className?: string }) {
  const hasRating = seller.ratingCount > 0;

  return (
    <section aria-label="Seller" className={cn("raised-surface rounded-3xl p-4", className)}>
      <div className="flex items-center gap-3">
        <Avatar name={seller.name} url={seller.avatarUrl} className="size-12 text-base" />

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-extrabold">
            <span className="truncate">{seller.name}</span>
            {seller.verified && (
              <span title="Verified seller" className="text-accent">
                <BadgeCheck size={15} aria-hidden />
                <span className="sr-only">Verified seller</span>
              </span>
            )}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {hasRating && (
              <span className="flex items-center gap-1 font-semibold text-foreground">
                <Star size={11} className="fill-primary text-primary" aria-hidden />
                {seller.ratingAverage.toFixed(1)} ({seller.ratingCount})
              </span>
            )}
            <span className="flex items-center gap-1">
              <Package size={11} aria-hidden />
              {seller.listingsCount} {seller.listingsCount === 1 ? "listing" : "listings"}
            </span>
            <span>Joined {format(new Date(seller.joinedAt), "MMM yyyy")}</span>
          </p>
        </div>

        <Button asChild variant="secondary" size="sm">
          <Link to="/seller/$id" params={{ id: String(seller.id) }}>
            View seller
          </Link>
        </Button>
      </div>

      {seller.bio && (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{seller.bio}</p>
      )}
    </section>
  );
}
