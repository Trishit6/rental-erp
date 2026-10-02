import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Clock3, MapPin, PackageX, ShoppingBag } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useState } from "react";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/auth-context";
import { useAddToCart } from "@/lib/query/cart";
import { formatInr } from "@/lib/pricing";
import { CONDITION_LABELS, LISTING_MODE_LABELS, type ProductCondition } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProductImage } from "@/components/shared/product-image";
import { FavoriteButton, type FavoriteController } from "./FavoriteButton";
import {
  favoriteAvailabilityLabel,
  favoriteAvailabilityState,
  type FavoriteAvailability,
} from "./schema";
import type { FavoriteProduct } from "../types";

const AVAILABILITY_TONE: Record<FavoriteAvailability, { icon: typeof CheckCircle2; className: string }> = {
  AVAILABLE: { icon: CheckCircle2, className: "text-accent" },
  LIMITED: { icon: Clock3, className: "text-primary" },
  OUT_OF_STOCK: { icon: PackageX, className: "text-muted-foreground" },
  UNAVAILABLE: { icon: AlertTriangle, className: "text-muted-foreground" },
};

/**
 * A saved product on the wishlist.
 *
 * It reuses the shared card's surfaces and price formatting, and adds the three
 * things a saved list needs that a browse card does not: the real availability
 * (an unavailable item stays saved, it is only *shown* as unavailable), the
 * "when did I save this" line, and an undoable removal.
 *
 * The heart is the shared {@link FavoriteButton} — this component owns no
 * favourite logic of its own.
 */
export function FavoriteProductCard({
  product,
  controller,
  onRemoved,
  onPrefetch,
}: {
  product: FavoriteProduct;
  /** Shared with the grid so one removal animates and one query is refetched. */
  controller?: FavoriteController;
  onRemoved?: (info: { productId: number; slug?: string; title: string }) => void;
  onPrefetch?: (slug: string) => void;
}) {
  const reduceMotion = useReducedMotion();
  const navigate = useNavigate();
  const { user } = useAuth();
  const cart = useAddToCart();
  const [adding, setAdding] = useState(false);

  const availability = favoriteAvailabilityState(product);
  const { icon: AvailabilityIcon, className: tone } = AVAILABILITY_TONE[availability];
  const isAvailable = availability === "AVAILABLE" || availability === "LIMITED";

  const rentable = !!product.rentalPricePerDay && product.rentalPricePerDay > 0;
  const buyable = !!product.purchasePrice && product.purchasePrice > 0;
  const conditionLabel = CONDITION_LABELS[product.condition as ProductCondition] ?? product.condition;

  /** Buy-only: renting needs a date window, which the product page collects. */
  function addToCart() {
    if (!user) {
      toast("Sign in to continue", {
        description: "You need an account to add items to your cart.",
        action: {
          label: "Sign in",
          onClick: () => void navigate({ to: "/login", search: { redirect: `/product/${product.slug}` } }),
        },
      });
      return;
    }
    if (adding) return;
    setAdding(true);
    cart.mutate(
      { productId: product.id, mode: "BUY", quantity: 1 },
      {
        onSuccess: () => toast("Added to cart"),
        onError: (error) =>
          toast(error instanceof ApiError ? error.message : "Couldn't update your cart. Try again."),
        onSettled: () => setAdding(false),
      },
    );
  }

  return (
    <motion.article
      layout
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
      transition={{ duration: 0.24, ease: "easeOut" }}
      onMouseEnter={() => onPrefetch?.(product.slug)}
      onFocus={() => onPrefetch?.(product.slug)}
      className="group h-full"
    >
      <Card className="card-surface-hover flex h-full flex-col overflow-hidden p-3.5 transition-transform duration-300 hover:-translate-y-1">
        <div className="inset-surface relative rounded-[20px] p-2.5">
          <Link
            to="/product/$slug"
            params={{ slug: product.slug }}
            className="block aspect-[4/3] w-full overflow-hidden rounded-2xl"
          >
            <ProductImage
              src={product.primaryImage}
              alt={product.title}
              /* An unavailable item stays saved, so it is dimmed rather than hidden. */
              className={`size-full transition-transform duration-500 group-hover:scale-[1.03] ${
                isAvailable ? "" : "opacity-60 saturate-[0.7]"
              }`}
            />
          </Link>

          <Badge className="absolute left-3 top-3 bg-background/90 text-foreground shadow-sm">
            {LISTING_MODE_LABELS[product.listingType] ?? product.listingType}
          </Badge>

          <FavoriteButton
            controller={controller}
            productId={product.id}
            title={product.title}
            slug={product.slug}
            hint
            onRemoved={onRemoved}
            className="absolute right-3 top-3"
          />
        </div>

        <div className="flex flex-1 flex-col px-1 pb-1 pt-3">
          <p className="mb-1 truncate text-xs font-semibold text-muted-foreground">
            {product.categoryName} · {conditionLabel}
          </p>
          <h3 className="font-heading text-[15px] font-extrabold leading-snug">
            <Link
              to="/product/$slug"
              params={{ slug: product.slug }}
              className="line-clamp-2 transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              {product.title}
            </Link>
          </h3>

          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin size={13} aria-hidden className="shrink-0" />
            <span className="truncate">{product.location}</span>
          </div>

          {/* Availability is a fact about the listing, stated in words as well as
              colour so it reads correctly without colour. */}
          <p
            className={`mt-2.5 flex items-center gap-1.5 text-xs font-bold ${tone}`}
            data-testid={`availability-${product.id}`}
          >
            <AvailabilityIcon size={13} aria-hidden />
            {favoriteAvailabilityLabel(availability)}
          </p>

          <div className="mt-auto pt-3">
            <div className="neumo-divider mb-3" />
            <div className="flex items-end justify-between gap-2">
              <div className="min-w-0">
                {rentable && (
                  <p className="font-heading text-lg font-extrabold">
                    {formatInr(product.rentalPricePerDay!)}
                    <span className="ml-1 text-xs font-semibold text-muted-foreground">/ day</span>
                  </p>
                )}
                {buyable && (
                  <p
                    className={
                      rentable
                        ? "text-[11px] font-semibold text-muted-foreground"
                        : "font-heading text-lg font-extrabold"
                    }
                  >
                    {buyable && rentable ? "Buy " : ""}
                    {formatInr(product.purchasePrice!)}
                  </p>
                )}
                {!rentable && !buyable && (
                  <p className="font-heading text-lg font-extrabold text-muted-foreground">—</p>
                )}
              </div>

              <Button
                size="sm"
                onClick={() => void navigate({ to: "/product/$slug", params: { slug: product.slug } })}
              >
                View
              </Button>
            </div>

            {/* Buy-only, and only when it can actually be added from here —
                renting needs a date window, which the product page collects. */}
            {buyable && isAvailable && (
              <Button
                variant="secondary"
                size="sm"
                className="mt-2.5 w-full"
                onClick={addToCart}
                disabled={adding}
                aria-busy={adding}
              >
                <ShoppingBag size={14} aria-hidden />
                {adding ? "Adding…" : "Add to cart"}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </motion.article>
  );
}
