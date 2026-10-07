import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * Signing secrets for the suites that exercise token and cookie code.
 *
 * These are *test* values, set before any test file imports `server/lib/*`, so a
 * checkout with no `.env` can still run the suite. `dotenv` will not override
 * them (it never overwrites an existing variable), so a developer's real local
 * secrets are untouched, and nothing here is a credential for anything: a token
 * signed with this key is accepted by nothing outside these tests.
 *
 * Minimum length matters — `server/lib/env.ts` refuses short secrets, and a test
 * asserting that refusal needs a *valid* baseline to vary from.
 */
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-0000000000000000000000000000000000000000000";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-00000000000000000000000000000000000000000";

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
