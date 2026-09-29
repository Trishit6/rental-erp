import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { cartErrorMessage, useValidateCart } from "@/lib/query/cart";
import { Button } from "@/components/ui/button";
import { canCheckout } from "./schema";
import type { CartItem } from "../types";

/**
 * The checkout gate.
 *
 * Pressing this does **not** navigate. It asks the server to re-check the cart
 * against the products as they are *now* — price, stock, mode, rental window —
 * and only navigates when the answer is clean. A stale line is therefore caught
 * here, on the cart, rather than becoming an order the user did not expect.
 *
 * It creates nothing: no order, no rental, no payment. The cart stays a cart.
 */
export function CartActions({
  items,
  disabled,
  className,
  label = "Proceed to checkout",
  onValidated,
}: {
  items: CartItem[];
  disabled?: boolean;
  className?: string;
  label?: string;
  /** Called when validation is clean, just before navigating. */
  onValidated?: () => void;
}) {
  const navigate = useNavigate();
  const validate = useValidateCart();
  const [blocked, setBlocked] = useState(false);

  const nothingToDo = items.length === 0;
  const knownBad = !canCheckout(items);

  async function proceed() {
    if (nothingToDo || validate.isPending) return;

    try {
      const result = await validate.mutateAsync();

      if (!result.valid) {
        setBlocked(true);
        // The response already wrote the fresh items and totals into the cache,
        // so the list below now shows exactly what is wrong.
        toast.error("Your cart needs attention before checkout.");
        return;
      }

      onValidated?.();
      void navigate({ to: "/checkout" });
    } catch (error) {
      toast.error(cartErrorMessage(error));
    }
  }

  return (
    <div className={className}>
      <Button
        size="lg"
        className="w-full"
        onClick={() => void proceed()}
        disabled={disabled || nothingToDo || validate.isPending}
        aria-busy={validate.isPending}
      >
        {validate.isPending ? (
          <>
            <Loader2 size={15} aria-hidden className="animate-spin" />
            Checking your cart…
          </>
        ) : (
          <>
            {label}
            <ArrowRight size={15} aria-hidden />
          </>
        )}
      </Button>

      {knownBad || blocked ? (
        <p
          role="status"
          className="mt-2 flex items-start gap-1.5 text-[11px] font-semibold text-primary"
        >
          <ShieldAlert size={12} aria-hidden className="mt-0.5 shrink-0" />
          Some items need attention first — see the note on the item above.
        </p>
      ) : (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Final totals, delivery and payment are confirmed at checkout.
        </p>
      )}
    </div>
  );
}
