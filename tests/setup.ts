import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * jsdom implements neither `matchMedia` nor `ResizeObserver`, both of which
 * framer-motion and Radix reach for. Stub them once so component tests exercise
 * behaviour instead of missing browser APIs.
 *
 * `prefers-reduced-motion` is reported as "reduce" so animations resolve
 * immediately rather than leaving pending frames and act warnings behind.
 */
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: /prefers-reduced-motion/.test(query),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });

  Object.defineProperty(window, "scrollTo", { writable: true, value: () => {} });
}

if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
}

/**
 * jsdom has no IntersectionObserver either, and the cart page uses one to swap
 * its summary column for a sticky mobile bar. The stub never fires, so the
 * desktop layout is what tests see — which is the deterministic choice.
 */
if (typeof globalThis.IntersectionObserver === "undefined") {
  class IntersectionObserverStub {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds: readonly number[] = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
    IntersectionObserverStub;
}

afterEach(() => {
  cleanup();
});
