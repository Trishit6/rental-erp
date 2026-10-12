import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SupportPage } from "@/features/support";

/**
 * `/support` — the customer's help centre.
 *
 * `?orderId=` / `?rentalId=` attach a new ticket to the thing the customer was already
 * looking at. They are coerced to positive integers and dropped otherwise — and the
 * server re-authorizes any id it is given against the caller, so a hand-edited value can
 * only ever reference an order or rental that already belongs to them.
 */
export const Route = createFileRoute("/_authenticated/support")({
  validateSearch: (search: Record<string, unknown>): { orderId?: number; rentalId?: number } => {
    const positiveInt = (value: unknown): number | undefined => {
      if (typeof value !== "string" && typeof value !== "number") return undefined;
      const id = Number(value);
      return Number.isInteger(id) && id > 0 ? id : undefined;
    };
    return { orderId: positiveInt(search.orderId), rentalId: positiveInt(search.rentalId) };
  },
  component: SupportRoute,
});

function SupportRoute() {
  const { orderId, rentalId } = Route.useSearch();
  const navigate = useNavigate();

  return (
    <SupportPage
      orderId={orderId}
      rentalId={rentalId}
      onCreated={(id) =>
        void navigate({ to: "/support/$ticketId", params: { ticketId: String(id) } })
      }
    />
  );
}
