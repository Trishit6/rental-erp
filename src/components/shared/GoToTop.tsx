import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUp } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { FloatingSlotContent } from "@/lib/floating/rail";

/** Appears after this much scrolling. */
const SCROLL_THRESHOLD = 480;

/**
 * The global "go to top" button.
 *
 * It claims the `top` slot of the shared floating rail, so it stacks with the
 * rest of the bottom-right controls instead of claiming a pixel offset of its
 * own — `bottom-[104px]` had to be hand-recomputed whenever the assistant
 * launcher changed size.
 *
 * Hidden until the page has actually scrolled, and the label lives in a tooltip
 * rather than inside the button: it used to be permanently-rendered text under
 * the arrow, which occupied the button's own space and competed with the
 * controls stacked above it.
 *
 * `inRail` outlives `visible` by one exit animation. Releasing the slot on the
 * same commit that hides the button would tear the button out of the DOM and skip
 * the exit animation; holding the slot until `onExitComplete` also means the rail
 * closes the gap afterwards instead of leaving a hole in the column.
 */
export function GoToTop() {
  const [visible, setVisible] = useState(false);
  const [lingering, setLingering] = useState(false);
  const [wasVisible, setWasVisible] = useState(false);
  const reduceMotion = useReducedMotion();

  // Render-phase adjustment, not an effect: the moment visibility drops, the slot
  // has to start being held rather than released, and doing it during render
  // costs one render instead of an extra commit.
  if (wasVisible !== visible) {
    setWasVisible(visible);
    if (wasVisible && !visible) setLingering(true);
  }

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

  const button = (
    <Tooltip label="Back to top" side="left">
      <motion.button
        type="button"
        onClick={scrollToTop}
        aria-label="Scroll to top of page"
        initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduceMotion ? undefined : { opacity: 0, y: 12, scale: 0.9 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        whileHover={{ y: -3 }}
        whileTap={{ scale: 0.94 }}
        className="soft-button flex size-12 items-center justify-center rounded-full text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ArrowUp size={18} aria-hidden />
      </motion.button>
    </Tooltip>
  );

  return (
    <FloatingSlotContent slot="top" active={visible || lingering}>
      <AnimatePresence onExitComplete={() => setLingering(false)}>
        {visible && button}
      </AnimatePresence>
    </FloatingSlotContent>
  );
}
