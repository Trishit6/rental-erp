import { Link } from "@tanstack/react-router";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { Rental } from "../types";

/**
 * The product a rental is for.
 *
 * Prefers the order-item snapshot (what the customer actually booked) and falls
 * back to the live listing title when there is none, so a renamed listing does
 * not quietly rewrite the rental record. The link is omitted when the product no
 * longer exists — a dead link is worse than plain text.
 */
export function RentalProductPreview({
  rental,
  className,
  size = "default",
}: {
  rental: Rental;
  className?: string;
  size?: "default" | "lg";
}) {
  const title = rental.orderItemTitle ?? rental.title;
  const image = rental.orderItemImage ?? rental.primaryImage;
  const hasLink = Boolean(rental.productSlug);

  const imageBox = (
    <span
      className={cn(
        "raised-surface flex shrink-0 items-center justify-center overflow-hidden",
        size === "lg" ? "size-24 rounded-3xl" : "size-16 rounded-2xl",
      )}
    >
      {image ? (
        <img src={image} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <Package
          size={size === "lg" ? 28 : 20}
          className="text-muted-foreground"
          aria-hidden="true"
        />
      )}
    </span>
  );

  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      {hasLink ? (
        <Link
          to="/product/$slug"
          params={{ slug: rental.productSlug }}
          className="shrink-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          {imageBox}
          <span className="sr-only">View {title}</span>
        </Link>
      ) : (
        imageBox
      )}

      <div className="min-w-0 flex-1">
        {hasLink ? (
          <Link
            to="/product/$slug"
            params={{ slug: rental.productSlug }}
            className="block truncate text-sm font-bold text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {title}
          </Link>
        ) : (
          <p className="truncate text-sm font-bold text-foreground">{title}</p>
        )}
        {rental.condition && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Condition: {pretty(rental.condition)}
          </p>
        )}
      </div>
    </div>
  );
}

function pretty(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
