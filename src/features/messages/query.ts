import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import { syncConversations, syncMessages, pushMessage } from "@/lib/tanstack-db/sync";
import { useAuth } from "@/lib/auth/auth-context";
import {
  getConversationContext,
  getConversations,
  getMessages,
  markConversationRead,
  sendMessage,
  startConversation,
} from "./api";
import type { ConversationSummary, MessageRecord, StartConversationInput } from "./types";

/**
 * Messaging queries and mutations.
 *
 * ## Two conversations roots, deliberately
 *
 * `queryKeys.conversations` holds the *list* and `queryKeys.messages` holds a
 * *transcript*. They are not merged because their lifetimes differ: sending a message
 * should re-order and bump the unread count in the list (a refetch of eight rows), but
 * it should not blow away a transcript the user is reading — and, in the other
 * direction, the list refreshing on its 15s poll should not re-render the thread. When
 * the two shared a key, every incoming message re-read a full transcript for the list.
 *
 * ## Polling, and why it stops when the tab is hidden
 *
 * A conversation is close to real-time for a user who is waiting for a reply, so the
 * transcript polls. `refetchInterval` returns `false` when the document is hidden,
 * which means a tab left open overnight costs nothing instead of 2880 requests.
 */

/** How often the transcript re-checks for a reply. */
export const MESSAGES_POLL_MS = 10_000;

/** How often the conversation list re-orders. */
export const CONVERSATIONS_POLL_MS = 15_000;

/**
 * `GET /api/conversations` — the thread list.
 *
 * Mirrored into the reactive store so the sidebar and any header affordance read the
 * same rows. The list is *replaced* in the store rather than merged, because it is the
 * whole truth for this screen and a thread that dropped out of the response should not
 * survive in the store as if it were still open.
 */
export function useConversations(enabled = true) {
  return useQuery({
    queryKey: queryKeys.conversations,
    queryFn: async (): Promise<ConversationSummary[]> => {
      const rows = await getConversations();
      syncConversations(
        rows.map((row) => ({
          conversationId: row.conversationId,
          productId: row.productId,
          productTitle: row.productTitle,
          productSlug: row.productSlug,
          lastMessageAt: row.lastMessageAt,
          unread: row.unread,
          otherUserName: row.otherUser?.name ?? null,
          otherUserAvatarUrl: row.otherUser?.avatarUrl ?? null,
        })),
      );
      return rows;
    },
    enabled,
    refetchInterval: CONVERSATIONS_POLL_MS,
    // A transcript's unread count is the server's, not a client count, so the list has
    // to keep polling to notice a message that arrived while the user was reading
    // another thread.
    refetchIntervalInBackground: false,
  });
}

/**
 * `GET /api/conversations/:id/messages` — the open thread.
 *
 * Reading the transcript advances the read marker as a *side effect of the read*, which
 * is the same design the endpoint had before: there is no separate "mark read" call to
 * forget, and the unread badge in the sidebar clears itself because the user is looking
 * at the messages.
 */
export function useMessages(conversationId: number | null, enabled = true) {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: queryKeys.messageList(conversationId ?? 0, 1),
    queryFn: async (): Promise<MessageRecord[]> => {
      const rows = await getMessages(conversationId as number);
      syncMessages(
        rows.map((row) => ({
          id: row.id,
          conversationId: conversationId as number,
          senderId: row.senderId,
          body: row.body,
          createdAt: row.createdAt,
          isRead: row.isMine,
        })),
      );
      return rows;
    },
    enabled: enabled && !!conversationId,
    refetchInterval: MESSAGES_POLL_MS,
    refetchIntervalInBackground: false,
  });

  // Re-stamp the read marker when the tab regains focus with the same thread open. The
  // poll above already handles the common case; this covers the one it does not — a
  // message that arrived while the tab was in the background, which
  // `refetchIntervalInBackground: false` deliberately skips.
  useEffect(() => {
    if (!conversationId || document.visibilityState !== "visible") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void markConversationRead(conversationId).catch(() => {
          // Best-effort: the next transcript poll re-reads and re-stamps anyway, so a
          // failure here is not worth surfacing to the user.
        });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [conversationId, user?.id]);

  return query;
}

/** The order/rental ids a new thread may name. Fetched only when the composer asks. */
export function useConversationContext(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.conversationContext,
    queryFn: getConversationContext,
    enabled,
    staleTime: 60_000,
  });
}

/* -------------------------------- mutations -------------------------------- */

/**
 * Send a message into an existing thread.
 *
 * Optimistic in the only sense that is honest here: the row is written into the store
 * immediately so the composer clears and the bubble appears, and it is **removed again
 * if the request fails**, restoring the draft. The optimistic row carries the server's
 * `id` when the response lands — but until then it has none, which is why the local
 * row is keyed on a negative id rather than pretending to be a real message.
 *
 * The draft is restored on failure because a message the user typed and lost is worse
 * than any error message: they would have to reconstruct it. `variables` carries it back
 * from the mutation for exactly that.
 */
export function useSendMessage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: ({ conversationId, body }: { conversationId: number; body: string }) =>
      sendMessage(conversationId, body),

    onMutate: async ({ conversationId, body }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.messageList(conversationId, 1) });
      const previous = queryClient.getQueryData<MessageRecord[]>(
        queryKeys.messageList(conversationId, 1),
      );

      // A negative id keeps it distinguishable from a real message id (which starts at
      // 1) and cannot collide with one, so `pushMessage`'s duplicate guard treats a
      // refetch landing mid-send as a no-op rather than a thrown insert.
      const optimistic: MessageRecord = {
        id: -Date.now(),
        senderId: user?.id ?? 0,
        senderName: user?.name ?? "You",
        body,
        createdAt: new Date().toISOString(),
        isMine: true,
      };
      pushMessage({
        id: optimistic.id,
        conversationId,
        senderId: optimistic.senderId,
        body,
        createdAt: optimistic.createdAt,
        isRead: true,
      });
      queryClient.setQueryData<MessageRecord[]>(
        queryKeys.messageList(conversationId, 1),
        (old) => [...(old ?? []), optimistic],
      );

      return { previous, conversationId, body };
    },

    onError: (error, _variables, context) => {
      // Put the failed row back out of the cache and tell the user, with the text they
      // lost quoted back at them so they can retype it rather than reconstruct it.
      if (context?.conversationId && context.previous) {
        queryClient.setQueryData(
          queryKeys.messageList(context.conversationId, 1),
          context.previous,
        );
      }
      toast(messageErrorMessage(error), {
        description: `Your message wasn't sent: “${context?.body ?? ""}”`,
      });
    },

    onSuccess: (message, { conversationId }) => {
      // Replace the optimistic row with the real one. `pushMessage` rather than a
      // re-fetch, so the bubble the user is looking at becomes the server's row without
      // the transcript jumping.
      pushMessage({
        id: message.id,
        conversationId,
        senderId: message.senderId,
        body: message.body,
        createdAt: message.createdAt,
        isRead: message.isMine,
      });
      queryClient.setQueryData<MessageRecord[]>(
        queryKeys.messageList(conversationId, 1),
        (old) => {
          if (!old) return old;
          const withoutOptimistic = old.filter((row) => row.id > 0 || row.body !== message.body);
          return [...withoutOptimistic, message];
        },
      );
      // The list's ordering and the other party's unread badge both changed.
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}

/**
 * Open a thread about a listing.
 *
 * Not optimistic — there is nothing to show until the server has decided *which*
 * conversation this is. `findOrCreateConversation` may resume an existing thread
 * rather than create one, so the client cannot predict the id, and a speculative row
 * would put a thread in the sidebar that the server then does not have.
 */
export function useStartConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: StartConversationInput) => startConversation(input),
    onSuccess: (started) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      toast("Message sent", {
        description: "The seller will see it in their messages.",
      });
      return started;
    },
    onError: (error) => {
      toast(messageErrorMessage(error), {
        description: "Your message wasn't sent.",
      });
    },
  });
}

/* ----------------------------------- gate ----------------------------------- */

/** Why "Message seller" is or is not being offered for a listing. */
export type MessageSellerGate = {
  /** Nobody is signed in — the offer has to lead to the login page instead. */
  isGuest: boolean;
  /** The viewer owns this listing; there is no one on the other side to talk to. */
  isOwnListing: boolean;
};

/**
 * Whether to offer "Message seller" on this listing at all.
 *
 * ## Why this is a hook and not a component-level `if`
 *
 * The same two decisions — "is anyone signed in" and "is this your own listing" —
 * have to be made on the product page, and they will eventually have to be made
 * wherever else a listing is summarised. Answering them in one hook is what keeps the
 * answer from being re-derived (and re-gotten-wrong) at each surface, and it gives a
 * component test one seam to mock instead of an `AuthProvider` and a `QueryClient`.
 *
 * ## This is presentation, not authorization
 *
 * Both answers come from the *session* user and a seller id the API already sent, and
 * neither is trusted by the server: `assertCanContactSeller` re-resolves the seller from
 * the product and answers 400 "You cannot message yourself" regardless of what the
 * browser believed. Hiding the button is a courtesy; the check that matters is
 * server-side and already exists.
 */
export function useMessageSellerGate(sellerId: number | undefined): MessageSellerGate {
  const { user } = useAuth();
  return {
    isGuest: !user,
    isOwnListing: !!user && sellerId !== undefined && user.id === sellerId,
  };
}

/* ---------------------------------- errors ---------------------------------- */

/**
 * A messaging error as a sentence.
 *
 * The server's messages here are written for the user and are the useful ones — "This
 * listing is not available for messages right now." says what to do next in a way no
 * client-side string would — so an `ApiError`'s message is passed straight through.
 */
export function messageErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Something went wrong. Please try again.";
}

export type { ConversationSummary, MessageRecord, StartConversationInput };