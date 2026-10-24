/**
 * U4 effect 02 — word rotator (hero subline).
 *
 * Four Revaro promises rotate in the hero's subline: nothing about the copy
 * is invented (they are the marketplace's actual verbs), and nothing about
 * the layout can shift: all four phrases are stacked in the same CSS grid
 * cell (`grid-area: 1 / 1`), so the box is always as wide and tall as the
 * widest/tallest phrase — the swap cross-fades in place (opacity plus an
 * 8px vertical move), never a reflow.
 *
 * Scheduling: one advance per 2800 ms, driven by the shared loop hook, so a
 * rotation tick can only fire while the element is in view, the document is
 * visible and it is not hovered/focused; the page-wide two-loop cap applies
 * (rotator versus the review deck — `useVisibleLoop`). The play/pause
 * button is a control, not a decoration: auto-advance is content a visitor
 * may want to stop, and a visible pause state is the a11y contract.
 *
 * A11y: the moving phrases are `aria-hidden`; the sr-only list announces
 * all four sentences once, statically — no live region, so a screen reader
 * is never pinged every 2.8 seconds. Reduced motion shows promise one plus
 * the visible compact line "Rent. Buy. Sell. Reuse.".
 *
 * Kill switch: the `fx.wordRotator` flag — off renders promise one, static.
 */

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { isFxEnabled } from "@/lib/motion/flags";
import { useVisibleLoop } from "@/lib/motion/useVisibleLoop";

export const ROTATOR_INTERVAL_MS = 2800;

/** The four promises — Revaro's own verbs, each a complete sentence. */
export const ROTATOR_PHRASES = [
  "Rent what you need today.",
  "Buy what you love.",
  "Sell what you do not use.",
  "Reuse so nothing is wasted.",
] as const;

/** Pure rotation: which phrase comes next (wraps to 0 after the last). */
export function nextRotatorIndex(current: number, length: number): number {
  return length > 0 ? (current + 1) % length : 0;
}

/** The compact line the reduced-motion fallback shows. */
export function compactRotatorLine(): string {
  return ROTATOR_PHRASES.map((phrase) => {
    const [first] = phrase.split(" ");
    return first?.replace(/\.$/, "") ?? phrase;
  }).join(". ");
}

export function WordRotator({ loopId = "word-rotator", testId }: { loopId?: string; testId?: string }) {
  const prefersReducedMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const manuallyPausedRef = useRef(manuallyPaused);
  // Written in an effect, not during render (react-hooks/refs-in-render).
  useEffect(() => {
    manuallyPausedRef.current = manuallyPaused;
  }, [manuallyPaused]);

  const animating = isFxEnabled("fx.wordRotator") && !prefersReducedMotion;

  // The shared pause engine: running ⇔ in view ∧ visible document ∧ not
  // hovered/focused ∧ within the page's two-loop cap. No ticks otherwise.
  const loopRef = useRef<HTMLDivElement>(null);
  const loopRunning = useVisibleLoop(loopRef, { pauseOnHover: true, loopId });

  useEffect(() => {
    if (!animating || !loopRunning) return;
    const timer = window.setInterval(() => {
      if (manuallyPausedRef.current) return;
      setIndex((current) => nextRotatorIndex(current, ROTATOR_PHRASES.length));
    }, ROTATOR_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [animating, loopRunning]);

  const compact = compactRotatorLine();
  const accentCompact = animating; // the visible compact line is the fallback state only

  return (
    <div ref={loopRef} data-testid={testId} className="min-w-0">
      <div className="grid" aria-hidden="true">
        {(animating ? ROTATOR_PHRASES : [ROTATOR_PHRASES[0]]).map((phrase, phraseIndex) => {
          // With animation off, phrase one renders alone and fully visible.
          const isActive = !animating || phraseIndex === index;
          return (
            <motion.p
              key={phrase}
              data-active={isActive}
              initial={animating ? { opacity: isActive ? 1 : 0, y: isActive ? 0 : 8 } : false}
              animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : 8 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="pointer-events-none text-base leading-relaxed text-muted-foreground [grid-area:1/1]"
            >
              {phrase}
            </motion.p>
          );
        })}
      </div>

      {!accentCompact ? (
        <p className="mt-0.5 text-sm font-bold text-muted-foreground" data-testid={`${testId ?? "rotator"}-compact`}>
          {compact}.
        </p>
      ) : null}

      {/* Screen readers read all four once, statically, regardless of motion. */}
      <ul className="sr-only">
        {ROTATOR_PHRASES.map((phrase) => (
          <li key={phrase}>{phrase}</li>
        ))}
      </ul>

      {/* Pause/play: a real control for auto-advancing content. 44px target. */}
      {animating ? (
        <button
          type="button"
          aria-pressed={manuallyPaused}
          aria-label={manuallyPaused ? "Play rotating promise" : "Pause rotating promise"}
          onClick={() => setManuallyPaused((paused) => !paused)}
          className="mt-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          {manuallyPaused ? <Play size={15} aria-hidden /> : <Pause size={15} aria-hidden />}
        </button>
      ) : null}
    </div>
  );
}
