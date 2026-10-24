/**
 * U4 effect 01 — hero word reveal.
 *
 * framer-motion is mocked the same way the search-box suites do it (plain
 * spans whose motion props survive as attributes), so "which words animate"
 * is a DOM fact, not an implementation detail.
 */
import { describe, beforeEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const REDUCED = { current: false };

vi.mock("framer-motion", () => ({
  motion: {
    span: ({ children, "data-motion-marker": marker, ...rest }: Record<string, unknown> & { children?: React.ReactNode }) => (
      <span data-motion-marker={marker ?? "motion"}>{children}</span>
    ),
  },
  useReducedMotion: () => REDUCED.current,
}));

import {
  ACCENT_CLASS,
  HeroWordReveal,
  WORD_DURATION_MS,
  WORD_STAGGER_MS,
  joinHeadlineText,
  markRevealedForTesting,
  planWords,
} from "@/components/motion-effects/hero-word-reveal";

beforeEach(() => {
  REDUCED.current = false;
  markRevealedForTesting(false);
});

describe("word plan", () => {
  it("staggers words 70 ms apart and keeps the whole reveal under budget", () => {
    const words = planWords("Share what you own", "beautifully");
    expect(words[0].delayMs).toBe(0);
    expect(words[1].delayMs).toBe(WORD_STAGGER_MS);
    expect(words[2].delayMs).toBe(2 * WORD_STAGGER_MS);
    const last = words[words.length - 1];
    expect(last.delayMs + WORD_DURATION_MS).toBeLessThan(700);
    expect(last.delayMs).toBeLessThanOrEqual(700 - WORD_DURATION_MS);
  });

  it("caps the delay for absurdly long headlines", () => {
    const words = planWords(
      "one two three four five six seven eight nine ten eleven twelve twenty-word finale",
      undefined,
    );
    for (const word of words) {
      expect(word.delayMs + WORD_DURATION_MS).toBeLessThan(700);
    }
  });

  it("marks the tail words as accent so the two-tone survives the split", () => {
    const words = planWords("Share what", "you own");
    expect(words.slice(0, 2).every((w) => !w.accent)).toBe(true);
    expect(words.slice(2).every((w) => w.accent)).toBe(true);
    expect(ACCENT_CLASS.startsWith("text-")).toBe(true);
  });

  it("treats the first word as the lead — it must never animate", () => {
    expect(planWords("Neighbours", "share more")[0].isLead).toBe(true);
  });

  it("the announced text is the joined headline, once, with single spaces", () => {
    expect(joinHeadlineText("Share what", "you own")).toBe("Share what you own");
    expect(joinHeadlineText("Share", undefined)).toBe("Share");
    expect(joinHeadlineText("Share", "  ")).toBe("Share");
  });
});

describe("rendered words", () => {
  it("on the first hero paint of a session: lead word static, the rest animate", () => {
    render(
      <h1 aria-label={joinHeadlineText("Share what", "you own")}>
        <HeroWordReveal headingA="Share what" headingB="you own" testId="hero-word-reveal" />
      </h1>,
    );
    const spans = screen.getByTestId("hero-word-reveal").querySelectorAll("span[data-motion-marker]");
    expect(spans).toHaveLength(3); // words 2..4
    // The wrapper hides everything from AT; the h1 announce holds full text.
    expect(screen.getByTestId("hero-word-reveal")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("hero-word-reveal").textContent).toBe("Share what you own");
    expect(screen.getByRole("heading")).toHaveAttribute("aria-label", "Share what you own");
  });

  it("after the reveal played once, every later headline is fully static", () => {
    markRevealedForTesting(true);
    render(
      <h1 aria-label="Share what you own">
        <HeroWordReveal headingA="Share what" headingB="you own" testId="hero-word-reveal" />
      </h1>,
    );
    expect(screen.getByTestId("hero-word-reveal").querySelectorAll("span[data-motion-marker]")).toHaveLength(0);
  });

  it("reduced motion renders the complete headline with zero animation", () => {
    REDUCED.current = true;
    render(
      <h1 aria-label="Share what you own">
        <HeroWordReveal headingA="Share what" headingB="you own" testId="hero-word-reveal" />
      </h1>,
    );
    expect(screen.getByTestId("hero-word-reveal").querySelectorAll("span[data-motion-marker]")).toHaveLength(0);
    expect(screen.getByTestId("hero-word-reveal").textContent).toBe("Share what you own");
  });
});
