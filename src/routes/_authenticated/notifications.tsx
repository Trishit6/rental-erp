import { createFileRoute } from "@tanstack/react-router";
import { NotificationsPage } from "@/features/notifications";
import { requireAuth } from "@/lib/auth/guards";

/**
 * `/notifications` — the full notification feed.
 *
 * The search shape is declared, but *not* validated, here — on purpose.
 *
 * `validateSearch` is how a TanStack route acquires a typed `search`, which is what
 * lets the page's `navigate({ search: { category: "ORDERS", page: 2 } })` typecheck at
 * all; with no validator the router rejects the search object the page builds. But
 * narrowing the fields here would be the wrong place to do it: params arrive as query
 * strings, so a hand-edited `?page=-3` or `?category=anything` has to degrade to "page 1,
 * no filter" rather than throw `VALIDATION_ERROR` and replace the feed with an error
 * screen. `parseNotificationFilters` (`features/notifications/components/schema.ts`)
 * already does exactly that with `.catch`-guarded Zod, and the page calls it on the raw
 * params. So the route keeps the shape wide — `Record<string, string | undefined>`,
 * which is the honest type for "unvalidated query string" — and the single parse stays
 * in one place instead of being written twice.
 */
export const Route = createFileRoute("/notifications")({
  validateSearch: (search: Record<string, unknown>) => {
    const out: Record<string, string | undefined> = {};
    for (const key of ["page", "category", "unread"]) {
      const value = search[key];
      if (typeof value === "string") out[key] = value;
    }
    return out;
  },
  beforeLoad: requireAuth,
  component: NotificationsPage,
});
