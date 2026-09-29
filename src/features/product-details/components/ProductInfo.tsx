import { Link } from "@tanstack/react-router";
import { Eye, MapPin } from "lucide-react";
import { FavoriteControl, type FavoriteController } from "@/features/favorites/components/FavoriteButton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import { AvailabilityStatus } from "./AvailabilityStatus";
import { ProductCondition } from "./ProductCondition";
import { RatingStars } from "./RatingStars";
import { listingTypeLabel } from "./schema";
import type { ProductDetails, StockState } from "../types";

/**
 * Title block: what the item is, how it is rated, what condition it is in and
 * whether it is available — the facts a buyer needs before anything else.
 * The favourite control lives here so there is exactly one on the page.
 */
export function ProductInfo({
  product,
  stock,
  stockDetail,
  favorite,
}: {
  product: ProductDetails;
  stock: StockState;
  stockDetail?: string;
  /** The page's one favourite controller, shared with the mobile action bar. */
  favorite: FavoriteController;
}) {
  const hasRating = product.ratingCount > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            to="/browse"
            search={{ category: product.categorySlug }}
            className="eyebrow inline-block hover:text-primary"
          >
            {product.categoryName}
          </Link>
          <h1 className="section-title mt-1.5 text-2xl leading-tight sm:text-3xl lg:text-[34px]">
            {product.title}
          </h1>
        </div>
        <FavoriteControl
          title={product.title}
          isFavorited={favorite.isFavorited}
          isPending={favorite.isPending}
          isDisabled={favorite.isDisabled}
          onClick={favorite.toggle}
          className="size-11 shrink-0"
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        {hasRating ? (
          <>
            <a
              href="#reviews"
              className={cn(
                "flex items-center gap-1.5 rounded-full font-bold text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
              )}
            >
              <RatingStars value={product.ratingAverage} />
              {product.ratingAverage.toFixed(1)}
            </a>
            <span>
              {product.ratingCount} {product.ratingCount === 1 ? "review" : "reviews"}
            </span>
          </>
        ) : (
          <span>No reviews yet</span>
        )}
        <span className="flex items-center gap-1.5">
          <MapPin size={14} aria-hidden />
          {product.location}
        </span>
        {product.viewCount > 0 && (
          <span className="flex items-center gap-1.5">
            <Eye size={14} aria-hidden />
            {product.viewCount} views
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ProductCondition condition={product.condition} showIcon />
        <Badge className="bg-background text-foreground" title="Listing capability">
          {listingTypeLabel(product.listingType)}
        </Badge>
        <AvailabilityStatus state={stock} detail={stockDetail} className="py-1.5" />
      </div>
    </div>
  );
}
