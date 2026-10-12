import { api } from "@/lib/api/client";
import type { BlockedUser, ReportTarget } from "./types";

/**
 * Every network call the safety feature makes.
 *
 * ## Ids, not objects
 *
 * A block names a `userId` and nothing else. There is no "block this email" or
 * "block this product's seller" variant, because a client that could name a user
 * by anything but their id would be a client that could infer an id. The thread
 * header already holds the counterparty's id from the conversation payload, and
 * `/settings` reads ids from the blocked list it was given.
 */

/** `GET /api/users/blocked` — the accounts the session user has blocked. */
export async function getBlockedUsers(): Promise<BlockedUser[]> {
  const { data } = await api.get<BlockedUser[]>("/users/blocked");
  return data ?? [];
}

/** `POST /api/users/:id/block` — idempotent; blocking twice is not an error. */
export async function blockAccount(userId: number, reason?: string): Promise<void> {
  await api.post(`/users/${userId}/block`, reason && reason.length > 0 ? { reason } : {});
}

/** `DELETE /api/users/:id/block` — idempotent; unblocking nothing is a success. */
export async function unblockAccount(userId: number): Promise<void> {
  await api.delete(`/users/${userId}/block`);
}

/**
 * The request field that names each kind of target.
 *
 * The mapping lives here rather than on the server's side of the wire because the
 * client is the side that knows which *thing* the user right-clicked; the server only
 * needs to be told which id belongs to which column. Keeping one table means the
 * dialog never has to branch on kind.
 */
const REPORT_FIELD_BY_KIND: Record<ReportTarget["kind"], string> = {
  product: "productId",
  user: "reportedUserId",
  review: "reviewId",
  message: "messageId",
  order: "orderId",
  rental: "rentalId",
};

/** `POST /api/reports` — file a report against exactly one target. */
export async function submitReport(
  target: ReportTarget,
  input: { reason: string; details?: string },
): Promise<{ id: number }> {
  const body: Record<string, unknown> = {
    [REPORT_FIELD_BY_KIND[target.kind]]: target.id,
    reason: input.reason,
  };
  const details = input.details?.trim();
  if (details) body.details = details;

  const { data } = await api.post<{ id: number }>("/reports", body);
  return data;
}
