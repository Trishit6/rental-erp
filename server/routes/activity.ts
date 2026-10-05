import { Router } from "../lib/http";
import { ok } from "../lib/api";
import { requireUser } from "../lib/auth";
import {
  activityKindsPresent,
  buildActivityTimeline,
  isActivityKind,
  paginateActivity,
  type ActivityKind,
} from "../lib/activity";

/**
 * `GET /api/activity` — the session user's own history as a timeline.
 *
 * ## Why this is scoped to one person and cannot be widened
 *
 * There is no `userId` parameter, and adding one would be the one change that could
 * turn this into a surveillance endpoint: an activity timeline is assembled from
 * orders, rentals, reviews and listings, and every one of those is somebody's
 * purchase history. `requireUser` supplies the only id, from the session.
 *
 * For the same reason nothing in `server/lib/activity.ts` reads `admin_audit_log` or
 * any other administrative surface — an admin reads *their own* activity here, and
 * uses the admin workspace for everyone else's. See that module's header comment.
 */
export const activityRoute = new Router();

activityRoute.use("*", async (c, next) => {
  requireUser(c);
  await next();
});

activityRoute.get("/", async (c) => {
  const user = c.get("user")!;
  const query = c.req.query();

  const page = Number(query.page);
  const pageSize = Number(query.pageSize);
  const kind = query.kind?.trim() ?? "";

  const timeline = await buildActivityTimeline(user);

  // An unrecognised `kind` is dropped rather than 400ing: these arrive as a query
  // string, and a filter chip from an older bookmark should degrade to "no filter"
  // rather than to an error page. An *empty* kind is also dropped, so `?kind=` cannot
  // be used to ask for a timeline with nothing in it.
  const filter: ActivityKind | null = kind.length > 0 && isActivityKind(kind) ? kind : null;
  const filtered = filter ? timeline.items.filter((item) => item.kind === filter) : timeline.items;

  return c.json(
    ok({
      ...paginateActivity(filtered, page, pageSize),
      total: filtered.length,
      // Chips are derived from what this person actually has, so a brand-new account
      // shows "Joined Revaro" and no nine empty filters.
      availableKinds: activityKindsPresent(timeline.items),
    }),
  );
});