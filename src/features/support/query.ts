import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import {
  createTicket,
  getDuplicateTicket,
  getHelpTopics,
  getTicket,
  getTickets,
  rateTicket,
  reopenTicket,
  replyToTicket,
} from "./api";
import type { CreateTicketInput, TicketReplyInput, TicketStatus } from "./types";

/**
 * Support queries and mutations (PROMPT 19).
 *
 * ## One root, invalidated whole
 *
 * Every mutation invalidates `queryKeys.support`. A reply changes a transcript, the
 * list's preview and the ticket's status at once, and splitting those into three
 * reconciliations is how they drift. The subtree is small — one list and one open
 * ticket — so refetching it whole is cheaper than getting it subtly wrong.
 *
 * ## Polling stops when the tab is hidden
 *
 * A ticket is close to real-time for someone waiting on support, so the open ticket
 * re-checks on an interval; `refetchIntervalInBackground: false` means a tab left open
 * overnight costs nothing instead of thousands of requests.
 */

/** How often the open ticket re-checks for a staff reply. */
export const TICKET_POLL_MS = 15_000;

/** A support error as a sentence: the server writes these for the user. */
export function supportErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Something went wrong. Please try again.";
}

export function useTickets(filters: { status?: TicketStatus } = {}) {
  return useQuery({
    queryKey: queryKeys.supportTickets(filters),
    queryFn: () => getTickets({ status: filters.status }),
  });
}

export function useTicket(id: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.supportTicket(id),
    queryFn: () => getTicket(id),
    enabled: enabled && Number.isInteger(id) && id > 0,
    refetchInterval: TICKET_POLL_MS,
    refetchIntervalInBackground: false,
  });
}

export function useHelpTopics(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: queryKeys.supportHelpTopics(trimmed),
    queryFn: () => getHelpTopics(trimmed),
    // Below three characters a suggestion is noise; the server would return the whole
    // list for a single letter, which is not a suggestion at all.
    enabled: trimmed.length >= 3,
    staleTime: 60_000,
  });
}

export function useDuplicateTicket(orderId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.supportDuplicate(orderId ?? 0),
    queryFn: () => getDuplicateTicket(orderId as number),
    enabled: typeof orderId === "number" && orderId > 0,
  });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTicketInput) => createTicket(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.support });
    },
  });
}

export function useReplyToTicket(ticketId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TicketReplyInput) => replyToTicket(ticketId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.support });
    },
    onError: (error) => {
      toast("Your reply was not sent", { description: supportErrorMessage(error) });
    },
  });
}

export function useReopenTicket(ticketId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => reopenTicket(ticketId),
    onSuccess: () => {
      toast("Ticket reopened", { description: "Support can pick it up again." });
      void queryClient.invalidateQueries({ queryKey: queryKeys.support });
    },
    onError: (error) => {
      toast("Could not reopen the ticket", { description: supportErrorMessage(error) });
    },
  });
}

export function useRateTicket(ticketId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { rating: number; comment?: string }) => rateTicket(ticketId, input),
    onSuccess: () => {
      toast("Thanks for the feedback");
      void queryClient.invalidateQueries({ queryKey: queryKeys.support });
    },
    onError: (error) => {
      toast("Could not save your rating", { description: supportErrorMessage(error) });
    },
  });
}
