import { Link } from "@tanstack/react-router";
import { MapPin, Star } from "lucide-react";
import { ProductImage } from "@/components/shared/product-image";
import { formatInr } from "@/lib/pricing";
import type { ChatProduct } from "../types";

const modeLabels: Record<string, string> = {
  SALE: "For sale",
  RENT: "For rent",
  BOTH: "Rent + buy",
};

/** Compact listing row shown under an assistant message. */
export function ChatProductCard({
  product,
  onNavigate,
}: {
  product: ChatProduct;
  onNavigate: () => void;
}) {
  const rentable = product.rentalPricePerDay !== null && product.rentalPricePerDay > 0;

  return (
    <Link
      to="/product/$slug"
      params={{ slug: product.slug }}
      onClick={onNavigate}
      className="inset-surface group flex items-center gap-3 rounded-2xl p-2 transition hover:border-primary/40"
    >
      <ProductImage
        src={product.primaryImage}
        alt={product.title}
        className="size-14 shrink-0 rounded-xl"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-extrabold leading-tight group-hover:text-primary">
          {product.title}
        </p>
        <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
          <MapPin size={11} /> {product.location}
          <span className="text-muted-foreground/60">·</span>
          {modeLabels[product.listingType] ?? product.listingType}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-[13px] font-extrabold text-primary">
            {rentable
              ? `${formatInr(product.rentalPricePerDay!)}/day`
              : product.purchasePrice !== null
                ? formatInr(product.purchasePrice)
                : "—"}
          </span>
          {product.ratingCount > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] font-bold text-muted-foreground">
              <Star size={11} className="fill-primary text-primary" />
              {product.ratingAverage.toFixed(1)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
