import { useEffect, useRef } from "react";
import { Send } from "lucide-react";
import type { MessageItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function MessageThread({
  messages,
  currentUserId,
  draft,
  onDraftChange,
  onSend,
}: {
  messages: MessageItem[];
  currentUserId?: number;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
}) {
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages]);

  return (
    <Card className="flex max-h-[520px] flex-col p-0">
      <div ref={threadRef} className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${
              message.senderId === currentUserId
                ? "primary-button ml-auto text-primary-foreground"
                : "inset-surface"
            }`}
          >
            {message.body}
            <span className="mt-0.5 block text-[10px] opacity-70">
              {new Date(message.createdAt).toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-2 border-t border-border/60 p-3">
        <input
          className="inset-surface h-11 flex-1 rounded-full px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          placeholder="Type a message..."
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSend();
          }}
        />
        <Button size="icon" aria-label="Send message" onClick={onSend}>
          <Send size={16} />
        </Button>
      </div>
    </Card>
  );
}
