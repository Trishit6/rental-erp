import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A delayed, undoable action.
 *
 * ## Why the delay is the feature, not a debounce
 *
 * A bulk fulfilment writes several orders at once, and a mis-click is expensive
 * to reverse by hand. Rather than committing and then offering a server-side
 * revert (a new pending-state table, an expiry sweeper, and a window in which the
 * database holds a change its owner has not confirmed), nothing is sent until the
 * window elapses. Undo is then simply *not making the request* — there is no
 * second write, no compensating transaction, and no state that can be left behind
 * if the tab closes.
 *
 * ## Leaving the page commits
 *
 * The window is a chance to change your mind, not a promise to hold the action
 * forever. If the user navigates away with a batch pending, the hook commits on
 * unmount rather than silently dropping a change they asked for. The undo control
 * is the only way to cancel, which is what "undo" means.
 *
 * ## A second batch commits the first
 *
 * The page offers one pending batch at a time. Scheduling a new one while an old
 * one is waiting commits the old one immediately, so a batch can never be dropped
 * on the floor by a fast second click.
 */
export function useUndoWindow<T>(commit: (payload: T) => void, delayMs = 5000) {
  const [pending, setPending] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<T | null>(null);
  // The latest `commit` without re-creating `schedule`/`flush` on every render.
  // Synced in an effect, not during render: a ref write during render is exactly
  // what `react-hooks/refs` forbids, and it can tear under concurrent rendering.
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  /** Drop the pending batch without committing it. */
  const undo = useCallback(() => {
    clearTimer();
    pendingRef.current = null;
    setPending(null);
  }, [clearTimer]);

  /** Commit the pending batch now, if there is one. */
  const flush = useCallback(() => {
    clearTimer();
    const payload = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    if (payload !== null) commitRef.current(payload);
  }, [clearTimer]);

  /** Hold a batch for the window. Commits any previously pending batch first. */
  const schedule = useCallback(
    (payload: T) => {
      if (pendingRef.current !== null) {
        clearTimer();
        commitRef.current(pendingRef.current);
      }
      pendingRef.current = payload;
      setPending(payload);
      timer.current = setTimeout(() => {
        const next = pendingRef.current;
        pendingRef.current = null;
        timer.current = null;
        setPending(null);
        if (next !== null) commitRef.current(next);
      }, delayMs);
    },
    [clearTimer, delayMs],
  );

  // Committing on unmount is deliberate — see the note above. `pendingRef` is
  // read through the ref so this effect never needs to re-subscribe.
  useEffect(
    () => () => {
      clearTimer();
      const payload = pendingRef.current;
      pendingRef.current = null;
      if (payload !== null) commitRef.current(payload);
    },
    [clearTimer],
  );

  return { pending, schedule, undo, flush };
}
