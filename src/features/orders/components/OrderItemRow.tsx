import { Link } from "@tanstack/react-router";
import { ProductImage } from "@/components/shared/product-image";
import { formatInr } from "@/lib/pricing";
import { cn } from "@/lib/utils/cn";
import { ReviewProductButton } from "@/features/reviews";
import { itemModeLabel, type OrderItem } from "../types";

/**
 * One line of an order.
 *
 * Renders the item snapshot — the name and price as they were when the order was
 * placed — and offers a link to the live product only when one still exists.
 * Rental duration is shown for rentals; a purchase never grows a duration it
 * does not have.
 */
export function OrderItemRow({
  item,
  sellerName,
  className,
}: {
  item: OrderItem;
  sellerName?: string | null;
  className?: string;
}) {
  const isRental = item.mode === "RENT";

  return (
    <li className={cn("flex gap-3 py-4", className)} data-testid={`order-item-${item.id}`}>
      <span className="raised-surface flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl">
        <ProductImage src={item.imageUrl} alt="" />
      </span>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {item.productSlug ? (
              <Link
                to="/product/$slug"
                params={{ slug: item.productSlug }}
                className="block truncate text-sm font-bold text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                {item.titleSnapshot}
              </Link>
            ) : (
              // The listing is gone; the receipt still shows what was bought.
              <span className="block truncate text-sm font-bold text-foreground">
                {item.titleSnapshot}
              </span>
            )}
            {item.condition && (
              <p className="text-[11px] text-muted-foreground">Condition: {prettyCondition(item.condition)}</p>
            )}
          </div>

          <span className="shrink-0 text-sm font-bold tabular-nums">{formatInr(item.lineTotal)}</span>
        </div>

        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <div className="flex gap-1">
            <dt>Qty:</dt>
            <dd className="font-semibold text-foreground">{item.quantity}</dd>
          </div>
          <div className="flex gap-1">
            <dt>Mode:</dt>
            <dd className="font-semibold text-foreground">{itemModeLabel(item.mode)}</dd>
          </div>
          {isRental && item.rentalDays !== null && (
            <div className="flex gap-1">
              <dt>Duration:</dt>
              <dd className="font-semibold text-foreground">
                {item.rentalDays} day{item.rentalDays === 1 ? "" : "s"}
              </dd>
            </div>
          )}
          {item.unitPrice > 0 && (
            <div className="flex gap-1">
              <dt>{isRental ? "Rate:" : "Unit:"}</dt>
              <dd className="font-semibold text-foreground">
                {formatInr(item.unitPrice)}
                {isRental ? "/day" : ""}
              </dd>
            </div>
          )}
          {sellerName && (
            <div className="flex gap-1">
              <dt>Sold by:</dt>
              <dd className="font-semibold text-foreground">{sellerName}</dd>
            </div>
          )}
        </dl>

        {isRental && item.securityDeposit > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Includes {formatInr(item.securityDeposit)} refundable security deposit
          </p>
        )}

        {/* Nothing renders here unless the server marked this line reviewable or
            already reviewed — see the order detail endpoint's per-line `review`
            block, which is computed from the same rule that guards POST /reviews. */}
        {item.review && (
          <ReviewProductButton
            orderItemId={item.id}
            purchaseType={item.review.purchaseType}
            eligible={item.review.eligible}
            existingReviewId={item.review.reviewId}
          />
        )}
      </div>
    </li>
  );
}

function prettyCondition(condition: string): string {
  return condition
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
