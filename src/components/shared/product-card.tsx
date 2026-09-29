import { MapPin, Star } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { formatInr } from "../../lib/pricing";
import {
  CONDITION_LABELS,
  LISTING_MODE_LABELS,
  type ListingMode,
  type ProductCardData,
} from "../../lib/types";
import { FavoriteButton } from "../../features/favorites/components/FavoriteButton";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";

function ModeBadge({ listingType }: { listingType: string }) {
  return (
    <Badge className="absolute left-3 top-3 bg-background/90 text-foreground shadow-sm">
      {LISTING_MODE_LABELS[listingType] ?? listingType}
    </Badge>
  );
}

/**
 * The one product card in the app (Home + Browse + every grid).
 *
 * `mode` decides what the card leads with when a visitor is browsing in a
 * specific listing mode: rent → daily rate, buy → sale price, otherwise both.
 * `onPrefetch` fires once when the card is hovered or focused so the detail page
 * is already warm — it is never called for the whole grid.
 *
 * The heart is the shared `FavoriteButton`: this card holds no favourite state
 * and no favourite logic of its own.
 */
export function ProductCard({
  product,
  mode,
  onPrefetch,
}: {
  product: ProductCardData;
  mode?: ListingMode;
  onPrefetch?: () => void;
}) {
  const navigate = useNavigate();

  const rentable = product.rentalPricePerDay !== null && product.rentalPricePerDay > 0;
  const buyable = product.purchasePrice !== null && product.purchasePrice > 0;

  // Lead with the price that matches the browsing mode, falling back to whatever
  // the item actually offers so a card never shows a price it doesn't have.
  const leadWithRental = mode === "buy" ? !buyable && rentable : rentable;
  const showAlternatePurchase = !mode || mode === "rent-and-buy";
  const ctaLabel = mode === "buy" && buyable ? "Buy" : rentable ? "Rent" : "Buy";

  return (
    <Card
      onMouseEnter={onPrefetch}
      onFocus={onPrefetch}
      className="group overflow-hidden p-3.5 transition-transform duration-300 hover:-translate-y-1 hover:shadow-[10px_14px_30px_var(--shadow-color-dark),-8px_-8px_22px_var(--shadow-color-light)]"
    >
      <div className="inset-surface rounded-[20px] p-2.5">
        <div className="relative overflow-hidden rounded-2xl">
          <Link to="/product/$slug" params={{ slug: product.slug }}>
            <img
              src={product.primaryImage ?? ""}
              alt={product.title}
              loading="lazy"
              className="aspect-[4/3] w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            />
          </Link>
          <ModeBadge listingType={product.listingType} />
          <FavoriteButton
            productId={product.id}
            title={product.title}
            slug={product.slug}
            hint={product.isFavorited}
            className="absolute right-3 top-3"
          />
        </div>
      </div>
      <div className="px-1 pb-1 pt-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-semibold text-muted-foreground">
              {product.categoryName}
              {product.condition !== "NEW"
                ? ` · ${CONDITION_LABELS[product.condition as keyof typeof CONDITION_LABELS] ?? product.condition}`
                : ""}
            </p>
            <h3 className="truncate font-heading text-[15px] font-extrabold">
              <Link
                to="/product/$slug"
                params={{ slug: product.slug }}
                className="hover:text-primary"
              >
                {product.title}
              </Link>
            </h3>
          </div>
          {product.ratingCount > 0 && (
            <span className="flex shrink-0 items-center gap-1 text-xs font-bold">
              <Star size={13} className="fill-primary text-primary" />
              {product.ratingAverage.toFixed(1)}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin size={13} />
          <span className="truncate">{product.location}</span>
        </div>
        <div className="neumo-divider my-3" />
        <div className="flex items-end justify-between gap-2">
          <div>
            {leadWithRental && rentable ? (
              <p className="font-heading text-lg font-extrabold">
                {formatInr(product.rentalPricePerDay!)}
                <span className="ml-1 text-xs font-semibold text-muted-foreground">/ day</span>
              </p>
            ) : product.purchasePrice !== null ? (
              <p className="font-heading text-lg font-extrabold">
                {formatInr(product.purchasePrice)}
              </p>
            ) : (
              <p className="font-heading text-lg font-extrabold text-muted-foreground">—</p>
            )}
            {showAlternatePurchase && rentable && buyable && (
              <p className="text-[11px] font-medium text-muted-foreground">
                or buy for {formatInr(product.purchasePrice!)}
              </p>
            )}
          </div>
          <Button
            size="sm"
            asChild={false}
            onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
              event.preventDefault();
              void navigate({ to: "/product/$slug", params: { slug: product.slug } });
            }}
          >
            {ctaLabel}
          </Button>
        </div>
      </div>
    </Card>
  );
}
