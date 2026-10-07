import { createFileRoute } from "@tanstack/react-router";
import { MessagesPage } from "@/features/messages";

/**
 * `/messages` — the conversation centre.
 *
 * `?conversation=<id>` is the open thread. Same reasoning as
 * `src/routes/notifications.tsx` for why a `validateSearch` is declared rather than
 * left implicit — it is what gives the page a typed `search` so
 * `navigate({ search: { conversation: id } })` typechecks.
 *
 * Unlike the notification feed, this one *does* narrow, because there is a real
 * difference between "no thread open" and "an id that is not a thread": `undefined`
 * means render the list with nothing selected, and it is also what lets the page
 * auto-select the newest thread exactly once. Anything that is not a positive integer
 * is dropped to `undefined` rather than propagated, so a hand-edited `?conversation=abc`
 * degrades to that same auto-select instead of putting `NaN` into a query cache key.
 *
 * Coercion is safe here and only here because the value is re-authorized on the server:
 * the id is a *hint* about what to display. `requireParticipation`
 * (`server/lib/messaging.ts`) resolves the row and 403s unless the caller is a
 * participant, so no guess in the URL can reach another person's thread.
 */
export const Route = createFileRoute("/_authenticated/messages")({
  validateSearch: (search: Record<string, unknown>): { conversation?: number } => {
    const raw = search.conversation;
    if (typeof raw !== "string" && typeof raw !== "number") return {};
    const id = Number(raw);
    return { conversation: Number.isInteger(id) && id > 0 ? id : undefined };
  },
  component: MessagesPage,
});
