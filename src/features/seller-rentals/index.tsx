import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { Calendar, RotateCcw } from "lucide-react";
import { formatInr } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { useRentals, useRentalActions } from "./query";
import type { RentalItem } from "@/lib/types";

export function DashboardRentalsPage() {
  const { data: rentals, isLoading } = useRentals();
  const { returnRental, cancelRental, buyNow } = useRentalActions();

  const grouped = (rentals ?? []).reduce<Record<string, RentalItem[]>>((acc, rental) => {
    (acc[rental.status] ??= []).push(rental);
    return acc;
  }, {});

  const sections = [
    { key: "CONFIRMED", label: "Upcoming" },
    { key: "ACTIVE", label: "Active" },
    { key: "RETURNED", label: "Returned" },
    { key: "CANCELLED", label: "Cancelled" },
    { key: "OVERDUE", label: "Overdue" },
  ];

  return (
    <div className="page-wrap space-y-7 pb-10 pt-8">
      <h1 className="section-title text-3xl">My rentals</h1>

      {isLoading ? (
        <Card className="h-40 animate-pulse" />
      ) : !rentals?.length ? (
        <EmptyState
          icon={Calendar}
          title="No rentals yet"
          description="Rent a camera, drill or projector for the weekend — right from your neighbours."
          action={
            <Button asChild>
              <Link to="/browse" search={{ mode: "rent" }}>Browse rentals</Link>
            </Button>
          }
        />
      ) : (
        sections.map((section) =>
          grouped[section.key]?.length ? (
            <section key={section.key} className="space-y-3">
              <h2 className="font-heading text-lg font-extrabold">{section.label}</h2>
              {grouped[section.key].map((rental) => (
                <Card key={rental.id} className="flex flex-wrap items-center gap-4 p-4">
                  <img
                    src={rental.primaryImage ?? ""}
                    alt=""
                    className="size-16 rounded-2xl object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to="/product/$slug"
                        params={{ slug: rental.productSlug }}
                        className="font-heading text-sm font-extrabold hover:text-primary"
                      >
                        {rental.title}
                      </Link>
                      <Badge className="bg-primary/10 text-primary">{rental.status}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {format(new Date(rental.startDate), "d MMM")} →{" "}
                      {format(new Date(rental.endDate), "d MMM yyyy")} ·{" "}
                      {formatInr(rental.dailyRate)}/day · Deposit{" "}
                      {formatInr(rental.securityDeposit)}
                    </p>
                    {rental.rentCreditApplied > 0 && (
                      <p className="mt-1 text-xs font-bold text-accent">
                        Rent-to-own credit applied: {formatInr(rental.rentCreditApplied)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {(rental.status === "ACTIVE" || rental.status === "CONFIRMED") && (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void returnRental(rental.id)}
                        >
                          <RotateCcw size={13} /> Return
                        </Button>
                        {rental.status === "CONFIRMED" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void cancelRental(rental.id)}
                          >
                            Cancel
                          </Button>
                        )}
                      </>
                    )}
                    {rental.status === "RETURNED" && (
                      <Button size="sm" onClick={() => void buyNow(rental.id)}>
                        Buy this item
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </section>
          ) : null,
        )
      )}
    </div>
  );
}
