import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, X } from "lucide-react";
import { useChatbot } from "./query";
import { ChatPanel } from "./components/ChatPanel";

/**
 * Global floating assistant. Mounted once in the root layout so it's available on
 * every page.
 *
 * Positioning contract (kept deliberately explicit):
 *  - launcher: bottom-RIGHT (`bottom-5 right-5`) — the "assistant" corner;
 *  - GoToTop (`components/shared/GoToTop.tsx`) sits at `bottom-[104px] right-5`,
 *    stacked directly above this button, so the two never overlap;
 *  - the home page's FloatingActions dock also lives bottom-right but is a
 *    vertical column rising from the same corner with `z-40` — the launcher
 *    clears it because the dock ends ~76px above the corner, and the panel
 *    opens to the left of the corner on desktop rather than over the dock.
 */
export function Chatbot() {
  const [open, setOpen] = useState(false);
  const chatbot = useChatbot();

  // Escape closes the panel.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <AnimatePresence>
        {open && <ChatPanel chatbot={chatbot} onClose={() => setOpen(false)} />}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Close assistant" : "Open the Revaro assistant"}
        aria-expanded={open}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4, duration: 0.25, ease: "easeOut" }}
        whileHover={{ y: -3 }}
        whileTap={{ scale: 0.92 }}
        className="primary-button fixed bottom-5 right-5 z-50 flex size-14 items-center justify-center rounded-full text-primary-foreground sm:bottom-7 sm:right-7"
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
          <span className="absolute -right-0.5 -top-0.5 size-3.5 rounded-full bg-emerald-500 ring-2 ring-[var(--color-background)]" />
        )}
      </motion.button>
    </>
  );
}
