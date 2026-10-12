import { createFileRoute } from "@tanstack/react-router";
import { TicketDetailPage } from "@/features/support/ticket-page";

/**
 * `/support/$ticketId` — one ticket.
 *
 * The trailing underscore on `support_` keeps this route a *sibling* of `/support`
 * rather than a child of it. A child route renders inside its parent's `<Outlet />`, and
 * the support list page has none — it is a page, not a layout — so nesting would leave
 * the detail unreachable. This is the file-based-router spelling of "same URL prefix,
 * different page".
 *
 * The param is coerced here and re-checked on the server: a ticket id that is not the
 * caller's is a `404`, so the page can trust the payload it is given and has no
 * client-side ownership check to get wrong.
 */
export const Route = createFileRoute("/_authenticated/support_/$ticketId")({
  component: TicketRoute,
});

function TicketRoute() {
  const { ticketId } = Route.useParams();
  return <TicketDetailPage ticketId={Number(ticketId)} />;
}
