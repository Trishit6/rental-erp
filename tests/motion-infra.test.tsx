/**
 * Shared U4 motion infrastructure: fx.* kill-switch constants, the page-wide
 * loop cap, the reduce-animations preference and the near-viewport lazy mount.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { FX_FLAGS, isFxEnabled, type FxFlagKey } from "@/lib/motion/flags";
import { pickRunningLoops } from "@/lib/motion/loop-capacity";
import { setReduceAnimations, useReduceAnimations } from "@/lib/motion/reduce-preference";
import { MountWhenNear } from "@/lib/motion/MountWhenNear";

const EXPECTED_FLAGS: FxFlagKey[] = [
  "fx.heroReveal",
  "fx.wordRotator",
  "fx.salePings",
  "fx.reviewShuffle",
  "fx.countUpStats",
  "fx.bentoBuild",
  "fx.cursorTour",
  "fx.processDraw",
  "fx.beforeAfter",
  "fx.priceRoll",
  "fx.usVsThem",
  "fx.successButton",
];

describe("fx flags", () => {
  it("defines exactly the twelve effect keys, default on", () => {
    expect(Object.keys(FX_FLAGS).sort()).toEqual([...EXPECTED_FLAGS].sort());
    for (const flag of EXPECTED_FLAGS) {
      expect(isFxEnabled(flag), flag).toBe(true);
    }
  });
});

describe("pickRunningLoops (page-wide two-loop cap)", () => {
  it("grants at most two loops, in document order", () => {
    const running = pickRunningLoops([
      { id: "a", order: 0, wants: true },
      { id: "b", order: 1, wants: true },
      { id: "c", order: 2, wants: true },
    ]);
    expect(running).toEqual(new Set(["a", "b"]));
  });

  it("loops that are out of view, hidden, or hovered never take a slot", () => {
    const running = pickRunningLoops([
      { id: "hidden", order: 0, wants: false },
      { id: "b", order: 1, wants: true },
      { id: "c", order: 2, wants: true },
    ]);
    expect(running).toEqual(new Set(["b", "c"]));
  });

  it("a waiting loop takes the next freed slot when a winner stops wanting", () => {
    const running = pickRunningLoops([
      { id: "a", order: 0, wants: false },
      { id: "b", order: 1, wants: true },
      { id: "c", order: 2, wants: true },
    ]);
    expect(running).toEqual(new Set(["b", "c"]));
  });
});

describe("Reduce animations preference", () => {
  beforeEach(() => {
    localStorage.removeItem("revaro.reduceAnimations");
  });

  it("starts off and toggling persists and propagates", () => {
    function Probe() {
      const reduce = useReduceAnimations();
      return <span data-testid="probe">{reduce ? "reduce" : "full"}</span>;
    }
    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("full");
    expect(localStorage.getItem("revaro.reduceAnimations")).toBeNull();

    act(() => setReduceAnimations(true));
    expect(screen.getByTestId("probe")).toHaveTextContent("reduce");
    expect(localStorage.getItem("revaro.reduceAnimations")).toBe("1");

    act(() => setReduceAnimations(false));
    expect(screen.getByTestId("probe")).toHaveTextContent("full");
    expect(localStorage.getItem("revaro.reduceAnimations")).toBeNull();
  });
});

describe("MountWhenNear", () => {
  class FakeIntersectionObserver {
    static last: FakeIntersectionObserver | null = null;
    callback: IntersectionObserverCallback;
    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback;
      FakeIntersectionObserver.last = this;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }

  it("renders nothing until the element is near the viewport", () => {
    const original = globalThis.IntersectionObserver;
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
      FakeIntersectionObserver;

    render(
      <MountWhenNear>
        <p>lazy effect</p>
      </MountWhenNear>,
    );
    expect(screen.queryByText("lazy effect")).not.toBeInTheDocument();

    act(() => {
      FakeIntersectionObserver.last?.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        new FakeIntersectionObserver(() => {}),
      );
    });
    expect(screen.getByText("lazy effect")).toBeInTheDocument();

    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = original;
  });
});
