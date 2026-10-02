import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { MessageCircle, X } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { FloatingSlotContent } from "@/lib/floating/rail";
import { useChatbot } from "./query";
import { ChatPanel } from "./components/ChatPanel";

/**
 * Global floating assistant. Mounted once in the root layout so it's available on
 * every page.
 *
 * Positioning is no longer this component's business: it claims the `chat` slot
 * of the shared floating rail (bottom-right, the lowest control), and the rail
 * publishes its own height so the chat panel can clear it. The launcher used to
 * hard-code `bottom-5 right-5` — the exact corner the home dock also used, which
 * is why the two sat on top of each other on the home page.
 */
export function Chatbot() {
  const [open, setOpen] = useState(false);
  const chatbot = useChatbot();
  const reduceMotion = useReducedMotion();

  // Escape closes the panel.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const launcher = (
    <Tooltip label="Revaro assistant" side="left">
      <motion.button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Close Revaro assistant" : "Open Revaro assistant"}
        aria-expanded={open}
        initial={reduceMotion ? false : { opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4, duration: 0.25, ease: "easeOut" }}
        whileHover={{ y: -3 }}
        whileTap={{ scale: 0.92 }}
        className="primary-button relative flex size-14 items-center justify-center rounded-full text-primary-foreground"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={open ? "close" : "chat"}
            initial={{ opacity: 0, rotate: -45 }}
            animate={{ opacity: 1, rotate: 0 }}
            exit={{ opacity: 0, rotate: 45 }}
            transition={{ duration: 0.15 }}
          >
            {open ? <X size={22} /> : <MessageCircle size={22} />}
          </motion.span>
        </AnimatePresence>
        {!open && (
          // The availability dot. Inset onto the button and ringed in the page
          // background so it reads as attached to the launcher rather than
          // floating above it, and marked decorative — the launcher's label
          // already carries the meaning for assistive tech.
          <span
            className="absolute right-1 top-1 size-3 rounded-full bg-emerald-500 ring-2 ring-[var(--color-background)]"
            aria-hidden
          />
        )}
      </motion.button>
    </Tooltip>
  );

  return (
    <>
      <AnimatePresence>
        {open && <ChatPanel chatbot={chatbot} onClose={() => setOpen(false)} />}
      </AnimatePresence>

      <FloatingSlotContent slot="chat">{launcher}</FloatingSlotContent>
    </>
  );
}