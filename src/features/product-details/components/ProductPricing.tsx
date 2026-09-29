import { motion, useReducedMotion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { formatInr, formatInrRental, quoteRental } from "@/lib/pricing";
import { cn } from "@/lib/utils/cn";
import type { ListingMode, ProductDetails, RentalOption } from "../types";
import { isBuyable, isRentable } from "./schema";

function PriceLine({
  label,
  amount,
  suffix,
  emphasis,
}: {
  label?: string;
  amount: string;
  suffix?: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      {label && (
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      )}
      <p
        className={cn(
          "font-heading font-extrabold",
          emphasis ? "text-3xl sm:text-[32px]" : "text-xl",
        )}
      >
        {amount}
        {suffix && (
          <span className="ml-1.5 text-sm font-semibold text-muted-foreground">{suffix}</span>
        )}
      </p>
    </div>
  );
}

/**
 * Pricing for the selected mode.
 *
 * The rental subtotal comes from the same `quoteRental` the cart and checkout
 * use, so what is quoted here is what gets charged — this is display, never the
 * source of truth.
 */
export function ProductPricing({
  product,
  mode,
  rentalOption,
  quantity,
}: {
  product: ProductDetails;
  mode: ListingMode;
  rentalOption: RentalOption | null;
  quantity: number;
}) {
  const reduceMotion = useReducedMotion();
  const rentable = isRentable(product);
  const buyable = isBuyable(product);

  const quote =
    rentalOption && rentable
      ? quoteRental(product, {
          startDate: rentalOption.startDate,
          endDate: rentalOption.endDate,
        })
      : null;

  const showRent = rentable && (mode === "RENT" || mode === "RENT_AND_BUY");
  const showBuy = buyable && (mode === "BUY" || mode === "RENT_AND_BUY");

  return (
    <motion.div
      key={mode}
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="inset-surface space-y-4 rounded-3xl p-5"
    >
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        {showRent && (
          <PriceLine
            label={showBuy ? "Rent" : undefined}
            amount={formatInr(product.rentalPricePerDay ?? 0)}
            suffix="/ day"
            emphasis={!showBuy}
          />
        )}
        {showBuy && (
          <PriceLine
            label={showRent ? "Buy" : undefined}
            amount={formatInr(product.purchasePrice ?? 0)}
            emphasis={!showRent}
          />
        )}
        {!showRent && !showBuy && (
          <p className="text-sm font-semibold text-muted-foreground">
            This listing has no published price.
          </p>
        )}
      </div>

      {showRent && quote && (
        <div className="space-y-1.5 border-t border-white/50 pt-3.5 dark:border-white/5">
          <p className="text-sm font-semibold">
            {formatInr(quote.dailyRate)} × {quote.days} {quote.days === 1 ? "day" : "days"} ={" "}
            <span className="font-heading font-extrabold">{formatInr(quote.rentalSubtotal)}</span>
          </p>
          {quote.securityDeposit > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck size={13} className="text-accent" aria-hidden />
              Security deposit: {formatInr(quote.securityDeposit)} — refundable on return
            </p>
          )}
        </div>
      )}

      {showBuy && quantity > 1 && (
        <p className="border-t border-white/50 pt-3.5 text-sm font-semibold dark:border-white/5">
          {formatInr(product.purchasePrice ?? 0)} × {quantity} ={" "}
          <span className="font-heading font-extrabold">
            {formatInr((product.purchasePrice ?? 0) * quantity)}
          </span>
        </p>
      )}

      {!showRent && rentable && (
        <p className="border-t border-white/50 pt-3.5 text-xs text-muted-foreground dark:border-white/5">
          Also available to rent from {formatInrRental(product.rentalPricePerDay ?? 0)}
        </p>
      )}
    </motion.div>
  );
}
