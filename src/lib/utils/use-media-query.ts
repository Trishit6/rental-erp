import { useCallback, useSyncExternalStore } from "react";

/**
 * Subscribe to a CSS media query.
 *
 * Used where a *layout* decision has to be made in JavaScript rather than CSS.
 * Tailwind's `lg:hidden` can hide an element, but it cannot stop that element
 * from occupying a slot in the floating rail — an invisible control still pushes
 * its neighbours down. Anything conditional about rail membership has to be
 * resolved here.
 *
 * `useSyncExternalStore` rather than a `useState` + `addEventListener` effect:
 * the subscription is the whole point of the hook, and the effect version had to
 * setState synchronously on mount to correct its own initial `false`.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  // The server has no viewport; every current caller is a breakpoint-swapped
  // control that animates in anyway, so the first client render corrects itself
  // before paint.
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** The project's one desktop breakpoint — Tailwind's default `lg`. */
export const DESKTOP_QUERY = "(min-width: 1024px)";
