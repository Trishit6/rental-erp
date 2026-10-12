import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import { blockAccount, getBlockedUsers, submitReport, unblockAccount } from "./api";
import type { BlockedUser, ReportTarget } from "./types";

/**
 * Account-blocking queries and mutations.
 *
 * One list, two mutations, and every mutation invalidates the same key. That is
 * the whole cache contract: the thread header reads "is this account blocked?" by
 * looking in this list, so a block placed from `/settings` and a block placed from
 * a thread must land in the same place or the two surfaces would disagree about a
 * user's own decisions.
 */

/**
 * `GET /api/users/blocked` — the accounts the session user has blocked.
 *
 * `enabled` lets a surface that may never need the list (a guest, a component
 * rendered before the session resolves) opt out rather than fire a request the
 * server would answer 401.
 */
export function useBlockedUsers(enabled = true) {
  return useQuery({
    queryKey: queryKeys.blockedUsers,
    queryFn: getBlockedUsers,
    enabled,
    staleTime: 60_000,
  });
}

/** Whether a single account is on the session user's block list. */
export function useIsBlocked(userId: number | undefined): boolean {
  const { data } = useBlockedUsers(userId !== undefined);
  if (userId === undefined || !data) return false;
  return data.some((row) => row.id === userId);
}

/** Block an account. Idempotent server-side, so a double tap is harmless. */
export function useBlockUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, reason }: { userId: number; reason?: string }) =>
      blockAccount(userId, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.blockedUsers });
      // The blocked account's threads stop being sendable, so the list's copy of
      // each thread is now stale in a way only the server can correct.
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      toast("Blocked", {
        description: "They can no longer message you. You can unblock them any time.",
      });
    },
    onError: (error) => {
      toast(blockErrorMessage(error), { description: "The account was not blocked." });
    },
  });
}

/** Lift a block. */
export function useUnblockUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: number) => unblockAccount(userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.blockedUsers });
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      toast("Unblocked", { description: "They can message you again." });
    },
    onError: (error) => {
      toast(blockErrorMessage(error), { description: "The block was not lifted." });
    },
  });
}

/* -------------------------------- reporting --------------------------------- */

/**
 * File a report (PROMPT 18).
 *
 * Success and failure both surface as a toast. The dialog closes from the caller's
 * `onSuccess`, so a failed submission leaves the form open with the user's text
 * intact rather than discarding it and pretending it was filed.
 */
export function useSubmitReport() {
  return useMutation({
    mutationFn: ({
      target,
      reason,
      details,
    }: {
      target: ReportTarget;
      reason: string;
      details?: string;
    }) => submitReport(target, { reason, details }),
    onSuccess: () => {
      toast("Report submitted", {
        description: "Our moderators will take a look. Thanks for flagging it.",
      });
    },
    onError: (error) => {
      toast("Could not submit the report", { description: blockErrorMessage(error) });
    },
  });
}

/* ---------------------------------- errors ---------------------------------- */

/**
 * A blocking or reporting error as a sentence.
 *
 * The server writes these for the user ("You can't message this account."), so an
 * `ApiError` message is passed through; anything else falls back to a neutral line.
 */
export function blockErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Something went wrong. Please try again.";
}

export type { BlockedUser };
