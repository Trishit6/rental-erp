import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { formatInr } from "@/lib/pricing";
import { useAuth } from "@/lib/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { AddressPicker } from "./components/AddressPicker";
import { DeliveryMethodSelector } from "./components/DeliveryMethodSelector";
import { useAddresses, useCartItems } from "./query";

export function CheckoutPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [deliveryMethod, setDeliveryMethod] = useState<"DELIVERY" | "PICKUP">("DELIVERY");
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);

  const { data: items, totals, isLoading } = useCartItems();
  const { data: addresses } = useAddresses();

  const activeItems = (items ?? []).filter((item) => !item.savedForLater);
  const needsAddress = deliveryMethod === "DELIVERY" && !selectedAddressId;
  const blockedIssues = activeItems.filter((item) => item.issues.length > 0);
  const canContinue = activeItems.length > 0 && blockedIssues.length === 0 && !needsAddress;

  function handleContinue() {
    // Hand the *choices* forward. The amount is recomputed by the server on the
    // payment page, so nothing decided here is treated as the price.
    void navigate({
      to: "/payment",
      search: {
        deliveryMethod,
        addressId: deliveryMethod === "DELIVERY" ? (selectedAddressId ?? undefined) : undefined,
      },
    });
  }

  if (!user) {
    return (
      <div className="page-wrap py-16">
        <EmptyState
          icon={ShieldCheck}
          title="Sign in to checkout"
          description="..."
          action={
            <Button asChild>
              <Link to="/login">Sign in</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="page-wrap max-w-4xl space-y-4 pt-8">
        <div className="raised-surface h-40 animate-pulse rounded-3xl" />
        <div className="raised-surface h-64 animate-pulse rounded-3xl" />
      </div>
    );
  }

  if (activeItems.length === 0) {
    return (
      <div className="page-wrap py-16">
        <EmptyState
          icon={ShieldCheck}
          title="Nothing to checkout"
          description="Your cart is empty."
          action={
            <Button asChild>
              <Link to="/browse">Browse items</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="page-wrap max-w-4xl space-y-6 pb-10 pt-8">
      <div>
        <p className="eyebrow">Almost there</p>
        <h1 className="section-title mt-1 text-3xl">Checkout</h1>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-5">
          {/* Contact */}
          <Card className="p-5">
            <h2 className="font-heading text-lg font-extrabold">Contact</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {user.name} · {user.email}
            </p>
          </Card>

          {deliveryMethod === "DELIVERY" && (
            <AddressPicker
              addresses={addresses}
              selectedId={selectedAddressId}
              onSelect={setSelectedAddressId}
            />
          )}

          <DeliveryMethodSelector value={deliveryMethod} onChange={setDeliveryMethod} />
        </div>

        {/* Summary */}
        <Card className="h-fit space-y-3 p-5">
          <h2 className="font-heading text-lg font-extrabold">Order summary</h2>
          {activeItems.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {item.product?.title ?? "Unavailable item"}
              </span>
              <span className="font-bold">{formatInr(item.pricing.lineTotal)}</span>
            </div>
          ))}
          <div className="neumo-divider" />
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Items</span>
            <span className="font-bold">{formatInr(totals.subtotal)}</span>
          </div>
          {totals.securityDeposits > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Deposits (refundable)</span>
              <span className="font-bold">{formatInr(totals.securityDeposits)}</span>
            </div>
          )}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Delivery and the final total are calculated on our servers and shown on the next step.
          </p>

          {blockedIssues.length > 0 && (
            <p className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive" role="alert">
              {blockedIssues[0].issues[0]?.message ?? "Some items in your cart need attention."}
            </p>
          )}
          {needsAddress && (
            <p className="text-xs text-muted-foreground" role="status">
              Choose a delivery address to continue.
            </p>
          )}

          <Button size="lg" className="w-full" onClick={handleContinue} disabled={!canContinue}>
            Continue to payment
          </Button>
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck size={12} className="text-accent" />
            Your order is only created after your payment is confirmed.
          </p>
        </Card>
      </div>
    </div>
  );
}
