import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProductImage } from "@/components/shared/product-image";
import { useSellerAlerts } from "../query";

/**
 * The dashboard's alerts card (PROMPT 21).
 *
 * ## Why this is on the dashboard and not a notification
 *
 * Neither alert is an event. A listing that has run down to its last unit, and a
 * rental that is due back in two days, are *conditions* that stay true until the
 * seller acts — so a notification would fire once and scroll away, and a badge
 * would nag forever. A card that reads the live inventory and rental tables is
 * the honest shape: it is empty when there is nothing to do, and it fills the
 * moment there is.
 *
 * ## Nothing to say, say nothing
 *
 * While loading, and when both lists are empty, the card renders nothing at all
 * rather than an "all clear" banner. A dashboard that congratulates a seller for
 * having no problems spends a card telling them nothing.
 */

function dueLabel(daysUntilDue: number): string {
  if (daysUntilDue < 0) {
    const days = Math.abs(daysUntilDue);
    return `${days} day${days === 1 ? "" : "s"} overdue`;
  }
  if (daysUntilDue === 0) return "Due today";
  if (daysUntilDue === 1) return "Due tomorrow";
  return `Due in ${daysUntilDue} days`;
}

export function SellerAlertsCard() {
  const { data } = useSellerAlerts();
  const lowStock = data?.lowStock ?? [];
  const returningSoon = data?.returningSoon ?? [];

  if (lowStock.length === 0 && returningSoon.length === 0) return null;

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} aria-hidden className="text-primary" />
        <h2 className="font-heading text-lg font-extrabold">Needs your attention</h2>
      </div>

      <div className="mt-4 grid gap-6 md:grid-cols-2">
        {lowStock.length > 0 && (
          <section aria-label="Listings running low on stock">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Running low
              </h3>
              <Button asChild size="sm" variant="ghost">
                <Link to="/seller/products">
                  Manage <ArrowRight size={13} aria-hidden />
                </Link>
              </Button>
            </div>
            <ul className="mt-2 space-y-2">
              {lowStock.map((alert) => (
                <li key={alert.id} className="flex items-center gap-3">
                  <ProductImage
                    src={alert.imageUrl}
                    alt={alert.title}
                    className="size-9 shrink-0 rounded-lg"
                    label="No photo"
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/seller/products/$productId/edit"
                      params={{ productId: String(alert.id) }}
                      className="block truncate text-sm font-semibold hover:text-primary"
                    >
                      {alert.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {alert.availableQuantity === 0
                        ? "Out of stock"
                        : `${alert.availableQuantity} of ${alert.quantity} left`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {returningSoon.length > 0 && (
          <section aria-label="Rentals due back soon">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Due back soon
              </h3>
              <Button asChild size="sm" variant="ghost">
                <Link to="/seller/rentals">
                  All rentals <ArrowRight size={13} aria-hidden />
                </Link>
              </Button>
            </div>
            <ul className="mt-2 space-y-2">
              {returningSoon.map((alert) => (
                <li key={alert.id} className="flex items-center gap-3">
                  <ProductImage
                    src={alert.imageUrl}
                    alt={alert.title}
                    className="size-9 shrink-0 rounded-lg"
                    label="No photo"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{alert.title}</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <RotateCcw size={12} aria-hidden />
                      {alert.renterName ? `${alert.renterName} · ` : ""}
                      <span
                        className={
                          alert.daysUntilDue < 0 ? "font-semibold text-destructive" : undefined
                        }
                      >
                        {dueLabel(alert.daysUntilDue)}
                      </span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Card>
  );
}
