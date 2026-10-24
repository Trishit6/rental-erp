/**
 * U4 effect 02 — word rotator.
 *
 * framer-motion is mocked (plain spans, motion props survive as attributes).
 * The shared loop hook is mocked to always grant "running" so the scheduling
 * clock can be driven deterministically with fake timers; the hook's own
 * rules (in view, visible document, not hovered, two-loop cap) have their
 * tests in the infra suites.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";

vi.mock("framer-motion", () => ({
  motion: {
    p: ({ children, "data-marker": marker, ...rest }: Record<string, unknown> & { children?: React.ReactNode }) => (
      <p data-marker={marker ?? "motion"} {...rest}>{children}</p>
    ),
  },
  useReducedMotion: () => REDUCED.current,
}));

vi.mock("@/lib/motion/useVisibleLoop", () => ({
  useVisibleLoop: vi.fn(() => LOOP_RUNNING.current),
}));

const REDUCED = { current: false };
const LOOP_RUNNING = { current: true };

import {
  ROTATOR_INTERVAL_MS,
  ROTATOR_PHRASES,
  WordRotator,
  compactRotatorLine,
  nextRotatorIndex,
} from "@/components/motion-effects/word-rotator";

beforeEach(() => {
  vi.useFakeTimers();
  REDUCED.current = false;
  LOOP_RUNNING.current = true;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("pure rotation", () => {
  it("advances and wraps", () => {
    expect(nextRotatorIndex(0, 4)).toBe(1);
    expect(nextRotatorIndex(3, 4)).toBe(0);
    expect(nextRotatorIndex(0, 0)).toBe(0);
  });

  // The component adds the final period when it renders the fallback line.
  it("the compact line is the four verbs", () => {
    expect(compactRotatorLine()).toBe("Rent. Buy. Sell. Reuse");
  });
});

/* All four phrases are stacked in one grid cell and mirrored in the sr-only
 * list, so a bare getByText matches five elements; the grid copy is always
 * the one carrying data-active ("true" for the visible phrase). */
const gridPhrase = (phrase: string) => screen.getByText(phrase, { selector: "p[data-active]" });
const queryActive = (phrase: string) =>
  screen.queryByText(phrase, { selector: 'p[data-active="true"]' });
const expectActive = (phrase: string) => expect(queryActive(phrase)).toBeInTheDocument();

describe("scheduling", () => {
  it("advances every 2800 ms while running and not paused", () => {
    render(
      <div>
        <WordRotator testId="rotator" />
      </div>,
    );
    expect(queryActive(ROTATOR_PHRASES[1])).toBeNull();
    expect(gridPhrase(ROTATOR_PHRASES[0]).getAttribute("data-active")).toBe("true");
    act(() => {
      vi.advanceTimersByTime(ROTATOR_INTERVAL_MS + 1);
    });
    expectActive(ROTATOR_PHRASES[1]);
    expect(gridPhrase(ROTATOR_PHRASES[0]).getAttribute("data-active")).toBe("false");
  });

  it("does not advance while the loop gate is closed (off-screen, hidden tab, or hovered)", () => {
    LOOP_RUNNING.current = false;
    render(
      <div>
        <WordRotator testId="rotator" />
      </div>,
    );
    act(() => {
      vi.advanceTimersByTime(ROTATOR_INTERVAL_MS * 3);
    });
    expect(queryActive(ROTATOR_PHRASES[1])).toBeNull();
  });

  it("pauses and resumes through the play/pause control", () => {
    render(
      <div>
        <WordRotator testId="rotator" />
      </div>,
    );
    const button = screen.getByRole("button", { name: "Pause rotating promise" });
    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    act(() => {
      vi.advanceTimersByTime(ROTATOR_INTERVAL_MS * 2);
    });
    expect(queryActive(ROTATOR_PHRASES[1])).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Play rotating promise" }));
    act(() => {
      vi.advanceTimersByTime(ROTATOR_INTERVAL_MS + 1);
    });
    expectActive(ROTATOR_PHRASES[1]);
  });
});

describe("a11y and fallbacks", () => {
  it("announces all four phrases statically, once, via the sr-only list", () => {
    render(
      <div>
        <WordRotator />
      </div>,
    );
    const list = document.querySelector<HTMLUListElement>("ul.sr-only");
    expect(list).not.toBeNull();
    // The sr-only list is NOT a live region — a screen reader reads it once.
    expect(list.getAttribute("aria-live")).toBeNull();
    for (const phrase of ROTATOR_PHRASES) {
      expect(screen.getByText(phrase, { selector: ".sr-only li" })).toBeInTheDocument();
    }
  });

  it("reduced motion: promise one plus the visible compact line, no rotation", () => {
    REDUCED.current = true;
    render(
      <div>
        <WordRotator testId="rotator" />
      </div>,
    );
    // Only phrase one renders in the grid (fallback, no stack).
    expect(document.querySelectorAll("p[data-active]")).toHaveLength(1);
    expect(gridPhrase(ROTATOR_PHRASES[0]).getAttribute("data-active")).toBe("true");
    expect(screen.getByTestId("rotator-compact").textContent).toBe("Rent. Buy. Sell. Reuse.");
    expect(screen.queryByRole("button")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(ROTATOR_INTERVAL_MS * 2);
    });
    // Still promise one — no timers even ran.
    expect(gridPhrase(ROTATOR_PHRASES[0]).getAttribute("data-active")).toBe("true");
  });
});
