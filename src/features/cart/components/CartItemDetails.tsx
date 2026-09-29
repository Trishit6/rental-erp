import { Link } from "@tanstack/react-router";
import { BadgeCheck, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { conditionLabel, modeLabel } from "./schema";
import type { CartItem } from "../types";

/**
 * The facts about a line: what it is, what condition, who sells it, and which way
 * it is being taken. Compact typography — a cart line is denser than a browse
 * card, and the price lives in its own column so the eye can scan down it.
 */
export function CartItemDetails({ item }: { item: CartItem }) {
  const product = item.product;
  const title = product?.title ?? "This product is no longer available";
  const isRental = item.mode === "RENT";

  return (
    <div className="min-w-0 flex-1">
      <h3 className="font-heading text-sm font-extrabold leading-snug">
        {product ? (
          <Link
            to="/product/$slug"
            params={{ slug: product.slug }}
            className="line-clamp-2 transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            {title}
          </Link>
        ) : (
          <span className="text-muted-foreground">{title}</span>
        )}
      </h3>

      {product && (
        <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">
          {conditionLabel(product.condition)}
        </p>
      )}

      {product && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin size={12} aria-hidden className="shrink-0" />
          <span className="truncate">{product.location}</span>
        </p>
      )}

      {/* The seller, so a cart of several neighbours' items stays attributable. */}
      {product && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">Sold by {product.sellerName}</span>
          {product.sellerVerified && (
            <BadgeCheck size={13} aria-label="Verified seller" className="text-accent" />
          )}
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Badge className="bg-background text-foreground">{modeLabel(item.mode)}</Badge>
        {isRental && item.rentalDuration > 0 && (
          <Badge className="bg-background text-foreground">
            {item.rentalDuration} {item.rentalDuration === 1 ? "day" : "days"}
          </Badge>
        )}
      </div>
    </div>
  );
}
