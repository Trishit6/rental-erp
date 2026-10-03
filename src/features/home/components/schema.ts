import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

/**
 * The hero's dynamic content — logic only, no rendering.
 *
 * Four marketplace scenarios rotate with a gentle timer; the customer can also
 * step manually (prev/next, dots, swipe). The timer pauses while the pointer is
 * over the hero and honours `prefers-reduced-motion` by never auto-advancing.
 *
 * Kept as a plain hook (not inside the component tree) so the slide maths is
 * unit-testable without rendering anything.
 */

/**
 * What the hero search box is allowed to submit.
 *
 * A blank box navigates nowhere — submitting "   " would send the customer to
 * Browse with an empty query. The 120-character ceiling matches
 * `validateQSearch` in `src/lib/browse-search.ts`, so a hero query and a
 * hand-typed URL cannot disagree about how long a search may be.
 */
export const HERO_SEARCH_MAX = 120;

export const heroSearchSchema = z.object({
  q: z.string().trim().min(1).max(HERO_SEARCH_MAX, "That search is too long."),
});

export type HeroSlide = {
  id: string;
  /** First line — kept in the hero's existing typographic voice. */
  headingA: string;
  /** Second line, accent-coloured (as the current hero does). */
  headingB: string;
  /** Supporting sentence. */
  body: string;
  image: string;
  imageAlt: string;
  /** Small caption card over the image. */
  captionLabel: string;
  captionTitle: string;
};

export const HERO_SLIDES: HeroSlide[] = [
  {
    id: "rent-weekend",
    headingA: "Rent it for the weekend.",
    headingB: "Own it for life.",
    body: "Rent what you need, buy pre-loved, and give your own things a second life — all with neighbours nearby.",
    image:
      "https://images.unsplash.com/photo-1502920917128-1aa500764cbd?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Premium camera gear laid out for a weekend trip",
    captionLabel: "A neighbour's favourite",
    captionTitle: "Rent from ₹180/day",
  },
  {
    id: "buy-better",
    headingA: "Buy better.",
    headingB: "Reuse smarter.",
    body: "Pre-loved electronics, furniture and fashion — inspected, fairly priced and ready for a second home.",
    image:
      "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "A well-kept laptop on a desk, ready for a new owner",
    captionLabel: "Pre-loved & verified",
    captionTitle: "Save up to 60% vs new",
  },
  {
    id: "sell-what-you-dont-need",
    headingA: "Sell what you no longer need.",
    headingB: "Earn from it.",
    body: "List an item in minutes. We handle discovery, chat and secure payments so you don't have to.",
    image:
      "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "A tidy living room with a sofa being prepared for sale",
    captionLabel: "Selling made simple",
    captionTitle: "List in under 5 minutes",
  },
  {
    id: "one-marketplace",
    headingA: "One marketplace.",
    headingB: "More ways to own.",
    body: "Rent it, buy it, or rent-toward-owning it — every listing can work the way your wallet wants.",
    image:
      "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "A colourful mix of marketplace products on shelves",
    captionLabel: "Rent · Buy · Sell",
    captionTitle: "Thousands of items nearby",
  },
];

const AUTO_ADVANCE_MS = 6_000;

/**
 * Slide rotation controller. Returns the state and handlers the view binds to.
 * `paused` is true while the pointer is over the hero (or the tab is hidden).
 */
export function useHeroSlides(
  count: number,
  /** `null` is accepted because `useReducedMotion()` reports `boolean | null`. */
  prefersReducedMotion: boolean | null,
): {
  index: number;
  next: () => void;
  previous: () => void;
  goTo: (index: number) => void;
  paused: boolean;
  setPaused: (value: boolean) => void;
} {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<number | null>(null);

  const goTo = useCallback(
    (target: number) => {
      setIndex(() => ((target % count) + count) % count);
    },
    [count],
  );
  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const previous = useCallback(() => goTo(index - 1), [goTo, index]);

  useEffect(() => {
    if (prefersReducedMotion || paused || count < 2) return;
    timerRef.current = window.setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, AUTO_ADVANCE_MS);
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [prefersReducedMotion, paused, count]);

  return { index, next, previous, goTo, paused, setPaused };
}

/** Swipe handling for touch screens. Returns handlers for the slide container. */
export function useHeroSwipe(
  onNext: () => void,
  onPrevious: () => void,
): {
  onTouchStart: (event: React.TouchEvent) => void;
  onTouchEnd: (event: React.TouchEvent) => void;
} {
  const startX = useRef<number | null>(null);

  return {
    onTouchStart: (event) => {
      startX.current = event.touches[0]?.clientX ?? null;
    },
    onTouchEnd: (event) => {
      if (startX.current === null) return;
      const endX = event.changedTouches[0]?.clientX ?? startX.current;
      const delta = endX - startX.current;
      startX.current = null;
      if (Math.abs(delta) < 40) return; // a tap, not a swipe
      if (delta < 0) onNext();
      else onPrevious();
    },
  };
}

/* --------------------------- category accents ------------------------------ */

/**
 * Per-slug accent colours for the home category buttons.
 *
 * Values come from the theme's warm palette (burnt orange / olive / brown) and
 * are applied as soft *tints*, never as new hues — the Revaro look stays one
 * system. An unknown slug degrades to the shared primary tint.
 */
export const CATEGORY_ACCENTS: Record<string, { tint: string; text: string }> = {
  electronics: { tint: "rgba(201,123,74,0.14)", text: "var(--color-primary)" },
  furniture: { tint: "rgba(107,124,90,0.16)", text: "#5f7350" },
  home: { tint: "rgba(146,111,75,0.16)", text: "#8a6a45" },
  fashion: { tint: "rgba(176,110,110,0.15)", text: "#a05f5f" },
  gaming: { tint: "rgba(122,110,170,0.15)", text: "#6f61a3" },
  sports: { tint: "rgba(96,125,109,0.16)", text: "#55745f" },
  music: { tint: "rgba(150,120,60,0.15)", text: "#8a7136" },
  tools: { tint: "rgba(120,120,120,0.14)", text: "var(--color-muted-foreground)" },
  vehicles: { tint: "rgba(110,130,150,0.16)", text: "#5c7387" },
};

/** The accent for a slug, with a safe fallback for unknown categories. */
export function categoryAccent(slug: string): { tint: string; text: string } {
  return CATEGORY_ACCENTS[slug] ?? { tint: "rgba(201,123,74,0.12)", text: "var(--color-primary)" };
}
