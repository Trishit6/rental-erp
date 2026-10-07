import { createFileRoute } from "@tanstack/react-router";
import { ActivityPage } from "@/features/activity";
import { requireAuth } from "@/lib/auth/guards";

/**
 * `/profile/activity` — the signed-in user's own history as a timeline.
 *
 * Sits under `/profile` for the same reason `/profile/orders`, `/profile/rentals` and
 * `/profile/wishlist` do: the account menu names those destinations under the profile,
 * and a page named after the profile is where a user looks for "everything I've done".
 *
 * Auth-only, deliberately not `requireSeller`: the timeline merges what someone bought
 * with what they sold, and a customer who has only ever bought has a perfectly good one.
 *
 * `?kind=` and `?page=` are the filter chips and the pager, and the search type is kept
 * as open as the params really are (`Record<string, string | number | undefined>`)
 * because that is what `toActivityUrlSearch` produces. Narrowing to a fixed object type
 * here would force the feature to hand-build that object instead of deriving it from
 * the canonical filters, which is where the bugs would then come from. The real parsing
 * — `?page=-3` → page 1, `?kind=nonsense` → no filter — is `parseActivityFilters` in
 * `features/activity/index.tsx`, called once, on the raw params.
 */
export const Route = createFileRoute("/profile/activity")({
  validateSearch: (search: Record<string, unknown>) => {
    const out: Record<string, string | number | undefined> = {};
    if (typeof search.kind === "string") out.kind = search.kind;
    if (typeof search.page === "string") out.page = search.page;
    return out;
  },
  beforeLoad: requireAuth,
  component: ActivityPage,
});
