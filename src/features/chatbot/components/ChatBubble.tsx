import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { UiMessage } from "../query";
import { ChatProductCard } from "./ChatProductCard";

/** Typing indicator shown while a reply is in flight. */
export function TypingBubble() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-card/70 px-4 py-3 shadow-sm"
      aria-label="Loop is typing"
    >
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          className="size-1.5 rounded-full bg-primary/70"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: index * 0.15 }}
        />
      ))}
    </motion.div>
  );
}

export function ChatBubble({
  message,
  onSuggestionClick,
  onNavigate,
}: {
  message: UiMessage;
  onSuggestionClick: (text: string) => void;
  onNavigate: () => void;
}) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex flex-col gap-2", isUser ? "items-end" : "items-start")}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed",
          isUser
            ? "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md bg-card/70 text-foreground shadow-sm ring-1 ring-black/5",
        )}
      >
        {message.content}
      </motion.div>

      {!isUser && message.products && message.products.length > 0 && (
        <div className="flex w-full flex-col gap-2">
          {message.products.map((product) => (
            <ChatProductCard key={product.id} product={product} onNavigate={onNavigate} />
          ))}
        </div>
      )}

      {!isUser && message.suggestions && message.suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {message.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onSuggestionClick(suggestion)}
              className="soft-button inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold text-foreground transition hover:text-primary"
            >
              <Sparkles size={11} className="text-primary" />
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
