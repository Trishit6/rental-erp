import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUp } from "lucide-react";

/** Appears after this much scrolling. */
const SCROLL_THRESHOLD = 480;

/**
 * The global "Go to top" button.
 *
 * Bottom-right, stacked *above* the chatbot launcher so the two can never
 * overlap (see `Chatbot`'s positioning comment). Hidden near the top of the
 * page, appears after ~500px, smooth-scrolls, and honours reduced motion.
 */
export function GoToTop() {
  const [visible, setVisible] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > SCROLL_THRESHOLD);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          onClick={scrollToTop}
          aria-label="Go to top of page"
          initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: 12, scale: 0.9 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.94 }}
          className="soft-button fixed bottom-[104px] right-5 z-40 flex size-12 flex-col items-center justify-center gap-0.5 rounded-full text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:bottom-[112px] sm:right-7"
        >
          <ArrowUp size={16} aria-hidden />
          <span className="text-[9px] font-bold leading-none">Top</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
