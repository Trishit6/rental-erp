import { useCallback, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { chatbotApi } from "./api";
import type { ChatProduct, ChatTurn } from "./types";

/** A rendered turn — assistant turns can carry listing cards and follow-ups. */
export type UiMessage = ChatTurn & {
  id: string;
  products?: ChatProduct[];
  suggestions?: string[];
};

export const CHAT_GREETING: UiMessage = {
  id: "greeting",
  role: "assistant",
  content:
    "Hi, I'm Loop — your Revaro assistant. Looking for something to rent or buy? Ask me anything about how the marketplace works.",
  suggestions: [
    "Find something to rent",
    "How does renting work?",
    "What is a security deposit?",
    "How do I sell something?",
  ],
};

let messageSeq = 0;
function nextId(prefix: string): string {
  messageSeq += 1;
  return `${prefix}-${Date.now()}-${messageSeq}`;
}

const FALLBACK_ERROR =
  "Sorry — I couldn't reach the assistant just now. Please try again in a moment.";

/**
 * Owns the assistant conversation. Kept local (not a shared query cache) because
 * the transcript is ephemeral UI state; only the reply comes from the server.
 */
export function useChatbot() {
  const [messages, setMessages] = useState<UiMessage[]>([CHAT_GREETING]);
  const [sendError, setSendError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (transcript: ChatTurn[]) => chatbotApi.send(transcript),
    onSuccess: (reply) => {
      setMessages((previous) => [
        ...previous,
        {
          id: nextId("assistant"),
          role: "assistant",
          content: reply.reply,
          products: reply.products,
          suggestions: reply.suggestions,
        },
      ]);
    },
    onError: () => {
      setSendError(FALLBACK_ERROR);
      setMessages((previous) => [
        ...previous,
        { id: nextId("error"), role: "assistant", content: FALLBACK_ERROR },
      ]);
    },
  });

  const { mutate } = mutation;

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;

      setSendError(null);
      const userMessage: UiMessage = { id: nextId("user"), role: "user", content: text };
      const next = [...messages, userMessage];
      setMessages(next);
      // Only role + content cross the wire; ids stay client-side.
      mutate(next.map(({ role, content }) => ({ role, content })));
    },
    [messages, mutate],
  );

  const reset = useCallback(() => {
    setSendError(null);
    setMessages([CHAT_GREETING]);
  }, []);

  /** Follow-ups offered under the newest assistant turn. */
  const suggestions = useMemo(() => {
    const last = messages[messages.length - 1];
    return last?.role === "assistant" ? (last.suggestions ?? []) : [];
  }, [messages]);

  return {
    messages,
    send,
    reset,
    isSending: mutation.isPending,
    sendError,
    suggestions,
  };
}

/** Shape returned by {@link useChatbot} — lifted to the widget so the transcript
 * survives closing and reopening the panel. */
export type ChatbotState = ReturnType<typeof useChatbot>;
