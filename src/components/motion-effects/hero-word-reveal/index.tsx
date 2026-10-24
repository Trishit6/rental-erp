/**
 * U4 effect 01 — hero word reveal.
 *
 * The homepage h1's headline enters word by word: each word fades in and
 * rises 12px on its own 70 ms cue, the whole reveal finishing well under
 * 700 ms. What it is not, and must never become:
 *
 *  - **Not an LCP gamble.** The first word renders fully visible from the
 *    first commit (no open animation on it) so the headline is painted the
 *    moment HTML+CSS land, even with JS still parsing. Every other word
 *    animates `opacity` and `transform` only, and the words are real,
 *    in-flow layout from the first paint — a 2-line wrap at 360px reserves
 *    its final layout, CLS stays at zero.
 *
 *  - **Not a repeat offender.** One module-level flag per page session: the
 *    reveal plays on the first hero paint and never again. Slide *changes*
 *    cross-fade the whole h1 (the hero's existing swap); the word stagger
 *    does not replay on a returning navigation.
 *
 * A11y: the *host* owns the announcement — it puts the full headline in the
 * h1's `aria-label`; everything inside is `aria-hidden`. Reduced motion (OS
 * setting or the in-app toggle via MotionProvider) renders the complete
 * headline statically.
 *
 * Kill switch: the `fx.heroReveal` flag key (`@/lib/motion/flags`).
 */

import { motion, useReducedMotion } from "framer-motion";
import { useEffect } from "react";
import { isFxEnabled } from "@/lib/motion/flags";

/** Module-level session marker — survives client-side navigation by design. */
let revealedThisSession = false;

/** Test seam: pretend the reveal already played (or not) this session. */
export function markRevealedForTesting(value: boolean) {
  revealedThisSession = value;
}

export const WORD_STAGGER_MS = 70;
export const WORD_DURATION_MS = 280;
const REVEAL_BUDGET_MS = 700;

/** The text a screen reader should announce for the headline. */
export function joinHeadlineText(headingA: string, headingB: string | undefined): string {
  return [headingA, headingB]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ");
}

export type PlannedWord = {
  word: string;
  accent: boolean;
  index: number;
  delayMs: number;
  isLead: boolean;
};

/** Per-word cues: 70 ms apart, capped so even a long headline stays < 700 ms. */
export function planWords(headingA: string, headingB: string | undefined): PlannedWord[] {
  const words: { word: string; accent: boolean }[] = [
    ...splitWords(headingA).map((word) => ({ word, accent: false })),
    ...splitWords(headingB ?? "").map((word) => ({ word, accent: true })),
  ];
  return words.map(({ word, accent }, index) => {
    const raw = index * WORD_STAGGER_MS;
    // The cap leaves one stagger's worth of headroom so the last word settles
    // before the budget expires.
    return {
      word,
      accent,
      index,
      delayMs: Math.min(raw, REVEAL_BUDGET_MS - WORD_DURATION_MS - WORD_STAGGER_MS),
      isLead: index === 0,
    };
  });
}

function splitWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

export function HeroWordReveal({
  headingA,
  headingB,
  accentClass = ACCENT_CLASS,
  testId,
}: {
  headingA: string;
  headingB?: string;
  /** The highlight token for the tail words; hosts may pin their existing one. */
  accentClass?: string;
  testId?: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  const enabled = isFxEnabled("fx.heroReveal") && !prefersReducedMotion && !revealedThisSession;
  const words = planWords(headingA, headingB);

  // The reveal happened — mark it so later navigations render the headline
  // complete. Keyed on the headline so a slide change re-runs the effect.
  useEffect(() => {
    if (enabled) revealedThisSession = true;
  }, [enabled, headingA, headingB]);

  return (
    <span data-testid={testId} aria-hidden="true">
      {words.map(({ word, accent, delayMs, isLead }, index) => (
        // Fragment, not a wrapper span on the word itself: the space between
        // fragments is normal inline text, so spacing and wrapping match a
        // plain rendered headline exactly.
        <span key={`${index}-${word}`}>
          {enabled && !isLead ? (
            <motion.span
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: WORD_DURATION_MS / 1000, delay: delayMs / 1000, ease: "easeOut" }}
              className={accent ? accentClass : undefined}
            >
              {word}
            </motion.span>
          ) : (
            <span className={accent ? accentClass : undefined}>{word}</span>
          )}
          {index < words.length - 1 ? " " : undefined}
        </span>
      ))}
    </span>
  );
}
/** The hero's accent colour for the tail words — token-driven, never a gradient. */
export const ACCENT_CLASS = "text-accent";
