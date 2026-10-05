import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { addCartItemSchema } from "./schema";
import type { CartItem, CartListingType, UpdateCartItemInput } from "../types";

/**
 * The mode of a line: Rent or Buy.
 *
 * `RENT_AND_BUY` is what the *product* supports, never what a line is — so this
 * control resolves that capability into the concrete choice, and only offers a
 * switch when the product genuinely supports the other mode.
 *
 * Switching is a server-backed cart update, never a local flip: the line's mode
 * decides its dates, its price and how it merges, so it has to go through the
 * same endpoint an add would.
 */
export function CartItemMode({
  item,
  onUpdate,
  disabled,
  className,
}: {
  item: CartItem;
  onUpdate: (patch: UpdateCartItemInput) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  const product = item.product;

  // A purchase cannot become a rental without dates, and a rental cannot become a
  // purchase while keeping them — so switching one way is offered and the other
  // sends the user to the product page to pick dates properly.
  const canBuy = !!product?.purchasePrice;
  const canRent = !!product?.rentalPricePerDay;
  const alternative: CartListingType | null =
    item.mode === "BUY" ? (canRent ? "RENT" : null) : canBuy ? "BUY" : null;

  if (!alternative) {
    return (
      <span className={cn("text-xs font-bold text-muted-foreground", className)}>
        {item.mode === "RENT" ? "Rental" : "Purchase"}
      </span>
    );
  }

  async function switchMode() {
    if (!product || !alternative || pending) return;

    // Validated exactly as an add would be, so a switch can never create a
    // configuration the cart endpoint would reject.
    const candidate =
      alternative === "RENT"
        ? {
            productId: product.id,
            mode: "RENT" as const,
            quantity: item.quantity,
            startDate: item.startDate ?? undefined,
            endDate: item.endDate ?? undefined,
          }
        : { productId: product.id, mode: "BUY" as const, quantity: item.quantity };

    if (!addCartItemSchema.safeParse(candidate).success) {
      // A rental needs a real window; the product page collects it.
      onUpdate({ mode: alternative, startDate: null, endDate: null });
      return;
    }

    setPending(true);
    onUpdate({ mode: alternative });
    setPending(false);
  }

  return (
    <button
      type="button"
      onClick={() => void switchMode()}
      disabled={disabled || pending}
      aria-label={`Switch ${product?.title ?? "this item"} to ${alternative === "RENT" ? "rent" : "buy"}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold text-primary",
        "transition hover:bg-primary/10 disabled:opacity-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        className,
      )}
    >
      {pending ? (
        <RefreshCw size={12} aria-hidden className="animate-spin" />
      ) : (
        <span>Switch to {alternative === "RENT" ? "rent" : "buy"}</span>
      )}
    </button>
  );
}
