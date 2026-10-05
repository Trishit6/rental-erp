import { api } from "@/lib/api/client";
import type { ActivityFilters, ActivityPage } from "./types";

/**
 * The activity timeline's only network call.
 *
 * There is no `userId` parameter, and adding one would be the single change that could
 * turn this into a surveillance endpoint: the timeline is assembled from orders,
 * rentals, reviews and listings, and every one of those is somebody's purchase history.
 * The session cookie is the only identifier, and `requireUser` supplies it.
 */

/** Query string for one page. An empty `kind` is dropped rather than sent. */
function toQueryString(filters: ActivityFilters): string {
  const params = new URLSearchParams();
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
  if (filters.kind) params.set("kind", filters.kind);
  return params.toString();
}

/** `GET /api/activity` — the signed-in user's own history, newest first. */
export async function getActivity(filters: ActivityFilters = {}): Promise<ActivityPage> {
  const query = toQueryString(filters);
  return (await api.get<ActivityPage>(`/activity${query ? `?${query}` : ""}`)).data;
}