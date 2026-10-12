import { useState } from "react";
import { LifeBuoy, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { TicketForm } from "./components/TicketForm";
import { TicketList } from "./components/TicketList";
import { useTickets } from "./query";

/**
 * `/support` — the customer's help centre.
 *
 * ## Why the order link arrives as a prop
 *
 * `?orderId=` / `?rentalId=` come from a "Get help" link on the order or rental the
 * customer was already reading. Passing them in (rather than offering a picker) means the
 * ticket is attached to the thing that raised the question, with no chance of picking the
 * wrong one, and the form opens straight into composing when a link is present.
 */
export function SupportPage({
  orderId,
  rentalId,
  onCreated,
}: {
  orderId?: number;
  rentalId?: number;
  onCreated?: (id: number) => void;
}) {
  const linked = orderId !== undefined || rentalId !== undefined;
  const [composing, setComposing] = useState(linked);
  const { data, isLoading, isError, refetch } = useTickets();
  const tickets = data?.tickets ?? [];

  return (
    <div className="page-wrap max-w-3xl space-y-6 pb-12 pt-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="section-title text-3xl">Help &amp; support</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Open a ticket and the support team replies here. Everything you have raised before is
            below.
          </p>
        </div>
        {!composing ? (
          <Button onClick={() => setComposing(true)}>
            <Plus size={15} aria-hidden />
            New ticket
          </Button>
        ) : null}
      </header>

      {composing ? (
        <section className="inset-surface rounded-3xl p-6">
          <h2 className="font-heading text-lg font-extrabold">Open a ticket</h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">
            {orderId !== undefined ? `About order #${orderId}. ` : null}
            {rentalId !== undefined ? `About rental #${rentalId}. ` : null}
            Give us as much detail as you can — it saves a round trip.
          </p>
          <TicketForm
            orderId={orderId}
            rentalId={rentalId}
            onCreated={(id) => {
              setComposing(false);
              onCreated?.(id);
            }}
          />
          <div className="mt-3">
            <Button variant="ghost" size="sm" onClick={() => setComposing(false)}>
              Cancel
            </Button>
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-extrabold">Your tickets</h2>
        {isLoading ? (
          <div className="space-y-3" aria-hidden>
            {[0, 1, 2].map((index) => (
              <div key={index} className="inset-surface h-20 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            icon={LifeBuoy}
            title="Couldn't load your tickets"
            description="Check your connection and try again."
            action={
              <Button variant="secondary" size="sm" onClick={() => void refetch()}>
                Try again
              </Button>
            }
          />
        ) : tickets.length === 0 ? (
          <EmptyState
            icon={LifeBuoy}
            title="No tickets yet"
            description="When something needs a human, open a ticket here and follow the whole conversation in one place."
          />
        ) : (
          <TicketList tickets={tickets} />
        )}
      </section>
    </div>
  );
}
