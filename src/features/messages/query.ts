import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import type { ConversationItem, MessageItem } from "@/lib/types";

export function useConversations() {
  return useQuery({
    queryKey: queryKeys.conversations,
    queryFn: async () => (await api.get<ConversationItem[]>("/conversations")).data,
    refetchInterval: 15_000,
  });
}

export function useMessages(conversationId: number | null) {
  return useQuery({
    queryKey: queryKeys.conversation(conversationId ?? 0),
    queryFn: async () =>
      (await api.get<MessageItem[]>(`/conversations/${conversationId}/messages`)).data,
    enabled: !!conversationId,
    refetchInterval: 10_000,
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return {
    send: async (conversationId: number, body: string) => {
      await api.post(`/conversations/${conversationId}/messages`, { body });
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversation(conversationId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  };
}
