import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { RotateCcw, Send, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { ChatbotState } from "../query";
import { ChatBubble, TypingBubble } from "./ChatBubble";

export function ChatPanel({ chatbot, onClose }: { chatbot: ChatbotState; onClose: () => void }) {
  const { messages, send, reset, isSending, suggestions } = chatbot;
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages.length, isSending]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit(text: string) {
    if (isSending) return;
    const value = text.trim();
    if (!value) return;
    send(value);
    setDraft("");
  }

  return (
    <motion.section
      role="dialog"
      aria-label="Revaro assistant"
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 24, scale: 0.97 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      /* Mobile: a bottom sheet that never covers the whole viewport. From `sm`
         up it docks beside the rail and clears it via `--floating-rail-height`
         (see `.chat-panel` in `styles.css`), so it cannot cover the launcher or
         any other floating control. */
      className="chat-panel raised-surface flex h-[min(560px,72dvh)] flex-col overflow-hidden rounded-[26px]"
    >
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-[var(--divider)] px-4 py-3">
        <span className="primary-button flex size-9 shrink-0 items-center justify-center rounded-full text-primary-foreground">
          <Sparkles size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-sm font-extrabold leading-none">Loop</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
            Revaro assistant
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          aria-label="Start a new conversation"
          title="New chat"
          className="soft-button flex size-8 items-center justify-center rounded-full text-muted-foreground transition hover:text-primary"
        >
          <RotateCcw size={14} />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close assistant"
          className="soft-button flex size-8 items-center justify-center rounded-full text-muted-foreground transition hover:text-primary"
        >
          <X size={15} />
        </button>
      </header>

      {/* Transcript */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-3.5 overflow-y-auto px-4 py-4 [scrollbar-width:thin]"
      >
        {messages.map((message) => (
          <ChatBubble
            key={message.id}
            message={message}
            onSuggestionClick={submit}
            onNavigate={onClose}
          />
        ))}
        {isSending && <TypingBubble />}
      </div>

      {/* Follow-up suggestions for the latest turn */}
      {!isSending && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {suggestions.slice(0, 3).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => submit(suggestion)}
              className="inset-surface rounded-full px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition hover:text-primary"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(draft);
        }}
        className="flex items-end gap-2 border-t border-[var(--divider)] p-3"
      >
        <textarea
          ref={inputRef}
          value={draft}
          rows={1}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit(draft);
            }
          }}
          placeholder="Ask about renting, buying or selling…"
          aria-label="Message the assistant"
          className="inset-surface max-h-28 min-h-11 flex-1 resize-none rounded-2xl px-3.5 py-3 text-[13px] outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-primary/40"
        />
        <button
          type="submit"
          disabled={!draft.trim() || isSending}
          aria-label="Send message"
          className={cn(
            "primary-button flex size-11 shrink-0 items-center justify-center rounded-full text-primary-foreground",
            (!draft.trim() || isSending) && "cursor-not-allowed opacity-50",
          )}
        >
          <Send size={16} />
        </button>
      </form>
    </motion.section>
  );
}
