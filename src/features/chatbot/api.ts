import { api } from "@/lib/api/client";
import type { ChatReply, ChatTurn } from "./types";

/** Send the transcript (role + content only — client ids stay local). */
export const chatbotApi = {
  send: async (messages: ChatTurn[]): Promise<ChatReply> => {
    const result = await api.post<ChatReply>("/chat", { messages });
    return result.data;
  },
};
