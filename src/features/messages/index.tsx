import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { EmptyState } from "@/components/shared/empty-state";
import { ConversationList } from "./components/ConversationList";
import { MessageThread } from "./components/MessageThread";
import { useConversations, useMessages, useSendMessage } from "./query";

export function DashboardMessagesPage() {
  const { user } = useAuth();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  const { data: conversations } = useConversations();
  const { data: messages } = useMessages(activeId);
  const { send } = useSendMessage();

  async function handleSend() {
    if (!activeId || !draft.trim()) return;
    await send(activeId, draft.trim());
    setDraft("");
  }

  return (
    <div className="page-wrap space-y-6 pb-10 pt-8">
      <h1 className="section-title text-3xl">Messages</h1>

      {!conversations?.length ? (
        <EmptyState
          icon={MessageCircle}
          title="No conversations yet"
          description="Use “Contact seller” on any product page to start chatting."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          <ConversationList
            conversations={conversations}
            activeId={activeId}
            onSelect={setActiveId}
          />

          {activeId && messages ? (
            <MessageThread
              messages={messages}
              currentUserId={user?.id}
              draft={draft}
              onDraftChange={setDraft}
              onSend={() => void handleSend()}
            />
          ) : (
            <div className="flex max-h-[520px] flex-1 items-center justify-center rounded-3xl bg-card p-10 text-sm text-muted-foreground">
              Choose a conversation to start chatting.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
