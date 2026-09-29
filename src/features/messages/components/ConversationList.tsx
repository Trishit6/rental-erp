import type { ConversationItem } from "@/lib/types";
import { Card } from "@/components/ui/card";

export function ConversationList({
  conversations,
  activeId,
  onSelect,
}: {
  conversations: ConversationItem[];
  activeId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <Card className="max-h-[520px] overflow-y-auto p-2">
      {conversations.map((conversation) => (
        <button
          key={conversation.conversationId}
          type="button"
          onClick={() => onSelect(conversation.conversationId)}
          className={`block w-full rounded-2xl p-3 text-left transition ${
            activeId === conversation.conversationId ? "inset-surface" : "hover:bg-primary/5"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-extrabold">
              {conversation.otherUser?.name ?? "Unknown"}
            </span>
            {conversation.unread > 0 && (
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {conversation.unread}
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {conversation.productTitle ?? "Direct message"}
          </p>
        </button>
      ))}
    </Card>
  );
}
